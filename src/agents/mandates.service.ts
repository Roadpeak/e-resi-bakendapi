import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  KybStatus,
  MandateRequestStatus,
  MandateStatus,
  PartnershipStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';

/**
 * The mandate pool — inventory access as the draw.
 *
 * Assignment is developer-initiated and presumes the developer already knows
 * which agent they want. A mandate inverts it: the developer opens a
 * development to the whole verified network with the commission stated up
 * front, agents raise their hands, and accepting a hand creates the
 * partnership and the assignment in one step. This is how off-plan actually
 * distributes in the markets where it works — published commission sheets
 * and launch alerts, not negotiations in the dark.
 *
 * The stated percent is binding: it becomes the assignment's commission on
 * acceptance, so what the pool advertised is what the agent gets.
 */

const MANDATE_PROPERTY_SELECT = {
  id: true,
  slug: true,
  name: true,
  heroImageUrl: true,
  city: true,
  neighborhood: true,
  priceFrom: true,
  currency: true,
  category: true,
  status: true,
} as const;

@Injectable()
export class MandatesService {
  private readonly logger = new Logger(MandatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  private async requireDeveloper(userId: string) {
    const developer = await this.prisma.developerProfile.findUnique({
      where: { userId },
      select: { id: true, companyName: true, userId: true },
    });
    if (!developer) throw new ForbiddenException('Only developers publish mandates');
    return developer;
  }

  private async requireAgent(userId: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true, kybStatus: true, userId: true },
    });
    if (!agent) throw new ForbiddenException('Only agents can request mandates');
    if (agent.kybStatus !== KybStatus.APPROVED) {
      throw new ForbiddenException('The mandate pool unlocks once your verification is approved');
    }
    return agent;
  }

  // ─── Developer side ───────────────────────────────────────────────────────

  /**
   * Open a property to the network — or reopen it on new terms.
   *
   * Upsert by property: the pool must never show the same development twice
   * with different terms, so republishing updates the one row and clears
   * its closed state. Publishing fans a launch alert out to every listed
   * agent, which is the daily-open habit the pool is built on.
   */
  async publish(
    userId: string,
    dto: { propertyId: string; commissionPercent: number; notes?: string; maxAgents?: number },
  ) {
    const developer = await this.requireDeveloper(userId);
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, name: true, developerId: true, status: true },
    });
    if (!property || property.developerId !== developer.id) {
      throw new NotFoundException('Property not found');
    }
    if (property.status !== 'ACTIVE') {
      throw new BadRequestException('Only a live listing can be opened to agents');
    }

    const mandate = await this.prisma.mandate.upsert({
      where: { propertyId: property.id },
      create: {
        developerId: developer.id,
        propertyId: property.id,
        commissionPercent: dto.commissionPercent,
        notes: dto.notes?.trim() || null,
        maxAgents: dto.maxAgents ?? null,
      },
      update: {
        commissionPercent: dto.commissionPercent,
        notes: dto.notes?.trim() || null,
        maxAgents: dto.maxAgents ?? null,
        status: MandateStatus.OPEN,
        closedAt: null,
      },
      include: { property: { select: MANDATE_PROPERTY_SELECT } },
    });

    // Launch alert. In-app only — glanceable, not urgent — and bounded so a
    // huge directory cannot turn one publish into a mail-merge job.
    const agents = await this.prisma.agentProfile.findMany({
      where: { kybStatus: KybStatus.APPROVED, isListed: true },
      select: { userId: true },
      take: 500,
    });
    await Promise.allSettled(
      agents.map((a) =>
        this.events.mandateUpdated(
          a.userId,
          `New mandate: ${property.name}`,
          `${developer.companyName} opened ${property.name} to agents at ${dto.commissionPercent}% commission.`,
          mandate.id,
        ),
      ),
    );
    this.logger.log(`Mandate published for ${property.name} → alerted ${agents.length} agents`);
    return mandate;
  }

  async close(mandateId: string, userId: string) {
    const developer = await this.requireDeveloper(userId);
    const mandate = await this.prisma.mandate.findUnique({ where: { id: mandateId } });
    if (!mandate || mandate.developerId !== developer.id) {
      throw new NotFoundException('Mandate not found');
    }
    return this.prisma.mandate.update({
      where: { id: mandateId },
      data: { status: MandateStatus.CLOSED, closedAt: new Date() },
    });
  }

  /** The developer's mandates, requests included — their review queue. */
  async listMine(userId: string) {
    const developer = await this.requireDeveloper(userId);
    return this.prisma.mandate.findMany({
      where: { developerId: developer.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        property: { select: MANDATE_PROPERTY_SELECT },
        requests: {
          orderBy: { createdAt: 'desc' },
          include: {
            agent: {
              select: {
                id: true, displayName: true, kind: true, photoUrl: true, logoUrl: true,
                ratingAverage: true, ratingCount: true, dealsCompleted: true,
                serviceAreas: true, specialties: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Answer a raised hand.
   *
   * Accepting does the whole handshake at once: the partnership is created
   * or reactivated as ACTIVE, and the property is assigned at the mandate's
   * advertised percent. Both sides already consented — the developer by
   * publishing, the agent by requesting — so making them then walk the
   * separate partnership flow would be ceremony.
   */
  async respond(requestId: string, userId: string, accept: boolean) {
    const developer = await this.requireDeveloper(userId);
    const request = await this.prisma.mandateRequest.findUnique({
      where: { id: requestId },
      include: {
        mandate: { include: { property: { select: { id: true, name: true } } } },
        agent: { select: { id: true, displayName: true, userId: true } },
      },
    });
    if (!request || request.mandate.developerId !== developer.id) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== MandateRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been answered');
    }

    if (!accept) {
      const declined = await this.prisma.mandateRequest.update({
        where: { id: requestId },
        data: { status: MandateRequestStatus.DECLINED, respondedAt: new Date() },
      });
      await this.events.mandateUpdated(
        request.agent.userId,
        `Mandate request declined`,
        `${developer.companyName} declined your request for ${request.mandate.property.name}.`,
        request.mandateId,
        { email: true },
      );
      return declined;
    }

    const accepted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mandateRequest.update({
        where: { id: requestId },
        data: { status: MandateRequestStatus.ACCEPTED, respondedAt: new Date() },
      });

      // Partnership: reuse the pair's row whatever state it is in.
      const partnership = await tx.agentPartnership.upsert({
        where: {
          developerId_agentId: { developerId: developer.id, agentId: request.agentId },
        },
        create: {
          developerId: developer.id,
          agentId: request.agentId,
          status: PartnershipStatus.ACTIVE,
          requestedById: userId,
          respondedAt: new Date(),
        },
        update: { status: PartnershipStatus.ACTIVE, respondedAt: new Date(), endedAt: null },
      });

      // Assignment at the advertised percent — the binding part.
      await tx.propertyAssignment.upsert({
        where: {
          partnershipId_propertyId_kind: {
            partnershipId: partnership.id,
            propertyId: request.mandate.propertyId,
            // Mandates advertise sales work; letting has its own flow.
            kind: 'SALE',
          },
        },
        create: {
          partnershipId: partnership.id,
          propertyId: request.mandate.propertyId,
          commissionPercent: request.mandate.commissionPercent,
          notes: 'Via mandate pool',
        },
        update: {
          isActive: true,
          endedAt: null,
          commissionPercent: request.mandate.commissionPercent,
        },
      });

      // Cap reached → the pool stops advertising it, automatically.
      if (request.mandate.maxAgents != null) {
        const acceptedCount = await tx.mandateRequest.count({
          where: { mandateId: request.mandateId, status: MandateRequestStatus.ACCEPTED },
        });
        if (acceptedCount >= request.mandate.maxAgents) {
          await tx.mandate.update({
            where: { id: request.mandateId },
            data: { status: MandateStatus.CLOSED, closedAt: new Date() },
          });
        }
      }
      return updated;
    });

    await this.events.mandateUpdated(
      request.agent.userId,
      `Mandate granted: ${request.mandate.property.name}`,
      `${developer.companyName} accepted your request. The property is now assigned to you at ${request.mandate.commissionPercent}% commission.`,
      request.mandateId,
      { email: true },
    );
    return accepted;
  }

  // ─── Agent side ───────────────────────────────────────────────────────────

  /**
   * The open pool, as one agent sees it — each mandate carries the status
   * of their own request so the browse page can render "request", "pending"
   * or "granted" without a second call.
   */
  async listOpen(userId: string) {
    const agent = await this.requireAgent(userId);
    const mandates = await this.prisma.mandate.findMany({
      where: { status: MandateStatus.OPEN },
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: MANDATE_PROPERTY_SELECT },
        developer: { select: { id: true, companyName: true, logoUrl: true } },
        requests: {
          where: { agentId: agent.id },
          select: { id: true, status: true, createdAt: true },
        },
        _count: {
          select: { requests: { where: { status: MandateRequestStatus.ACCEPTED } } },
        },
      },
    });
    return mandates.map(({ requests, _count, ...m }) => ({
      ...m,
      myRequest: requests[0] ?? null,
      acceptedAgents: _count.requests,
    }));
  }

  async request(mandateId: string, userId: string, message?: string) {
    const agent = await this.requireAgent(userId);
    const mandate = await this.prisma.mandate.findUnique({
      where: { id: mandateId },
      include: {
        property: { select: { name: true } },
        developer: { select: { userId: true, companyName: true } },
      },
    });
    if (!mandate) throw new NotFoundException('Mandate not found');
    if (mandate.status !== MandateStatus.OPEN) {
      throw new BadRequestException('This mandate is no longer open');
    }

    const existing = await this.prisma.mandateRequest.findUnique({
      where: { mandateId_agentId: { mandateId, agentId: agent.id } },
    });
    if (existing?.status === MandateRequestStatus.PENDING) {
      throw new BadRequestException('Your request is already pending');
    }
    if (existing?.status === MandateRequestStatus.ACCEPTED) {
      throw new BadRequestException('You already hold this mandate');
    }

    // Re-requesting after a decline or withdrawal reuses the row — same
    // rule as partnerships, and for the same reason.
    const request = existing
      ? await this.prisma.mandateRequest.update({
          where: { id: existing.id },
          data: {
            status: MandateRequestStatus.PENDING,
            message: message?.trim() || null,
            respondedAt: null,
          },
        })
      : await this.prisma.mandateRequest.create({
          data: { mandateId, agentId: agent.id, message: message?.trim() || null },
        });

    await this.events.mandateUpdated(
      mandate.developer.userId,
      `Mandate request: ${mandate.property.name}`,
      `${agent.displayName} wants to sell ${mandate.property.name}.`,
      mandateId,
      { email: true },
    );
    return request;
  }

  async withdraw(mandateId: string, userId: string) {
    const agent = await this.requireAgent(userId);
    const existing = await this.prisma.mandateRequest.findUnique({
      where: { mandateId_agentId: { mandateId, agentId: agent.id } },
    });
    if (!existing || existing.status !== MandateRequestStatus.PENDING) {
      throw new NotFoundException('No pending request to withdraw');
    }
    return this.prisma.mandateRequest.update({
      where: { id: existing.id },
      data: { status: MandateRequestStatus.WITHDRAWN, respondedAt: new Date() },
    });
  }
}
