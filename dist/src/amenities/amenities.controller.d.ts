import { AmenityType, UserRole } from '@prisma/client';
import { CreateAmenityDto } from './dto/create-amenity.dto.js';
import { AmenitiesService } from './amenities.service.js';
export declare class AmenitiesController {
    private readonly service;
    constructor(service: AmenitiesService);
    findAll(slug: string, type?: AmenityType): Promise<{
        name: string;
        type: import("@prisma/client").$Enums.AmenityType;
        id: string;
        createdAt: Date;
        latitude: number | null;
        longitude: number | null;
        propertyId: string;
        distance: string | null;
    }[]>;
    create(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateAmenityDto): Promise<{
        name: string;
        type: import("@prisma/client").$Enums.AmenityType;
        id: string;
        createdAt: Date;
        latitude: number | null;
        longitude: number | null;
        propertyId: string;
        distance: string | null;
    }>;
    bulkCreate(slug: string, user: {
        id: string;
        role: UserRole;
    }, dtos: CreateAmenityDto[]): Promise<import("@prisma/client").Prisma.BatchPayload>;
    removeAll(slug: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
    remove(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
