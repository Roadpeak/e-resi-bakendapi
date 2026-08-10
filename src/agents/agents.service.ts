import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentKind, AgentSpecialty, KybStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
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
    return { data, total };
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
    return { data, total };
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
