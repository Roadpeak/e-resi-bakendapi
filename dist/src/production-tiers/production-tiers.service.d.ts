import { ProductionTierType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SetProductionTierDto } from './dto/set-tier.dto.js';
export declare const TIER_PRICING: Record<ProductionTierType, number>;
export declare const TIER_FEATURES: Record<ProductionTierType, string[]>;
export declare class ProductionTiersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getPricing(): Promise<{
        tier: string;
        priceKES: number;
        features: string[];
    }[]>;
    getForProperty(propertySlug: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        expiresAt: Date | null;
        tier: import("@prisma/client").$Enums.ProductionTierType;
        paidAmount: number | null;
        activatedAt: Date;
    } | {
        tier: "LISTING_ONLY";
        propertyId: string;
        active: boolean;
    }>;
    setTier(dto: SetProductionTierDto, userId: string, userRole: UserRole): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        expiresAt: Date | null;
        tier: import("@prisma/client").$Enums.ProductionTierType;
        paidAmount: number | null;
        activatedAt: Date;
    }>;
    developerTiers(userId: string): Promise<({
        property: {
            name: string;
            slug: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        expiresAt: Date | null;
        tier: import("@prisma/client").$Enums.ProductionTierType;
        paidAmount: number | null;
        activatedAt: Date;
    })[]>;
    adminListAll(): Promise<({
        property: {
            name: string;
            slug: string;
            developer: {
                companyName: string;
            };
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        expiresAt: Date | null;
        tier: import("@prisma/client").$Enums.ProductionTierType;
        paidAmount: number | null;
        activatedAt: Date;
    })[]>;
}
