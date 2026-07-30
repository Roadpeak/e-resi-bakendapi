import { UserRole } from '@prisma/client';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { UpdateUnitDto } from './dto/update-unit.dto.js';
import { UnitsService } from './units.service.js';
export declare class UnitsController {
    private readonly unitsService;
    constructor(unitsService: UnitsService);
    findAll(slug: string): Promise<{
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
    create(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateUnitDto): Promise<{
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
    update(id: string, user: {
        id: string;
        role: UserRole;
    }, dto: UpdateUnitDto): Promise<{
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
    remove(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
