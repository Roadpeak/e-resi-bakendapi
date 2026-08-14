import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InquiryStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateInquiryDto } from './dto/create-inquiry.dto.js';
import type { ReplyInquiryDto } from './dto/reply-inquiry.dto.js';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  // ─── Submit (public / authenticated) ─────────────────────────────────────

  /**
   * Validate a referral before crediting it.
   *
   * The id arrives from a query string on a link anyone can edit, so it is
   * treated as a claim, not a fact: an unknown, unverified or delisted agent
   * is ignored rather than rejected. Failing the lead would punish the buyer
   * for a bad link — losing the credit only affects the referral.
   */
  private async resolveAgent(agentId?: string): Promise<string | null> {
    if (!agentId) return null;
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      select: { id: true, kybStatus: true },
    });
    if (!agent || agent.kybStatus !== 'APPROVED') return null;
    return agent.id;
  }

  async create(dto: CreateInquiryDto, userId?: string) {
    if (!dto.propertySlug && !dto.rentListingId) {
      throw new BadRequestException('Either propertySlug or rentListingId is required');
    }

    let propertyId: string | undefined;
    if (dto.propertySlug) {
      const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
      if (!property) throw new NotFoundException('Property not found');
      propertyId = property.id;
    }

    if (dto.rentListingId) {
      const listing = await this.prisma.rentListing.findUnique({ where: { id: dto.rentListingId } });
      if (!listing) throw new NotFoundException('Rent listing not found');
    }

    const agentId = await this.resolveAgent(dto.agentId);

    const inquiry = await this.prisma.inquiry.create({
      data: {
        ...(agentId && { agentId }),
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
        interestedUnit: dto.interestedUnit,
        ...(propertyId && { propertyId }),
        ...(dto.rentListingId && { rentListingId: dto.rentListingId }),
        ...(userId && { userId }),
      },
      include: { property: { select: { name: true } } },
    });

    await this.events.newInquiry(
      inquiry.property?.name ?? 'a listing', dto.name, inquiry.id,
    );
    return inquiry;
  }

  // ─── Developer: list inquiries for own properties ─────────────────────────

  async findForDeveloper(userId: string, pagination: PaginationDto, status?: InquiryStatus) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const propertyIds = await this.prisma.property
      .findMany({ where: { developerId: developer.id }, select: { id: true } })
      .then((ps) => ps.map((p) => p.id));

    const rentListingIds = await this.prisma.rentListing
      .findMany({ where: { developerId: developer.id }, select: { id: true } })
      .then((rs) => rs.map((r) => r.id));

    const where = {
      OR: [
        { propertyId: { in: propertyIds } },
        { rentListingId: { in: rentListingIds } },
      ],
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { slug: true, name: true } },
          rentListing: { select: { slug: true, name: true } },
          replies: { orderBy: { createdAt: 'asc' } },
          // Who introduced this lead, when a partnered agent did — the
          // developer should see that on the lead itself, not only in a
          // report.
          agent: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── User: my own inquiries ───────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { slug: true, name: true, heroImageUrl: true } },
          rentListing: { select: { slug: true, name: true, heroImageUrl: true } },
          replies: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.inquiry.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Get single inquiry ───────────────────────────────────────────────────

  async findOne(id: string, requesterId: string, requesterRole: UserRole) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        property: { include: { developer: true } },
        rentListing: { include: { developer: true } },
        replies: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } } } },
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');

    const isOwner = inquiry.userId === requesterId;
    const isDeveloperOfProperty = inquiry.property?.developer.userId === requesterId;
    const isDeveloperOfListing = inquiry.rentListing?.developer.userId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isOwner && !isDeveloperOfProperty && !isDeveloperOfListing && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return inquiry;
  }

  // ─── Reply ────────────────────────────────────────────────────────────────

  async reply(id: string, senderId: string, senderRole: UserRole, dto: ReplyInquiryDto) {
    await this.findOne(id, senderId, senderRole);

    const [reply] = await this.prisma.$transaction([
      this.prisma.inquiryReply.create({
        data: { inquiryId: id, senderId, message: dto.message },
        include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.inquiry.update({
        where: { id },
        data: { status: InquiryStatus.REPLIED },
      }),
    ]);

    // A reply used to be a database row and an email, and the thread died
    // there — the person who enquired had nowhere to answer. When they have
    // an account, the reply also opens (or reuses) a chat thread so the
    // conversation can continue in one place.
    //
    // Detached and swallowed: the reply is already saved, and a chat failure
    // must not fail the developer's response.
    void this.linkConversation(id, senderId).catch(() => undefined);

    return reply;
  }

  /**
   * Attach this inquiry to a chat thread between the two people.
   *
   * Guest inquiries have no userId, so there is nobody to open a thread with
   * — those stay email-only, which is the correct outcome rather than a
   * limitation to work around.
   */
  private async linkConversation(inquiryId: string, developerUserId: string): Promise<void> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { id: true, userId: true, propertyId: true, rentListingId: true, conversationId: true },
    });
    if (!inquiry || !inquiry.userId || inquiry.conversationId) return;
    if (inquiry.userId === developerUserId) return;

    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { initiatorId: inquiry.userId, counterpartyId: developerUserId },
          { initiatorId: developerUserId, counterpartyId: inquiry.userId },
        ],
        ...(inquiry.propertyId ? { propertyId: inquiry.propertyId } : {}),
      },
      select: { id: true },
    });

    const conversationId = existing?.id ?? (
      await this.prisma.conversation.create({
        data: {
          initiatorId: inquiry.userId,
          counterpartyId: developerUserId,
          propertyId: inquiry.propertyId,
          rentListingId: inquiry.rentListingId,
        },
        select: { id: true },
      })
    ).id;

    await this.prisma.inquiry.update({
      where: { id: inquiryId },
      data: { conversationId },
    });
  }

  // ─── Update status ────────────────────────────────────────────────────────

  async updateStatus(id: string, userId: string, userRole: UserRole, status: InquiryStatus) {
    await this.findOne(id, userId, userRole);
    return this.prisma.inquiry.update({ where: { id }, data: { status } });
  }

  // ─── Admin: all inquiries ─────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, status?: InquiryStatus) {
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { slug: true, name: true } },
          rentListing: { select: { slug: true, name: true } },
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }
}
