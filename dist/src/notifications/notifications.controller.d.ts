import { PaginationDto } from '../common/dto/pagination.dto.js';
import { NotificationsService } from './notifications.service.js';
export declare class NotificationsController {
    private readonly service;
    constructor(service: NotificationsService);
    findMine(user: {
        id: string;
    }, pagination: PaginationDto, unreadOnly?: string): Promise<{
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
    unreadCount(user: {
        id: string;
    }): Promise<{
        count: number;
    }>;
    markAllRead(user: {
        id: string;
    }): Promise<{
        message: string;
    }>;
    markRead(id: string, user: {
        id: string;
    }): Promise<{
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
    remove(id: string, user: {
        id: string;
    }): Promise<{
        message: string;
    }>;
}
