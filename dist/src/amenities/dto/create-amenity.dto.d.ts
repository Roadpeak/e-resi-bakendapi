import { AmenityType } from '@prisma/client';
export declare class CreateAmenityDto {
    name: string;
    type: AmenityType;
    distance?: string;
    latitude?: number;
    longitude?: number;
}
