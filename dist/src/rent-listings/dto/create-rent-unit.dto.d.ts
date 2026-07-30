import { FurnishingType } from '@prisma/client';
export declare class CreateRentUnitDto {
    label: string;
    bedrooms?: number;
    bathrooms?: number;
    sqm?: number;
    pricePerMonth: number;
    available?: number;
    total?: number;
    furnishing?: FurnishingType;
    features?: string[];
}
