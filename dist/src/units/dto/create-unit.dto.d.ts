import { UnitStatus } from '@prisma/client';
export declare class CreateUnitDto {
    name: string;
    floor?: number;
    bedrooms?: number;
    bathrooms?: number;
    sqm?: number;
    price: number;
    status?: UnitStatus;
    features?: string[];
}
