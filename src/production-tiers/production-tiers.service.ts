import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProductionTierType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SetProductionTierDto } from './dto/set-tier.dto.js';
import { InvoicesService } from '../billing/invoices.service.js';

// Tier pricing in KES
export const TIER_PRICING: Record<ProductionTierType, number> = {
  LISTING_ONLY: 0,
  PHOTOGRAPHY: 15000,
  PHOTOGRAPHY_VIDEO: 35000,
  TOUR_CINEMATIC: 75000,
  TOUR_3D: 95000,
  TOUR_VR: 120000,
  FULL_PRODUCTION: 250000,
};

export const TIER_FEATURES: Record<ProductionTierType, string[]> = {
  LISTING_ONLY: ['Basic listing', 'Up to 10 photos (self-upload)', 'Standard visibility'],
  PHOTOGRAPHY: ['Professional photography (up to 30 shots)', 'Edited gallery', 'Priority listing'],
  PHOTOGRAPHY_VIDEO: ['All Photography tier features', 'Professional property video (3–5 min)', 'YouTube + social cuts'],
  TOUR_CINEMATIC: ['All Photo+Video features', 'Cinematic VR-ready tour video', 'Scene tagging'],
  TOUR_3D: ['All Cinematic features', 'Interactive 3D walkthrough', 'Room-by-room navigation'],
  TOUR_VR: ['All 3D Tour features', 'Full VR headset experience', 'WebGL-optimised delivery'],
  FULL_PRODUCTION: ['All tiers combined', 'Aerial drone footage', 'Digital twin model', 'Dedicated production team'],
};

@Injectable()
export class ProductionTiersService {
  private readonly logger = new Logger(ProductionTiersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Admin-managed pricing. Falls back to the built-in constants when the
   * PricingPlan table has not been seeded yet, so this never returns empty.
   */
  async getPricing() {
    const plans = await this.prisma.pricingPlan.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    if (plans.length > 0) {
      return plans.map((p) => ({
        tier: p.tier,
        label: p.label,
        priceKES: p.currency === 'KES' ? p.price : undefined,
        price: p.price,
        currency: p.currency,
        features: p.features,
        description: p.description,
      }));
    }

    return Object.entries(TIER_PRICING).map(([tier, price]) => ({
      tier,
      label: tier,
      priceKES: price,
      price,
      currency: 'KES',
      features: TIER_FEATURES[tier as ProductionTierType],
      description: null,
    }));
  }

  async getForProperty(propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    const tier = await this.prisma.productionTier.findUnique({ where: { propertyId: property.id } });
    if (!tier) return { tier: ProductionTierType.LISTING_ONLY, propertyId: property.id, active: false };
    return tier;
  }

  async setTier(dto: SetProductionTierDto, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug: dto.propertySlug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const before = await this.prisma.productionTier.findUnique({
      where: { propertyId: property.id },
      select: { tier: true },
    });

    const order = await this.prisma.productionTier.upsert({
      where: { propertyId: property.id },
      create: {
        propertyId: property.id,
        tier: dto.tier,
        paidAmount: dto.paidAmount,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      update: {
        tier: dto.tier,
        paidAmount: dto.paidAmount,
        ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
        activatedAt: new Date(),
      },
    });

    // Production is invoiced the moment it is ordered — the shoot is scheduled
    // against it. Only bill a genuine change: re-saving the same tier, or a
    // free listing-only tier, owes nothing.
    const amount = dto.paidAmount ?? 0;
    const isNewOrder = !before || before.tier !== dto.tier;
    if (isNewOrder && amount > 0) {
      const label = dto.tier.replace(/_/g, ' ').toLowerCase();
      await this.invoices.invoiceProduction({
        userId: property.developer.userId,
        propertyId: property.id,
        propertyName: property.name,
        lines: [{
          description: `Production — ${label} · ${property.name}`,
          amount,
        }],
        currency: property.currency ?? 'KES',
      }).catch((err) => {
        // The order stands; an uninvoiced job is an ops problem, not a reason
        // to refuse the booking.
        this.logger.error(
          `Could not invoice production for ${property.slug}: ${(err as Error).message}`,
        );
      });
    }

    return order;
  }

  async developerTiers(userId: string) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    return this.prisma.productionTier.findMany({
      where: { property: { developerId: developer.id } },
      include: { property: { select: { slug: true, name: true } } },
      orderBy: { activatedAt: 'desc' },
    });
  }

  async adminListAll() {
    return this.prisma.productionTier.findMany({
      include: { property: { select: { slug: true, name: true, developer: { select: { companyName: true } } } } },
      orderBy: { activatedAt: 'desc' },
    });
  }
}
