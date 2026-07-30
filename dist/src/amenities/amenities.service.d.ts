import { AmenityType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAmenityDto } from './dto/create-amenity.dto.js';
export declare class AmenitiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwner;
    create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateAmenityDto): Promise<{
        name: string;
        type: import("@prisma/client").$Enums.AmenityType;
        id: string;
        createdAt: Date;
        latitude: number | null;
        longitude: number | null;
        propertyId: string;
        distance: string | null;
    }>;
    findAll(propertySlug: string, type?: AmenityType): Promise<{
        name: string;
        type: import("@prisma/client").$Enums.AmenityType;
        id: string;
        createdAt: Date;
        latitude: number | null;
        longitude: number | null;
        propertyId: string;
        distance: string | null;
    }[]>;
    bulkCreate(propertySlug: string, userId: string, userRole: UserRole, dtos: CreateAmenityDto[]): Promise<import("@prisma/client").Prisma.BatchPayload>;
    remove(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    removeAll(propertySlug: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
}
