import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateConstructionUpdateDto } from './dto/create-construction-update.dto.js';
import type { UpdateConstructionUpdateDto } from './dto/update-construction-update.dto.js';
export declare class ConstructionUpdatesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwner;
    create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateConstructionUpdateDto): Promise<{
        date: Date;
        description: string | null;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        percentComplete: number;
        images: string[];
    }>;
    findAll(propertySlug: string, pagination: PaginationDto): Promise<{
        data: {
            date: Date;
            description: string | null;
            title: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            propertyId: string;
            percentComplete: number;
            images: string[];
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    update(id: string, userId: string, userRole: UserRole, dto: UpdateConstructionUpdateDto): Promise<{
        date: Date;
        description: string | null;
        title: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        propertyId: string;
        percentComplete: number;
        images: string[];
    }>;
    remove(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
}
