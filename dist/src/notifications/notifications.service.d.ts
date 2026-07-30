import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
export declare class NotificationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createNotification(userId: string, type: NotificationType, title: string, body: string, resourceId?: string, resourceType?: string): Promise<{
        type: import("@prisma/client").$Enums.NotificationType;
        title: string;
        id: string;
        createdAt: Date;
        userId: string;
        body: string;
        read: boolean;
        resourceId: string | null;
        resourceType: string | null;
    }>;
    findMine(userId: string, pagination: PaginationDto, unreadOnly?: boolean): Promise<{
        data: {
            type: import("@prisma/client").$Enums.NotificationType;
            title: string;
            id: string;
            createdAt: Date;
            userId: string;
            body: string;
            read: boolean;
            resourceId: string | null;
            resourceType: string | null;
        }[];
        unreadCount: number;
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    markRead(id: string, userId: string): Promise<{
        type: import("@prisma/client").$Enums.NotificationType;
        title: string;
        id: string;
        createdAt: Date;
        userId: string;
        body: string;
        read: boolean;
        resourceId: string | null;
        resourceType: string | null;
    }>;
    markAllRead(userId: string): Promise<{
        message: string;
    }>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
    unreadCount(userId: string): Promise<{
        count: number;
    }>;
}
