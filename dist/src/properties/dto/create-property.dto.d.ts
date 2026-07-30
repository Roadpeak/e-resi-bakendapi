import { PropertyCategory } from '@prisma/client';
export declare class CreatePropertyDto {
    name: string;
    tagline?: string;
    description?: string;
    category: PropertyCategory;
    neighborhood?: string;
    city?: string;
    county?: string;
    latitude?: number;
    longitude?: number;
    heroImageUrl?: string;
    heroVideoUrl?: string;
    priceFrom?: number;
    priceTo?: number;
    tags?: string[];
    completionDate?: string;
}
