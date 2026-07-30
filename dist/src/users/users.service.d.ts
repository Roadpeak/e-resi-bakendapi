import { KybStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { UpdateDeveloperProfileDto } from './dto/update-developer-profile.dto.js';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(pagination: PaginationDto, role?: UserRole): Promise<{
        data: {
            developerProfile: {
                companyName: string;
                kybStatus: import("@prisma/client").$Enums.KybStatus;
            } | null;
            email: string;
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            phone: string | null;
            avatarUrl: string | null;
            id: string;
            emailVerified: boolean;
            isActive: boolean;
            lastLoginAt: Date | null;
            createdAt: Date;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    findOne(id: string): Promise<{
        developerProfile: {
            description: string | null;
            companyName: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            logoUrl: string | null;
            establishedYear: number | null;
            completedProjects: number;
            website: string | null;
            kybStatus: import("@prisma/client").$Enums.KybStatus;
            kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
            kybReviewedAt: Date | null;
            kybReviewedBy: string | null;
            userId: string;
        } | null;
        email: string;
        firstName: string;
        lastName: string;
        role: import("@prisma/client").$Enums.UserRole;
        phone: string | null;
        avatarUrl: string | null;
        id: string;
        emailVerified: boolean;
        phoneVerified: boolean;
        isActive: boolean;
        oauthProvider: string | null;
        oauthId: string | null;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    setActive(id: string, isActive: boolean): Promise<{
        id: string;
        isActive: boolean;
    }>;
    updateKybStatus(developerId: string, status: KybStatus): Promise<{
        description: string | null;
        companyName: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        logoUrl: string | null;
        establishedYear: number | null;
        completedProjects: number;
        website: string | null;
        kybStatus: import("@prisma/client").$Enums.KybStatus;
        kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
        kybReviewedAt: Date | null;
        kybReviewedBy: string | null;
        userId: string;
    }>;
    getMyDeveloperProfile(userId: string): Promise<{
        description: string | null;
        companyName: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        logoUrl: string | null;
        establishedYear: number | null;
        completedProjects: number;
        website: string | null;
        kybStatus: import("@prisma/client").$Enums.KybStatus;
        kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
        kybReviewedAt: Date | null;
        kybReviewedBy: string | null;
        userId: string;
    }>;
    updateMyDeveloperProfile(userId: string, dto: UpdateDeveloperProfileDto): Promise<{
        description: string | null;
        companyName: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        logoUrl: string | null;
        establishedYear: number | null;
        completedProjects: number;
        website: string | null;
        kybStatus: import("@prisma/client").$Enums.KybStatus;
        kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
        kybReviewedAt: Date | null;
        kybReviewedBy: string | null;
        userId: string;
    }>;
    getDeveloperProfileByUserId(userId: string): Promise<{
        properties: {
            name: string;
            id: string;
            slug: string;
            city: string;
            heroImageUrl: string | null;
            priceFrom: number | null;
        }[];
    } & {
        description: string | null;
        companyName: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        logoUrl: string | null;
        establishedYear: number | null;
        completedProjects: number;
        website: string | null;
        kybStatus: import("@prisma/client").$Enums.KybStatus;
        kybDocuments: import("@prisma/client/runtime/client").JsonValue | null;
        kybReviewedAt: Date | null;
        kybReviewedBy: string | null;
        userId: string;
    }>;
}
