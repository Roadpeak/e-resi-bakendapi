import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SupportStatus, type User, type UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { resolveAppUrl } from '../common/app-url.js';
import type { AdminSupportQueryDto, CreateSupportThreadDto } from './dto/support.dto.js';

/** request.user as the JWT strategy builds it — a staff member rides on their employer. */
export type SupportActor = (User & {
  staff?: { userId: string; email: string; firstName: string; lastName: string } | null;
}) | null;

const CATEGORY_LABEL: Record<string, string> = {
  ENQUIRY: 'General enquiry',
  HELP: 'Help request',
  ACCOUNT: 'Account',
  BILLING: 'Billing',
  PARTNERSHIP: 'Partnership',
  OTHER: 'Other',
};

const messageOrder = { orderBy: { createdAt: 'asc' as const } };

/**
 * Conversations between people and the e-resi team.
 *
 * Anyone can write in — a signed-in user of any role, or a visitor who leaves
 * an email or phone number. Signed-in users see the thread in their portal
 * and get in-app notifications; visitors hold an access token (kept in their
 * browser and carried in the reply email link) instead of an account.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly events: PlatformEventsService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  // ─── People writing in ───────────────────────────────────────────────────

  async create(dto: CreateSupportThreadDto, actor: SupportActor) {
    const who = this.identify(dto, actor);
    const subject = dto.subject?.slice(0, 140)
      || this.subjectFrom(dto.message)
      || CATEGORY_LABEL[dto.category ?? 'ENQUIRY'];

    const thread = await this.prisma.supportThread.create({
      data: {
        userId: actor?.id ?? null,
        role: (actor?.role as UserRole | undefined) ?? null,
        name: who.name,
        email: who.email,
        phone: who.phone,
        category: dto.category ?? 'ENQUIRY',
        subject,
        accessToken: randomBytes(24).toString('base64url'),
        pageUrl: dto.pageUrl ?? null,
        messages: {
          create: { body: dto.message, authorId: who.authorId, authorName: who.name },
        },
      },
      include: { messages: messageOrder },
    });

    void this.events.supportThreadOpened(who.name, subject, thread.id);
    return this.forPerson(thread);
  }

  /** Threads a signed-in user started (any role; staff share their employer's). */
  async mine(actor: NonNullable<SupportActor>) {
    const threads = await this.prisma.supportThread.findMany({
      where: { userId: actor.id },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return threads.map(({ messages, accessToken: _t, adminUnread: _a, ...t }) => ({
      ...t,
      lastMessage: messages[0] ?? null,
    }));
  }

  async getForPerson(id: string, actor: SupportActor, token?: string) {
    const thread = await this.authorised(id, actor, token);
    if (thread.userUnread) {
      await this.prisma.supportThread.update({ where: { id }, data: { userUnread: false } });
    }
    const full = await this.prisma.supportThread.findUniqueOrThrow({
      where: { id },
      include: { messages: messageOrder },
    });
    return this.forPerson({ ...full, userUnread: false });
  }

  async replyAsPerson(id: string, body: string, actor: SupportActor, token?: string) {
    const thread = await this.authorised(id, actor, token);
    const authorName = actor
      ? this.displayName(actor)
      : thread.name;

    await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: { threadId: id, body, authorId: actor?.id ?? null, authorName },
      }),
      this.prisma.supportThread.update({
        where: { id },
        // A new message reopens a resolved conversation.
        data: { lastMessageAt: new Date(), adminUnread: true, userUnread: false, status: 'OPEN' },
      }),
    ]);

    void this.events.supportUserReplied(authorName, thread.subject, id);
    return this.getForPerson(id, actor, token);
  }

  /** Unread replies from the team, for a badge on the support button. */
  async unreadCount(actor: NonNullable<SupportActor>) {
    const count = await this.prisma.supportThread.count({ where: { userId: actor.id, userUnread: true } });
    return { count };
  }

  // ─── The e-resi team ─────────────────────────────────────────────────────

  async adminList(query: AdminSupportQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.SupportThreadWhereInput = {};
    const filter = query.filter ?? 'OPEN';
    if (filter === 'OPEN') where.status = 'OPEN';
    if (filter === 'RESOLVED') where.status = 'RESOLVED';
    if (filter === 'UNREAD') where.adminUnread = true;
    if (query.q) {
      const q = query.q;
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { subject: { contains: q, mode: 'insensitive' } },
        { messages: { some: { body: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [items, total, open, unread, resolved] = await Promise.all([
      this.prisma.supportThread.findMany({
        where,
        orderBy: [{ adminUnread: 'desc' }, { lastMessageAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportThread.count({ where }),
      this.prisma.supportThread.count({ where: { status: 'OPEN' } }),
      this.prisma.supportThread.count({ where: { adminUnread: true } }),
      this.prisma.supportThread.count({ where: { status: 'RESOLVED' } }),
    ]);

    return {
      items: items.map(({ messages, accessToken: _t, _count, ...t }) => ({
        ...t,
        messageCount: _count.messages,
        lastMessage: messages[0] ?? null,
      })),
      total,
      page,
      limit,
      counts: { open, unread, resolved },
    };
  }

  async adminGet(id: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id },
      include: {
        messages: messageOrder,
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true, role: true,
            developerProfile: { select: { id: true, companyName: true, logoUrl: true } },
            agentProfile: { select: { id: true, displayName: true, logoUrl: true, photoUrl: true } },
          },
        },
      },
    });
    if (!thread) throw new NotFoundException('Conversation not found');
    if (thread.adminUnread) {
      await this.prisma.supportThread.update({ where: { id }, data: { adminUnread: false } });
    }
    const { accessToken: _t, ...rest } = thread;
    return { ...rest, adminUnread: false, delivery: this.deliveryFor(thread) };
  }

  async adminReply(id: string, body: string, admin: NonNullable<SupportActor>) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Conversation not found');

    await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          threadId: id,
          body,
          fromAdmin: true,
          authorId: admin.id,
          authorName: `${admin.firstName} · e-resi`,
        },
      }),
      this.prisma.supportThread.update({
        where: { id },
        data: { lastMessageAt: new Date(), userUnread: true, adminUnread: false },
      }),
    ]);

    const excerpt = body.length > 280 ? `${body.slice(0, 277)}…` : body;
    let emailed = false;
    if (thread.userId) {
      void this.events.supportAdminReplied(thread.userId, thread.role, thread.subject, excerpt, id);
    } else if (thread.email) {
      emailed = await this.mail.sendNotice(
        thread.email,
        `Re: ${thread.subject}`,
        `Hi ${thread.name.split(' ')[0]}, the e-resi team replied`,
        body,
        { label: 'View the conversation', url: `${this.appUrl}/?support=${id}&t=${thread.accessToken}` },
      );
      if (!emailed) this.logger.warn(`Support reply email to visitor failed for thread ${id}`);
    }

    return { ...(await this.adminGet(id)), emailed };
  }

  async adminSetStatus(id: string, status: SupportStatus) {
    await this.prisma.supportThread.update({ where: { id }, data: { status } }).catch(() => {
      throw new NotFoundException('Conversation not found');
    });
    return this.adminGet(id);
  }

  async adminUnreadCount() {
    return { count: await this.prisma.supportThread.count({ where: { adminUnread: true } }) };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private identify(dto: CreateSupportThreadDto, actor: SupportActor) {
    if (actor) {
      return {
        name: this.displayName(actor),
        email: actor.staff?.email ?? actor.email,
        phone: dto.phone ?? actor.phone ?? null,
        authorId: actor.id,
      };
    }
    if (!dto.name) throw new BadRequestException('Please tell us your name');
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Leave an email address or phone number so we can reply');
    }
    return { name: dto.name, email: dto.email?.toLowerCase() ?? null, phone: dto.phone ?? null, authorId: null };
  }

  private displayName(actor: NonNullable<SupportActor>) {
    const person = actor.staff ?? actor;
    return `${person.firstName} ${person.lastName}`.trim() || person.email;
  }

  private subjectFrom(message: string) {
    const line = message.split('\n')[0].trim();
    return line.length > 80 ? `${line.slice(0, 77)}…` : line;
  }

  /** Owner by account, or holder of the access token. */
  private async authorised(id: string, actor: SupportActor, token?: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Conversation not found');
    const owns = !!actor && thread.userId === actor.id;
    const holdsToken = !!token && token === thread.accessToken;
    if (!owns && !holdsToken) throw new ForbiddenException('You cannot open this conversation');
    return thread;
  }

  /** How a reply reaches this person — shown beside the admin's reply box. */
  private deliveryFor(t: { userId: string | null; email: string | null; phone: string | null }) {
    if (t.userId) return 'ACCOUNT' as const;
    if (t.email) return 'EMAIL' as const;
    return 'PHONE' as const;
  }

  private forPerson<T extends { accessToken: string; adminUnread: boolean }>(thread: T) {
    const { adminUnread: _a, ...rest } = thread;
    return rest;
  }
}
