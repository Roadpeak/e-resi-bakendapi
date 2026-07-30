import { UserRole } from '@prisma/client';
import { SetProductionTierDto } from './dto/set-tier.dto.js';
import { ProductionTiersService } from './production-tiers.service.js';
export declare class ProductionTiersController {
    private readonly service;
    constructor(service: ProductionTiersService);
    getPricing(): Promise<{
        tier: string;
        priceKES: number;
        features: string[];
    }[]>;
    getForProperty(slug: string): Promise<{
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
    setTier(dto: SetProductionTierDto, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        expiresAt: Date | null;
        tier: import("@prisma/client").$Enums.ProductionTierType;
        paidAmount: number | null;
        activatedAt: Date;
    }>;
    developerTiers(user: {
        id: string;
    }): Promise<({
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
