import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { UpdateUnitDto } from './dto/update-unit.dto.js';
export declare class UnitsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertPropertyOwner;
    create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateUnitDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.UnitStatus;
        currency: string;
        price: number;
        propertyId: string;
        floor: number | null;
        bedrooms: number;
        bathrooms: number;
        sqm: number | null;
        floorPlanId: string | null;
        features: string[];
    }>;
    findAll(propertySlug: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.UnitStatus;
        currency: string;
        price: number;
        propertyId: string;
        floor: number | null;
        bedrooms: number;
        bathrooms: number;
        sqm: number | null;
        floorPlanId: string | null;
        features: string[];
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.UnitStatus;
        currency: string;
        price: number;
        propertyId: string;
        floor: number | null;
        bedrooms: number;
        bathrooms: number;
        sqm: number | null;
        floorPlanId: string | null;
        features: string[];
    }>;
    update(id: string, userId: string, userRole: UserRole, dto: UpdateUnitDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("@prisma/client").$Enums.UnitStatus;
        currency: string;
        price: number;
        propertyId: string;
        floor: number | null;
        bedrooms: number;
        bathrooms: number;
        sqm: number | null;
        floorPlanId: string | null;
        features: string[];
    }>;
    remove(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
}
