import { KybStatus, UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { UpdateDeveloperProfileDto } from './dto/update-developer-profile.dto.js';
import { UsersService } from './users.service.js';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
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
    updateKybStatus(profileId: string, status: KybStatus): Promise<{
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
    getMyDeveloperProfile(user: {
        id: string;
    }): Promise<{
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
    updateMyDeveloperProfile(user: {
        id: string;
    }, dto: UpdateDeveloperProfileDto): Promise<{
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
    getDeveloperProfile(userId: string): Promise<{
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
