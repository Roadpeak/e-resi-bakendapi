import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentKind, AgentSpecialty, KybStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto, paginateMeta } from '../common/dto/pagination.dto.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import type { SubmitAgentKycDto } from './dto/submit-agent-kyc.dto.js';
import type { UpdateAgentProfileDto } from './dto/update-agent-profile.dto.js';

/** Fields safe to expose publicly — never KYC documents or review notes. */
const PUBLIC_AGENT_SELECT = {
  id: true,
  kind: true,
  displayName: true,
  logoUrl: true,
  photoUrl: true,
  bio: true,
  yearsExperience: true,
  website: true,
  specialties: true,
  serviceAreas: true,
  phone: true,
  whatsapp: true,
  email: true,
  officeAddress: true,
  location: true,
  socials: true,
  ratingAverage: true,
  ratingCount: true,
  createdAt: true,
} as const;

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  // ─── Agent: own profile ───────────────────────────────────────────────────

  async getMine(userId: string) {
    const profile = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Agent profile not found');
    return profile;
  }

  async updateMine(userId: string, dto: UpdateAgentProfileDto) {
    const existing = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Agent profile not found');

    // An agent with no specialties matches no search, so clearing the list
    // outright would quietly remove them from the directory.
    if (dto.specialties && dto.specialties.length === 0) {
      throw new BadRequestException('Keep at least one specialty');
    }

    return this.prisma.agentProfile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.yearsExperience !== undefined && { yearsExperience: dto.yearsExperience }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
        ...(dto.specialties !== undefined && { specialties: dto.specialties }),
        ...(dto.serviceAreas !== undefined && { serviceAreas: dto.serviceAreas }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.officeAddress !== undefined && { officeAddress: dto.officeAddress }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.socials !== undefined && { socials: dto.socials as object }),
      },
    });
  }

  // ─── Agent: KYC ───────────────────────────────────────────────────────────

  /**
   * Submit verification documents for review.
   *
   * What is required differs by kind: a company proves it exists and where it
   * trades from; an individual proves who they are and that they are licensed.
   * Re-submitting after a rejection is allowed — that is the whole point of
   * sending back a reason — but not while a submission is already pending.
   */
  async submitKyc(userId: string, dto: SubmitAgentKycDto) {
    const profile = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Agent profile not found');

    if (profile.kybStatus === KybStatus.PENDING) {
      throw new BadRequestException('Your documents are already under review');
    }
    if (profile.kybStatus === KybStatus.APPROVED) {
      throw new BadRequestException('Your account is already verified');
    }

    const docTypes = new Set(dto.documents.map((d) => d.type));

    if (profile.kind === AgentKind.COMPANY) {
      if (!docTypes.has('COMPANY_REGISTRATION')) {
        throw new BadRequestException('A company registration document is required');
      }
      if (!dto.officeAddress?.trim()) {
        throw new BadRequestException('A physical office address is required');
      }
      if (!dto.registrationNumber?.trim()) {
        throw new BadRequestException('A company registration number is required');
      }
    } else {
      if (!docTypes.has('NATIONAL_ID')) {
        throw new BadRequestException('A national ID document is required');
      }
      // The individual is the product — buyers pick a face, not a logo.
      if (!dto.photoUrl?.trim()) {
        throw new BadRequestException('A passport-style photo is required');
      }
    }

    const updated = await this.prisma.agentProfile.update({
      where: { userId },
      data: {
        kybStatus: KybStatus.PENDING,
        kybDocuments: dto.documents as unknown as object,
        kybRejectionReason: null,
        ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
        ...(dto.officeAddress !== undefined && { officeAddress: dto.officeAddress }),
        ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
      },
    });

    // Admins had no signal for a waiting agent otherwise — the queue is
    // poll-only. Never allowed to fail the submission itself.
    try {
      await this.events.agentKycSubmitted(updated.displayName, updated.id);
    } catch (err) {
      this.logger.error(`Could not notify admins of agent KYC: ${(err as Error).message}`);
    }

    return updated;
  }

  // ─── Admin: verification queue ────────────────────────────────────────────

  async listForAdmin(pagination: PaginationDto, kybStatus?: KybStatus, kind?: AgentKind) {
    const where = {
      ...(kybStatus && { kybStatus }),
      ...(kind && { kind }),
    };
    const [data, total] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: [{ kybStatus: 'asc' }, { createdAt: 'desc' }],
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      this.prisma.agentProfile.count({ where }),
    ]);
    return { data, meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20) };
  }

  async getForAdmin(id: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (!profile) throw new NotFoundException('Agent not found');
    return profile;
  }

  /**
   * Approve or reject an agent's documents.
   *
   * Approval alone does not list them: the monthly fee governs `isListed`, so
   * a verified agent still has to be billing-current to appear publicly. That
   * separation is why a payment lapse can hide a profile without ever
   * touching their verified status.
   */
  async review(
    id: string,
    adminId: string,
    status: typeof KybStatus.APPROVED | typeof KybStatus.REJECTED,
    rejectionReason?: string,
  ) {
    const profile = await this.prisma.agentProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Agent not found');

    if (status === KybStatus.REJECTED && !rejectionReason?.trim()) {
      // A rejection with no reason leaves the agent unable to fix anything.
      throw new BadRequestException('Give a reason when rejecting');
    }

    const updated = await this.prisma.agentProfile.update({
      where: { id },
      data: {
        kybStatus: status,
        kybReviewedAt: new Date(),
        kybReviewedBy: adminId,
        kybRejectionReason: status === KybStatus.REJECTED ? rejectionReason : null,
        // First approval starts the free month, so the agent is visible
        // immediately rather than waiting on a billing run.
        ...(status === KybStatus.APPROVED && { isListed: true, suspendedAt: null }),
      },
    });

    try {
      await this.events.agentKycReviewed(
        updated.userId, updated.displayName, status, rejectionReason,
      );
    } catch (err) {
      this.logger.error(`Could not notify agent of review: ${(err as Error).message}`);
    }

    return updated;
  }

  // ─── Public directory ─────────────────────────────────────────────────────

  /**
   * Publicly listed agents, best-rated first.
   *
   * Only approved and currently-listed profiles appear: an unverified agent
   * has proven nothing, and an unpaid one has lapsed. Filtering by specialty
   * is what powers the "Need agent help?" picker on the browse pages.
   */
  async listPublic(
    pagination: PaginationDto,
    filters: { kind?: AgentKind; specialty?: AgentSpecialty; q?: string } = {},
  ) {
    const where = {
      kybStatus: KybStatus.APPROVED,
      isListed: true,
      ...(filters.kind && { kind: filters.kind }),
      ...(filters.specialty && { specialties: { has: filters.specialty } }),
      ...(filters.q && {
        OR: [
          { displayName: { contains: filters.q, mode: 'insensitive' as const } },
          { location: { contains: filters.q, mode: 'insensitive' as const } },
          { bio: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        // Rating decides the order, so the picker surfaces the agents people
        // actually rated well. Ties fall back to who has more reviews.
        orderBy: [
          { ratingAverage: 'desc' },
          { ratingCount: 'desc' },
          { createdAt: 'desc' },
        ],
        select: PUBLIC_AGENT_SELECT,
      }),
      this.prisma.agentProfile.count({ where }),
    ]);
    return { data, meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20) };
  }

  async getPublic(id: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id },
      select: PUBLIC_AGENT_SELECT,
    });
    // An unverified or delisted agent is not "found" publicly, rather than
    // returning a profile the platform has not stood behind.
    if (!profile) throw new NotFoundException('Agent not found');

    const listed = await this.prisma.agentProfile.findFirst({
      where: { id, kybStatus: KybStatus.APPROVED, isListed: true },
      select: { id: true },
    });
    if (!listed) throw new NotFoundException('Agent not found');

    return profile;
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  /**
   * Whether this user is allowed to review this agent.
   *
   * Ratings decide who appears at the top of the picker, so they have to be
   * earned: only someone who actually dealt with the agent may score them.
   * Today that means a conversation with them; assignments become a second
   * route once developer↔agent work lands. Until chat exists nobody qualifies,
   * which is deliberate — an open rating box on a new directory is gamed
   * immediately, by competitors and by the agents themselves.
   */
  async canReview(agentId: string, userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      select: { userId: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    // Reviewing yourself is the most obvious way to inflate a score.
    if (agent.userId === userId) {
      return { allowed: false, reason: 'You cannot review your own profile' };
    }

    const spokeWith = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { initiatorId: userId, counterpartyId: agent.userId },
          { initiatorId: agent.userId, counterpartyId: userId },
        ],
      },
      select: { id: true },
    });
    if (spokeWith) return { allowed: true };

    return {
      allowed: false,
      reason: 'Message this agent before leaving a review',
    };
  }

  /**
   * Leave or update a review. One per person per agent — a second submission
   * replaces the first rather than stacking, so nobody can pile on ratings.
   */
  async upsertReview(agentId: string, userId: string, rating: number, comment?: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be a whole number from 1 to 5');
    }

    const { allowed, reason } = await this.canReview(agentId, userId);
    if (!allowed) throw new ForbiddenException(reason);

    await this.prisma.agentReview.upsert({
      where: { agentId_authorId: { agentId, authorId: userId } },
      create: { agentId, authorId: userId, rating, comment },
      update: { rating, comment },
    });

    return this.recomputeRating(agentId);
  }

  async deleteReview(agentId: string, userId: string, isAdmin = false) {
    const review = await this.prisma.agentReview.findFirst({
      where: { agentId, ...(isAdmin ? {} : { authorId: userId }) },
    });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.agentReview.delete({ where: { id: review.id } });
    return this.recomputeRating(agentId);
  }

  async listReviews(agentId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.agentReview.findMany({
        where: { agentId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          // First name only — a review is public, the reviewer's full identity
          // need not be.
          author: { select: { firstName: true, avatarUrl: true } },
        },
      }),
      this.prisma.agentReview.count({ where: { agentId } }),
    ]);
    return { data, meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20) };
  }

  /**
   * Recalculate and cache the agent's score.
   *
   * Cached on AgentProfile rather than aggregated per request because the
   * directory sorts by it on every page load, and sorting on a computed
   * aggregate across the whole table does not stay cheap.
   */
  private async recomputeRating(agentId: string) {
    const stats = await this.prisma.agentReview.aggregate({
      where: { agentId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return this.prisma.agentProfile.update({
      where: { id: agentId },
      data: {
        // Stored to one decimal — the UI shows "4.5", and keeping full float
        // noise makes ordering look arbitrary between near-identical agents.
        ratingAverage: Math.round((stats._avg.rating ?? 0) * 10) / 10,
        ratingCount: stats._count.rating,
      },
      select: { id: true, ratingAverage: true, ratingCount: true },
    });
  }

  // ─── Admin: listing control ───────────────────────────────────────────────

  /** Manual override — used by billing when a fee lapses, and by admins. */
  async setListed(id: string, isListed: boolean) {
    const profile = await this.prisma.agentProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Agent not found');
    return this.prisma.agentProfile.update({
      where: { id },
      data: { isListed, suspendedAt: isListed ? null : new Date() },
    });
  }
}
