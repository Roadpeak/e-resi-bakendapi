import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FurnishingType, KybStatus, LettingStatus, RentManagerKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { slugify, uniqueSlug } from './slug.util.js';

/**
 * Unit ownership and owner lettings.
 *
 * An investor who bought a unit off-plan eventually holds keys, and the next
 * thing most of them want is rent. Three ways of running that are all real:
 * manage it themselves, leave it with the building's developer, or engage a
 * letting agent to find the tenant. This service is that lifecycle — from
 * "this unit is now yours" through "it is listed" to "an agent runs it".
 *
 * The listing an owner creates is an ordinary RentListing, deliberately: the
 * public browse pages, inquiry flow, media pipeline and chat all key on that
 * model, and an owner's unit should appear beside developer listings rather
 * than in a parallel universe. developerId stays the building's developer
 * (branding, property linkage); management rights follow ownerId,
 * managerKind and managingAgentId instead.
 */

const OWNERSHIP_INCLUDE = {
  unit: {
    select: {
      id: true, name: true, floor: true, bedrooms: true, bathrooms: true,
      sqm: true, price: true, currency: true, status: true,
      property: { select: { id: true, slug: true, name: true, heroImageUrl: true, city: true, developerId: true } },
    },
  },
  rentListing: {
    select: {
      id: true, slug: true, name: true, status: true, managerKind: true,
      priceFrom: true, currency: true, heroImageUrl: true,
      managingAgent: { select: { id: true, displayName: true, photoUrl: true, logoUrl: true } },
      lettingEngagements: {
        orderBy: { createdAt: 'desc' as const },
        take: 3,
        select: {
          id: true, status: true, createdAt: true, respondedAt: true,
          agent: { select: { id: true, displayName: true, photoUrl: true, logoUrl: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class OwnershipsService {
  private readonly logger = new Logger(OwnershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  // ─── Establishing ownership ────────────────────────────────────────────────

  /**
   * A completed on-platform purchase becomes an ownership automatically.
   * Called by the reservations service when a stage hits TITLE_TRANSFERRED;
   * idempotent because stage updates can be replayed.
   */
  async grantFromReservation(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, unitId: true, userId: true },
    });
    if (!reservation) return null;
    return this.prisma.unitOwnership.upsert({
      where: { unitId: reservation.unitId },
      create: {
        unitId: reservation.unitId,
        ownerId: reservation.userId,
        reservationId: reservation.id,
      },
      update: {},
    });
  }

  /**
   * Developer records an owner for a sale that happened off-platform.
   * The buyer must already have an account — ownership is a relationship
   * between the platform and a person it can identify, not an email string.
   */
  async record(developerUserId: string, dto: { unitId: string; ownerEmail: string }) {
    const developer = await this.prisma.developerProfile.findUnique({
      where: { userId: developerUserId },
      select: { id: true },
    });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true, name: true, property: { select: { developerId: true, name: true } } },
    });
    if (!unit || unit.property.developerId !== developer.id) {
      throw new NotFoundException('Unit not found');
    }

    const owner = await this.prisma.user.findUnique({
      where: { email: dto.ownerEmail.trim().toLowerCase() },
      select: { id: true, role: true, firstName: true },
    });
    if (!owner) {
      throw new BadRequestException(
        'No account with that email — the buyer needs to sign up first, then you can record them',
      );
    }

    const existing = await this.prisma.unitOwnership.findUnique({ where: { unitId: unit.id } });
    if (existing) throw new BadRequestException('This unit already has a recorded owner');

    const ownership = await this.prisma.unitOwnership.create({
      data: { unitId: unit.id, ownerId: owner.id, recordedById: developerUserId },
    });
    await this.events.ownershipRecorded(owner.id, unit.name, unit.property.name);
    return ownership;
  }

  /** The investor's owned units, with any listing each already has. */
  async mine(userId: string) {
    return this.prisma.unitOwnership.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: OWNERSHIP_INCLUDE,
    });
  }

  // ─── Listing an owned unit ─────────────────────────────────────────────────

  /**
   * Create the rent listing for an owned unit.
   *
   * The building's photography carries over as the hero — the tower is the
   * developer's asset and every unit shares it — but the listing starts with
   * no unit photos of its own, and the UI says so plainly: tenants rent the
   * inside of a unit, not the outside of a building, so the owner uploads
   * their own interior shots (furnished or not) through the media pipeline.
   */
  async createListing(
    userId: string,
    ownershipId: string,
    dto: {
      name?: string;
      description?: string;
      pricePerMonth: number;
      furnishing?: FurnishingType;
      availableFrom?: string;
      minLeaseTerm?: number;
      manage: 'OWNER' | 'DEVELOPER';
    },
  ) {
    const ownership = await this.prisma.unitOwnership.findUnique({
      where: { id: ownershipId },
      include: {
        unit: { include: { property: true } },
        rentListing: { select: { id: true } },
      },
    });
    if (!ownership || ownership.ownerId !== userId) {
      throw new NotFoundException('Ownership not found');
    }
    if (ownership.rentListing) {
      throw new BadRequestException('This unit already has a rent listing');
    }
    if (dto.pricePerMonth <= 0) {
      throw new BadRequestException('Monthly rent must be greater than zero');
    }

    const unit = ownership.unit;
    const property = unit.property;
    const name = dto.name?.trim() || `${unit.name} — ${property.name}`;
    const slug = await uniqueSlug(this.prisma, slugify(name));

    const listing = await this.prisma.rentListing.create({
      data: {
        slug,
        name,
        propertyId: property.id,
        developerId: property.developerId,
        ownerId: userId,
        unitOwnershipId: ownership.id,
        managerKind: dto.manage === 'DEVELOPER' ? RentManagerKind.DEVELOPER : RentManagerKind.OWNER,
        description: dto.description?.trim() || null,
        furnishing: dto.furnishing ?? FurnishingType.UNFURNISHED,
        neighborhood: property.neighborhood,
        city: property.city,
        county: property.county,
        country: property.country,
        latitude: property.latitude,
        longitude: property.longitude,
        // The building's face, adopted — replaced the moment the owner
        // uploads their own hero.
        heroImageUrl: property.heroImageUrl,
        priceFrom: dto.pricePerMonth,
        priceTo: dto.pricePerMonth,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        minLeaseTerm: dto.minLeaseTerm ?? 12,
        rentUnits: {
          create: {
            unitId: unit.id,
            label: unit.name,
            floor: unit.floor,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            sqm: unit.sqm,
            pricePerMonth: dto.pricePerMonth,
            currency: unit.currency,
            furnishing: dto.furnishing ?? FurnishingType.UNFURNISHED,
            available: 1,
            total: 1,
          },
        },
      },
      include: { rentUnits: true },
    });

    if (dto.manage === 'DEVELOPER') {
      // The developer just inherited a listing to run — they should hear so.
      const dev = await this.prisma.developerProfile.findUnique({
        where: { id: property.developerId },
        select: { userId: true },
      });
      if (dev) await this.events.ownerListingDelegated(dev.userId, name);
    }
    return listing;
  }

  // ─── Engaging an agent ─────────────────────────────────────────────────────

  /**
   * Owner invites an agent to let the unit. Re-inviting an agent who
   * declined reuses the row; inviting while another engagement is ACTIVE is
   * refused — one manager at a time is the whole point.
   */
  async inviteAgent(userId: string, listingId: string, agentId: string, message?: string) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { id: listingId },
      select: { id: true, name: true, ownerId: true, managingAgentId: true },
    });
    if (!listing || listing.ownerId !== userId) throw new NotFoundException('Listing not found');
    if (listing.managingAgentId) {
      throw new BadRequestException('An agent already manages this listing — end that first');
    }

    const agent = await this.prisma.agentProfile.findFirst({
      where: { id: agentId, kybStatus: KybStatus.APPROVED, isListed: true },
      select: { id: true, displayName: true, userId: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const existing = await this.prisma.lettingEngagement.findUnique({
      where: { rentListingId_agentId: { rentListingId: listingId, agentId } },
    });
    if (existing?.status === LettingStatus.PENDING) {
      throw new BadRequestException('This agent already has a pending invitation');
    }

    const engagement = existing
      ? await this.prisma.lettingEngagement.update({
          where: { id: existing.id },
          data: {
            status: LettingStatus.PENDING,
            message: message?.trim() || null,
            respondedAt: null,
            endedAt: null,
          },
        })
      : await this.prisma.lettingEngagement.create({
          data: {
            rentListingId: listingId,
            agentId,
            ownerId: userId,
            message: message?.trim() || null,
          },
        });

    await this.events.lettingInvited(agent.userId, listing.name, engagement.id);
    return engagement;
  }

  /** Agent answers. Accepting installs them as the listing's manager. */
  async respond(agentUserId: string, engagementId: string, accept: boolean) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId: agentUserId },
      select: { id: true, displayName: true },
    });
    if (!agent) throw new ForbiddenException('Agent profile required');

    const engagement = await this.prisma.lettingEngagement.findUnique({
      where: { id: engagementId },
      include: { rentListing: { select: { id: true, name: true, managingAgentId: true } } },
    });
    if (!engagement || engagement.agentId !== agent.id) {
      throw new NotFoundException('Engagement not found');
    }
    if (engagement.status !== LettingStatus.PENDING) {
      throw new BadRequestException('This invitation has already been answered');
    }

    if (!accept) {
      const declined = await this.prisma.lettingEngagement.update({
        where: { id: engagementId },
        data: { status: LettingStatus.DECLINED, respondedAt: new Date() },
      });
      await this.events.lettingAnswered(engagement.ownerId, agent.displayName, engagement.rentListing.name, false);
      return declined;
    }
    if (engagement.rentListing.managingAgentId) {
      throw new BadRequestException('Another agent took this listing first');
    }

    const [accepted] = await this.prisma.$transaction([
      this.prisma.lettingEngagement.update({
        where: { id: engagementId },
        data: { status: LettingStatus.ACTIVE, respondedAt: new Date() },
      }),
      this.prisma.rentListing.update({
        where: { id: engagement.rentListingId },
        data: { managingAgentId: agent.id, managerKind: RentManagerKind.AGENT },
      }),
    ]);
    await this.events.lettingAnswered(engagement.ownerId, agent.displayName, engagement.rentListing.name, true);
    return accepted;
  }

  /** Either side ends it; management reverts to the owner. */
  async endEngagement(userId: string, engagementId: string) {
    const engagement = await this.prisma.lettingEngagement.findUnique({
      where: { id: engagementId },
      include: { agent: { select: { userId: true } } },
    });
    if (!engagement || (engagement.ownerId !== userId && engagement.agent.userId !== userId)) {
      throw new NotFoundException('Engagement not found');
    }
    if (engagement.status !== LettingStatus.ACTIVE) {
      throw new BadRequestException('Only an active engagement can be ended');
    }

    const [ended] = await this.prisma.$transaction([
      this.prisma.lettingEngagement.update({
        where: { id: engagementId },
        data: { status: LettingStatus.ENDED, endedAt: new Date() },
      }),
      this.prisma.rentListing.update({
        where: { id: engagement.rentListingId },
        data: { managingAgentId: null, managerKind: RentManagerKind.OWNER },
      }),
    ]);
    return ended;
  }

  /** The agent's letting book — invitations to answer, listings they run. */
  async agentEngagements(agentUserId: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId: agentUserId },
      select: { id: true },
    });
    if (!agent) throw new ForbiddenException('Agent profile required');

    return this.prisma.lettingEngagement.findMany({
      where: { agentId: agent.id, status: { in: [LettingStatus.PENDING, LettingStatus.ACTIVE] } },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
      include: {
        owner: { select: { firstName: true, lastName: true, email: true, phone: true } },
        rentListing: {
          select: {
            id: true, slug: true, name: true, status: true, heroImageUrl: true,
            priceFrom: true, currency: true, city: true, neighborhood: true,
          },
        },
      },
    });
  }
}
