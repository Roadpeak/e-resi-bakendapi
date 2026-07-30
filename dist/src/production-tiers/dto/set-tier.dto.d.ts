import { ProductionTierType } from '@prisma/client';
export declare class SetProductionTierDto {
    propertySlug: string;
    tier: ProductionTierType;
    paidAmount?: number;
    expiresAt?: string;
}
