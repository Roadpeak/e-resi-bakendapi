import { FurnishingType } from '@prisma/client';
export declare class CreateRentListingDto {
    name: string;
    tagline?: string;
    description?: string;
    propertySlug: string;
    furnishing?: FurnishingType;
    neighborhood?: string;
    city?: string;
    priceFrom?: number;
    priceTo?: number;
    heroImageUrl?: string;
    availableFrom?: string;
    minLeaseTerm?: number;
    tags?: string[];
}
