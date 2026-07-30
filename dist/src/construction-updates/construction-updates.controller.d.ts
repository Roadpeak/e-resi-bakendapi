import { UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateConstructionUpdateDto } from './dto/create-construction-update.dto.js';
import { UpdateConstructionUpdateDto } from './dto/update-construction-update.dto.js';
import { ConstructionUpdatesService } from './construction-updates.service.js';
export declare class ConstructionUpdatesController {
    private readonly service;
    constructor(service: ConstructionUpdatesService);
    findAll(slug: string, pagination: PaginationDto): Promise<{
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
    create(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateConstructionUpdateDto): Promise<{
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
    update(id: string, user: {
        id: string;
        role: UserRole;
    }, dto: UpdateConstructionUpdateDto): Promise<{
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
    remove(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
