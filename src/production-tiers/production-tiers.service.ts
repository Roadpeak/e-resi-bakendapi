import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductionTierType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SetProductionTierDto } from './dto/set-tier.dto.js';

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
  constructor(private readonly prisma: PrismaService) {}

  async getPricing() {
    return Object.entries(TIER_PRICING).map(([tier, price]) => ({
      tier,
      priceKES: price,
      features: TIER_FEATURES[tier as ProductionTierType],
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

    return this.prisma.productionTier.upsert({
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
