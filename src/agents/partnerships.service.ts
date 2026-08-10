import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PartnershipStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto, paginateMeta } from '../common/dto/pagination.dto.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';

/** Both sides of a partnership, as shown on dashboards and public pages. */
const PARTNERSHIP_INCLUDE = {
  developer: {
    select: { id: true, companyName: true, logoUrl: true, userId: true },
  },
  agent: {
    select: {
      id: true, displayName: true, kind: true, logoUrl: true, photoUrl: true,
      ratingAverage: true, ratingCount: true, specialties: true, userId: true,
    },
  },
} as const;

@Injectable()
export class PartnershipsService {
  private readonly logger = new Logger(PartnershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  /**
   * Resolve who the caller is acting as.
   *
   * Both sides use the same endpoints — a developer and an agent see the same
   * partnership from opposite ends — so every method starts by working out
   * which profile belongs to this user rather than trusting a client-supplied
   * id.
   */
  private async resolveActor(userId: string) {
    const [developer, agent] = await Promise.all([
      this.prisma.developerProfile.findUnique({
        where: { userId },
        select: { id: true, companyName: true },
      }),
      this.prisma.agentProfile.findUnique({
        where: { userId },
        select: { id: true, displayName: true, kybStatus: true },
      }),
    ]);
    if (!developer && !agent) {
      throw new ForbiddenException('Only developers and agents have partnerships');
    }
    return { developerId: developer?.id, agentId: agent?.id, developer, agent };
  }

  /** A partnership the caller is part of, or 404 — never another pair's. */
  private async assertMine(partnershipId: string, userId: string) {
    const partnership = await this.prisma.agentPartnership.findUnique({
      where: { id: partnershipId },
      include: PARTNERSHIP_INCLUDE,
    });
    if (!partnership) throw new NotFoundException('Partnership not found');

    const mine =
      partnership.developer.userId === userId || partnership.agent.userId === userId;
    // 404 rather than 403: whether two other parties work together is not
    // something an outsider should be able to probe.
    if (!mine) throw new NotFoundException('Partnership not found');

    return partnership;
  }

  // ─── Requesting ───────────────────────────────────────────────────────────

  /**
   * Propose a partnership. Either side may start it; the other accepts.
   *
   * Re-requesting after a decline reuses the same row and returns it to
   * PENDING, so a pair never accumulates duplicate requests that each need
   * answering separately.
   */
  async request(
    userId: string,
    target: { agentId?: string; developerId?: string },
    message?: string,
    commissionPercent?: number,
  ) {
    const actor = await this.resolveActor(userId);

    let developerId: string;
    let agentId: string;

    if (actor.developerId) {
      if (!target.agentId) throw new BadRequestException('agentId is required');
      developerId = actor.developerId;
      agentId = target.agentId;
    } else {
      if (!target.developerId) throw new BadRequestException('developerId is required');
      // An unverified agent has proven nothing yet, so cannot tout for work.
      if (actor.agent?.kybStatus !== 'APPROVED') {
        throw new ForbiddenException('Your account must be verified before partnering');
      }
      agentId = actor.agentId!;
      developerId = target.developerId;
    }

    const [agent, developer] = await Promise.all([
      this.prisma.agentProfile.findUnique({
        where: { id: agentId },
        select: { id: true, userId: true, displayName: true, kybStatus: true },
      }),
      this.prisma.developerProfile.findUnique({
        where: { id: developerId },
        select: { id: true, userId: true, companyName: true },
      }),
    ]);
    if (!agent) throw new NotFoundException('Agent not found');
    if (!developer) throw new NotFoundException('Developer not found');
    if (agent.kybStatus !== 'APPROVED') {
      throw new BadRequestException('That agent is not verified yet');
    }

    if (commissionPercent !== undefined) this.assertCommission(commissionPercent);

    const existing = await this.prisma.agentPartnership.findUnique({
      where: { developerId_agentId: { developerId, agentId } },
    });

    if (existing?.status === PartnershipStatus.ACTIVE) {
      throw new BadRequestException('You already work together');
    }
    if (existing?.status === PartnershipStatus.PENDING) {
      throw new BadRequestException('A request is already pending');
    }

    const partnership = existing
      ? await this.prisma.agentPartnership.update({
          where: { id: existing.id },
          data: {
            status: PartnershipStatus.PENDING,
            requestedById: userId,
            message,
            commissionPercent,
            respondedAt: null,
            endedAt: null,
          },
          include: PARTNERSHIP_INCLUDE,
        })
      : await this.prisma.agentPartnership.create({
          data: {
            developerId, agentId, requestedById: userId, message, commissionPercent,
          },
          include: PARTNERSHIP_INCLUDE,
        });

    // Tell the side that has to answer, not the one who just asked.
    const recipientId = actor.developerId ? agent.userId : developer.userId;
    const fromName = actor.developerId
      ? actor.developer!.companyName
      : actor.agent!.displayName;
    try {
      await this.events.partnershipRequested(recipientId, fromName, partnership.id);
    } catch (err) {
      this.logger.error(`Partnership notify failed: ${(err as Error).message}`);
    }

    return partnership;
  }

  /**
   * Accept or decline. Only the side that did NOT request may answer —
   * otherwise a requester could approve their own proposal.
   */
  async respond(partnershipId: string, userId: string, accept: boolean) {
    const partnership = await this.assertMine(partnershipId, userId);

    if (partnership.status !== PartnershipStatus.PENDING) {
      throw new BadRequestException('This request has already been answered');
    }
    if (partnership.requestedById === userId) {
      throw new ForbiddenException('The other side has to answer this request');
    }

    const updated = await this.prisma.agentPartnership.update({
      where: { id: partnershipId },
      data: {
        status: accept ? PartnershipStatus.ACTIVE : PartnershipStatus.DECLINED,
        respondedAt: new Date(),
      },
      include: PARTNERSHIP_INCLUDE,
    });

    const responderIsDeveloper = partnership.developer.userId === userId;
    const recipientId = responderIsDeveloper
      ? partnership.agent.userId
      : partnership.developer.userId;
    const responderName = responderIsDeveloper
      ? partnership.developer.companyName
      : partnership.agent.displayName;
    try {
      await this.events.partnershipAnswered(recipientId, responderName, accept, partnershipId);
    } catch (err) {
      this.logger.error(`Partnership notify failed: ${(err as Error).message}`);
    }

    return updated;
  }

  /** End an active partnership. Assignments under it are closed with it. */
  async end(partnershipId: string, userId: string) {
    const partnership = await this.assertMine(partnershipId, userId);
    if (partnership.status !== PartnershipStatus.ACTIVE) {
      throw new BadRequestException('That partnership is not active');
    }

    // Leaving assignments open would keep properties attributed to an agent
    // who no longer represents them.
    await this.prisma.propertyAssignment.updateMany({
      where: { partnershipId, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    });

    return this.prisma.agentPartnership.update({
      where: { id: partnershipId },
      data: { status: PartnershipStatus.ENDED, endedAt: new Date() },
      include: PARTNERSHIP_INCLUDE,
    });
  }

  // ─── Listing ──────────────────────────────────────────────────────────────

  /** The caller's partnerships, from whichever side they sit on. */
  async listMine(userId: string, pagination: PaginationDto, status?: PartnershipStatus) {
    const actor = await this.resolveActor(userId);
    const where = {
      ...(actor.developerId ? { developerId: actor.developerId } : { agentId: actor.agentId }),
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.agentPartnership.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          ...PARTNERSHIP_INCLUDE,
          _count: { select: { assignments: { where: { isActive: true } } } },
        },
      }),
      this.prisma.agentPartnership.count({ where }),
    ]);
    return { data, meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20) };
  }

  async getOne(partnershipId: string, userId: string) {
    await this.assertMine(partnershipId, userId);
    return this.prisma.agentPartnership.findUnique({
      where: { id: partnershipId },
      include: {
        ...PARTNERSHIP_INCLUDE,
        assignments: {
          where: { isActive: true },
          include: {
            property: {
              select: {
                id: true, slug: true, name: true, heroImageUrl: true,
                city: true, priceFrom: true, currency: true, category: true,
              },
            },
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { uploadedBy: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  /** Active partners for a public profile — either direction. */
  async listPublicPartners(opts: { agentId?: string; developerId?: string }) {
    const where = {
      status: PartnershipStatus.ACTIVE,
      ...(opts.agentId && { agentId: opts.agentId }),
      ...(opts.developerId && { developerId: opts.developerId }),
    };
    return this.prisma.agentPartnership.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        developer: { select: { id: true, companyName: true, logoUrl: true } },
        agent: {
          select: {
            id: true, displayName: true, kind: true, logoUrl: true, photoUrl: true,
            ratingAverage: true, ratingCount: true,
          },
        },
      },
    });
  }

  // ─── Property assignments ─────────────────────────────────────────────────

  private assertCommission(percent: number) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException('Commission must be between 0 and 100 percent');
    }
  }

  /**
   * Hand a property to an agent under an active partnership.
   *
   * Only the developer assigns — it is their listing to delegate — and only
   * their own properties, so a developer cannot attach someone else's stock
   * to an agent.
   */
  async assignProperty(
    partnershipId: string,
    userId: string,
    propertyId: string,
    commissionPercent?: number,
    notes?: string,
  ) {
    const partnership = await this.assertMine(partnershipId, userId);
    if (partnership.developer.userId !== userId) {
      throw new ForbiddenException('Only the developer can assign properties');
    }
    if (partnership.status !== PartnershipStatus.ACTIVE) {
      throw new BadRequestException('Partnership must be active to assign properties');
    }
    if (commissionPercent !== undefined) this.assertCommission(commissionPercent);

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, developerId: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (property.developerId !== partnership.developerId) {
      throw new ForbiddenException('That property is not yours');
    }

    const assignment = await this.prisma.propertyAssignment.upsert({
      where: { partnershipId_propertyId: { partnershipId, propertyId } },
      create: { partnershipId, propertyId, commissionPercent, notes },
      // Re-assigning a previously ended property revives the same row, so its
      // history is kept rather than duplicated.
      update: { isActive: true, endedAt: null, commissionPercent, notes },
      include: { property: { select: { id: true, slug: true, name: true } } },
    });

    try {
      await this.events.propertyAssigned(
        partnership.agent.userId,
        property.name,
        partnership.developer.companyName,
        commissionPercent ?? partnership.commissionPercent ?? null,
      );
    } catch (err) {
      this.logger.error(`Assignment notify failed: ${(err as Error).message}`);
    }

    return assignment;
  }

  async unassignProperty(partnershipId: string, userId: string, propertyId: string) {
    const partnership = await this.assertMine(partnershipId, userId);
    if (partnership.developer.userId !== userId) {
      throw new ForbiddenException('Only the developer can remove assignments');
    }
    const assignment = await this.prisma.propertyAssignment.findUnique({
      where: { partnershipId_propertyId: { partnershipId, propertyId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // Closed rather than deleted, so who represented what stays auditable.
    return this.prisma.propertyAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false, endedAt: new Date() },
    });
  }

  /** Every property currently assigned to the signed-in agent. */
  async myAssignedProperties(userId: string, pagination: PaginationDto) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!agent) throw new ForbiddenException('Agent profile required');

    const where = {
      isActive: true,
      partnership: { agentId: agent.id, status: PartnershipStatus.ACTIVE },
    };

    const [data, total] = await Promise.all([
      this.prisma.propertyAssignment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { assignedAt: 'desc' },
        include: {
          property: {
            select: {
              id: true, slug: true, name: true, heroImageUrl: true, city: true,
              neighborhood: true, priceFrom: true, currency: true, category: true, status: true,
            },
          },
          partnership: {
            select: {
              id: true,
              commissionPercent: true,
              developer: { select: { id: true, companyName: true, logoUrl: true } },
            },
          },
        },
      }),
      this.prisma.propertyAssignment.count({ where }),
    ]);

    return {
      data: data.map((a) => ({
        ...a,
        // The assignment's own rate wins; the partnership default applies
        // where it has none.
        effectiveCommission: a.commissionPercent ?? a.partnership.commissionPercent ?? null,
      })),
      meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20),
    };
  }

  // ─── Agreement documents ──────────────────────────────────────────────────

  /**
   * Attach an agreement. Either side may upload, and both can read every
   * document on the partnership — an agreement one party cannot retrieve is
   * not much of an agreement.
   */
  async addDocument(
    partnershipId: string,
    userId: string,
    doc: { name: string; url: string; kind?: string; sizeBytes?: number },
  ) {
    await this.assertMine(partnershipId, userId);
    return this.prisma.partnershipDocument.create({
      data: { partnershipId, uploadedById: userId, ...doc },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async listDocuments(partnershipId: string, userId: string) {
    await this.assertMine(partnershipId, userId);
    return this.prisma.partnershipDocument.findMany({
      where: { partnershipId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });
  }

  /** Only the uploader may remove their own document. */
  async removeDocument(partnershipId: string, userId: string, documentId: string) {
    await this.assertMine(partnershipId, userId);
    const doc = await this.prisma.partnershipDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.partnershipId !== partnershipId) {
      throw new NotFoundException('Document not found');
    }
    if (doc.uploadedById !== userId) {
      throw new ForbiddenException('Only the uploader can remove this document');
    }
    await this.prisma.partnershipDocument.delete({ where: { id: documentId } });
    return { deleted: true };
  }
}
