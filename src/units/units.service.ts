import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { UpdateUnitDto } from './dto/update-unit.dto.js';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPropertyOwner(propertySlug: string, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug: propertySlug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }
    return property;
  }

  async create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateUnitDto) {
    const property = await this.assertPropertyOwner(propertySlug, userId, userRole);
    return this.prisma.unit.create({
      data: {
        propertyId: property.id,
        name: dto.name,
        floor: dto.floor,
        bedrooms: dto.bedrooms ?? 1,
        bathrooms: dto.bathrooms ?? 1,
        sqm: dto.sqm,
        price: dto.price,
        // Inherited from the development rather than left to the column
        // default. A developer who priced their development in USD set that
        // once, on the property; falling back to the schema's "KES" published
        // their USD prices as shillings — a 130× error in the buyer's favour.
        currency: (dto.currency ?? property.currency ?? 'KES').toUpperCase(),
        status: dto.status ?? 'AVAILABLE',
        features: dto.features ?? [],
        floorPlanId: dto.floorPlanId,
      },
    });
  }

  async findAll(propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.unit.findMany({
      where: { propertyId: property.id },
      orderBy: [{ floor: 'asc' }, { price: 'asc' }],
    });
  }

  /**
   * Public unit detail — enriched with the parent property, its gallery
   * images, cinematic scenes and the unit's floor plan so the unit page can
   * stand on its own.
   */
  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true, slug: true, name: true, tagline: true, city: true,
            neighborhood: true, county: true, heroImageUrl: true, currency: true,
            hasCinematicTour: true, has3DTour: true, hasVRTour: true,
            developer: { select: { companyName: true, logoUrl: true } },
            media: { orderBy: { order: 'asc' } },
            cinematicScenes: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');

    /**
     * The unit's own layout.
     *
     * A developer can name the plan explicitly, and that always wins. Most
     * have not: floorPlanId is null on every unit in production, while the
     * plans themselves exist and are already labelled by bedroom count
     * ("Type B — 2 Bedroom"). So when nothing is linked, the plan matching
     * this unit's bedroom count is used — which is how a buyer would read the
     * brochure anyway.
     *
     * Only when exactly one plan matches. Two 2-bed layouts are a real case,
     * and guessing between them would show the wrong rooms with no sign that
     * it was a guess.
     */
    let floorPlan = unit.floorPlanId
      ? await this.prisma.floorPlan.findUnique({ where: { id: unit.floorPlanId } })
      : null;

    if (!floorPlan) {
      const matches = await this.prisma.floorPlan.findMany({
        where: { propertyId: unit.propertyId, bedrooms: unit.bedrooms },
        orderBy: { order: 'asc' },
      });
      if (matches.length === 1) floorPlan = matches[0];
    }

    return { ...unit, floorPlan };
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (userRole !== UserRole.ADMIN && unit.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this unit');
    }

    // The reservation pipeline is the single source of truth for a unit's
    // sale status. While a live reservation holds the unit — or a completed
    // one has already made someone its owner — a manual status flip would
    // silently contradict the record the buyer is watching, so it is
    // refused with a pointer to the right lever.
    if (dto.status !== undefined && dto.status !== unit.status) {
      const [inFlight, ownership] = await Promise.all([
        this.prisma.reservation.findFirst({
          where: {
            unitId: id,
            stage: {
              in: [
                'RESERVED',
                'AGREEMENT_SIGNED',
                'DEPOSIT_PAID',
                'FINAL_PAYMENT',
              ],
            },
          },
          select: { id: true },
        }),
        this.prisma.unitOwnership.findFirst({ where: { unitId: id }, select: { id: true } }),
      ]);
      if (inFlight) {
        throw new BadRequestException(
          'This unit is held by an active reservation — its status follows the purchase pipeline. Advance or cancel the reservation instead.',
        );
      }
      if (ownership) {
        throw new BadRequestException(
          'This unit has a recorded owner — its status is determined by the completed sale.',
        );
      }
    }

    return this.prisma.unit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.bedrooms !== undefined && { bedrooms: dto.bedrooms }),
        ...(dto.bathrooms !== undefined && { bathrooms: dto.bathrooms }),
        ...(dto.sqm !== undefined && { sqm: dto.sqm }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.features !== undefined && { features: dto.features }),
        // An empty string clears the link, so the bedroom fallback takes over
        // again rather than the unit being stuck on a plan that was removed.
        ...(dto.floorPlanId !== undefined && { floorPlanId: dto.floorPlanId || null }),
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (userRole !== UserRole.ADMIN && unit.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this unit');
    }
    await this.prisma.unit.delete({ where: { id } });
    return { message: 'Unit deleted' };
  }


  /**
   * The developer's whole unit inventory, with who holds what.
   *
   * The units page used to be a status column and nothing else — RESERVED
   * with no way to see reserved *for whom*, which is exactly the information
   * that prevents the same unit being promised twice. Each unit here carries
   * its live context: the deal holding it (client + agent + stage) and any
   * platform reservation, so the table reads as an allocation board rather
   * than a list.
   */
  async portfolio(userId: string) {
    const developer = await this.prisma.developerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const units = await this.prisma.unit.findMany({
      where: { property: { developerId: developer.id } },
      orderBy: [{ propertyId: 'asc' }, { name: 'asc' }],
      include: {
        property: { select: { id: true, slug: true, name: true } },
        deals: {
          where: { stage: { in: ['RESERVED', 'SPA_SIGNED', 'COMPLETED'] } },
          orderBy: { stageChangedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            stage: true,
            clientName: true,
            agent: { select: { id: true, displayName: true } },
          },
        },
        reservations: {
          // Expiry only means anything before the agreement is signed —
          // pipeline stages past RESERVED hold the unit until resolved.
          where: {
            OR: [
              { stage: { in: ['AGREEMENT_SIGNED', 'DEPOSIT_PAID', 'FINAL_PAYMENT', 'TITLE_TRANSFERRED'] } },
              { stage: 'RESERVED', expiresAt: { gte: new Date() } },
            ],
          },
          take: 1,
          select: {
            id: true,
            stage: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return units.map(({ deals, reservations, ...u }) => ({
      ...u,
      activeDeal: deals[0] ?? null,
      activeReservation: reservations[0] ?? null,
    }));
  }


  /**
   * One unit's full management picture, for the developer.
   *
   * The portfolio row says who holds it; this page says everything — owner,
   * live deal, platform reservation, its rental life (which listing offers
   * it and who manages that), and the unit's own photos and videos as
   * distinct from the building's shared gallery. Everything a developer
   * needs to answer "what is the state of A-101" in one place.
   */
  async manage(unitId: string, userId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        property: {
          select: {
            id: true, slug: true, name: true, heroImageUrl: true, city: true,
            developerId: true, developer: { select: { userId: true } },
          },
        },
        ownership: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
            rentListing: {
              select: {
                id: true, slug: true, name: true, status: true, managerKind: true,
                priceFrom: true, currency: true,
                managingAgent: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        deals: {
          where: { stage: { notIn: ['LOST'] } },
          orderBy: { stageChangedAt: 'desc' },
          include: {
            agent: { select: { id: true, displayName: true, photoUrl: true, logoUrl: true } },
          },
        },
        reservations: {
          where: { stage: { notIn: ['CANCELLED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        rentUnits: {
          include: {
            rentListing: {
              select: {
                id: true, slug: true, name: true, status: true, managerKind: true,
                ownerId: true,
                managingAgent: { select: { id: true, displayName: true } },
              },
            },
          },
        },
        media: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!unit || unit.property.developer.userId !== userId) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  /** Attach a photo or video to this specific unit. Developer-only. */
  async addMedia(
    unitId: string,
    userId: string,
    dto: { type: 'PHOTO' | 'VIDEO'; url: string; title?: string; sizeBytes?: number; mimeType?: string },
  ) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, property: { select: { developer: { select: { userId: true } } } } },
    });
    if (!unit || unit.property.developer.userId !== userId) {
      throw new NotFoundException('Unit not found');
    }
    return this.prisma.mediaAsset.create({
      data: {
        unitId,
        type: dto.type,
        url: dto.url,
        title: dto.title,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
      },
    });
  }

  async removeMedia(unitId: string, mediaId: string, userId: string) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, unitId },
      select: { id: true, unit: { select: { property: { select: { developer: { select: { userId: true } } } } } } },
    });
    if (!media || media.unit?.property.developer.userId !== userId) {
      throw new NotFoundException('Media not found');
    }
    await this.prisma.mediaAsset.delete({ where: { id: mediaId } });
    return { message: 'Removed' };
  }
}
