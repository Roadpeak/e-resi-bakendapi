import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { resolveAppUrl } from '../common/app-url.js';

/** Dashboard pages a developer can delegate. Overview is always granted. */
export const STAFF_PAGES = [
  'properties', 'units', 'reservations', 'rentals', 'messages', 'partners',
  'deals', 'mandates', 'inquiries', 'bookings', 'performance', 'analytics',
  'documents', 'billing', 'profile', 'team',
] as const;

const INVITE_TTL_DAYS = 7;

/**
 * A developer's team. Staff are their own Users for login; the JWT layer
 * makes their requests act as the employer, so every existing service works
 * unchanged — the pages list is what the dashboard renders for them.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  private async developerOf(userId: string) {
    const dev = await this.prisma.developerProfile.findUnique({
      where: { userId },
      select: { id: true, companyName: true },
    });
    if (!dev) throw new ForbiddenException('Developer profile required');
    return dev;
  }

  private sanitizePages(pages: string[]): string[] {
    const valid = new Set<string>(STAFF_PAGES);
    const out = [...new Set(pages.filter((p) => valid.has(p)))];
    if (out.length === 0) {
      throw new BadRequestException('Grant at least one page');
    }
    return out;
  }

  // ─── Developer: manage the team ───────────────────────────────────────────

  async list(userId: string) {
    const dev = await this.developerOf(userId);
    const staff = await this.prisma.developerStaff.findMany({
      where: { developerId: dev.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, lastLoginAt: true } },
      },
    });
    return staff.map(({ inviteToken, ...s }) => s);
  }

  async invite(userId: string, dto: { email: string; name?: string; pages: string[] }) {
    const dev = await this.developerOf(userId);
    const email = dto.email.trim().toLowerCase();
    const pages = this.sanitizePages(dto.pages);

    // The employer's own login must not become a staff account of itself.
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (owner?.email.toLowerCase() === email) {
      throw new BadRequestException('That is your own account email');
    }

    const existing = await this.prisma.developerStaff.findUnique({
      where: { developerId_email: { developerId: dev.id, email } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new BadRequestException('This person is already on your team');
    }

    const inviteToken = randomBytes(32).toString('hex');
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    const staff = existing
      ? await this.prisma.developerStaff.update({
          where: { id: existing.id },
          data: { name: dto.name, pages, status: 'INVITED', inviteToken, inviteExpiresAt },
        })
      : await this.prisma.developerStaff.create({
          data: {
            developerId: dev.id, email, name: dto.name, pages,
            inviteToken, inviteExpiresAt,
          },
        });

    const link = `${this.appUrl}/staff-invite?token=${inviteToken}`;
    await this.mail.sendNotice(
      email,
      `${dev.companyName} invited you to their e-resi dashboard`,
      'You have been invited',
      `${dev.companyName} wants you on their team on e-resi. You'll get access to: `
        + `${pages.join(', ')}. Set your password to get started — the link is valid for ${INVITE_TTL_DAYS} days.`,
      { label: 'Accept invitation', url: link },
    );

    const { inviteToken: _, ...safe } = staff;
    return safe;
  }

  async update(userId: string, staffId: string, dto: { pages?: string[]; name?: string }) {
    const dev = await this.developerOf(userId);
    const staff = await this.prisma.developerStaff.findFirst({
      where: { id: staffId, developerId: dev.id },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    const updated = await this.prisma.developerStaff.update({
      where: { id: staff.id },
      data: {
        ...(dto.pages !== undefined && { pages: this.sanitizePages(dto.pages) }),
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
    const { inviteToken: _, ...safe } = updated;
    return safe;
  }

  /** Revoking keeps the row (and its activity) as the audit trail. */
  async revoke(userId: string, staffId: string) {
    const dev = await this.developerOf(userId);
    const staff = await this.prisma.developerStaff.findFirst({
      where: { id: staffId, developerId: dev.id },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    await this.prisma.developerStaff.update({
      where: { id: staff.id },
      data: { status: 'REVOKED', inviteToken: null, inviteExpiresAt: null },
    });
    return { message: 'Access revoked' };
  }

  // ─── Invite acceptance (public) ───────────────────────────────────────────

  async inviteDetails(token: string) {
    const staff = await this.prisma.developerStaff.findUnique({
      where: { inviteToken: token },
      include: { developer: { select: { companyName: true, logoUrl: true } } },
    });
    if (!staff || staff.status !== 'INVITED') {
      throw new NotFoundException('This invitation is no longer valid');
    }
    if (staff.inviteExpiresAt && staff.inviteExpiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired — ask for a new one');
    }
    return {
      email: staff.email,
      name: staff.name,
      pages: staff.pages,
      company: staff.developer.companyName,
      logoUrl: staff.developer.logoUrl,
    };
  }

  async acceptInvite(token: string, dto: { password: string; firstName: string; lastName: string }) {
    const staff = await this.prisma.developerStaff.findUnique({
      where: { inviteToken: token },
    });
    if (!staff || staff.status !== 'INVITED') {
      throw new NotFoundException('This invitation is no longer valid');
    }
    if (staff.inviteExpiresAt && staff.inviteExpiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired — ask for a new one');
    }
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // One person may already have an account (say, as a buyer). Linking the
    // existing account keeps one login per human; a fresh email gets a new
    // user. Either way the account is DEVELOPER-typed so the dashboard opens.
    const hashed = await bcrypt.hash(dto.password, 10);
    let user = await this.prisma.user.findUnique({ where: { email: staff.email } });
    if (user) {
      const membership = await this.prisma.developerStaff.findUnique({ where: { userId: user.id } });
      if (membership && membership.id !== staff.id) {
        throw new BadRequestException('This account already belongs to another team');
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, role: 'DEVELOPER', emailVerified: true },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: staff.email,
          password: hashed,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: 'DEVELOPER',
          // The invite email reached them — that IS the verification.
          emailVerified: true,
        },
      });
    }

    await this.prisma.developerStaff.update({
      where: { id: staff.id },
      data: { userId: user.id, status: 'ACTIVE', inviteToken: null, inviteExpiresAt: null },
    });

    return { email: staff.email };
  }

  // ─── Activity & productivity ──────────────────────────────────────────────

  /** Fire-and-forget log of one operation. Never throws into the request. */
  async recordActivity(staffId: string, method: string, path: string) {
    try {
      // "/api/properties/slug/units/x" → "properties"
      const area = path.replace(/^\/api\//, '').split('/')[0] || null;
      await this.prisma.staffActivity.create({
        data: { staffId, method, path: path.slice(0, 300), area },
      });
    } catch (err) {
      this.logger.error(`Activity log failed: ${(err as Error).message}`);
    }
  }

  /**
   * One staff member's operations and a productivity read. The rating is a
   * transparent 0–100: activity volume (50), consistency of active days
   * (30), and breadth of areas touched (20) over the last 30 days.
   */
  async activity(userId: string, staffId: string) {
    const dev = await this.developerOf(userId);
    const staff = await this.prisma.developerStaff.findFirst({
      where: { id: staffId, developerId: dev.id },
      include: { user: { select: { firstName: true, lastName: true, lastLoginAt: true } } },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    const since = new Date(Date.now() - 30 * 86_400_000);
    const [logs, monthOps] = await Promise.all([
      this.prisma.staffActivity.findMany({
        where: { staffId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.staffActivity.findMany({
        where: { staffId, createdAt: { gte: since } },
        select: { createdAt: true, area: true },
      }),
    ]);

    const activeDays = new Set(monthOps.map((o) => o.createdAt.toISOString().slice(0, 10)));
    const areas = new Set(monthOps.map((o) => o.area).filter(Boolean));
    const byArea: Record<string, number> = {};
    for (const o of monthOps) {
      if (o.area) byArea[o.area] = (byArea[o.area] ?? 0) + 1;
    }

    // 40 ops/month = full volume marks; 12 active days = full consistency;
    // 4 areas = full breadth. Deliberately reachable by a normal workload.
    const rating = Math.min(100, Math.round(
      Math.min(1, monthOps.length / 40) * 50
      + Math.min(1, activeDays.size / 12) * 30
      + Math.min(1, areas.size / 4) * 20,
    ));

    const { inviteToken: _, ...safe } = staff;
    return {
      staff: safe,
      stats: {
        totalOps30d: monthOps.length,
        activeDays30d: activeDays.size,
        byArea,
        rating,
      },
      logs,
    };
  }
}
