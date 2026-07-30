import { AnalyticsEventType, Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service.js';
export declare class AnalyticsController {
    private readonly service;
    constructor(service: AnalyticsService);
    track(dto: {
        type: AnalyticsEventType;
        propertyId?: string;
        sessionId?: string;
        source?: string;
        metadata?: Prisma.InputJsonValue;
    }, userId?: string): Promise<{
        type: import("@prisma/client").$Enums.AnalyticsEventType;
        id: string;
        createdAt: Date;
        userId: string | null;
        propertyId: string | null;
        metadata: Prisma.JsonValue | null;
        sessionId: string | null;
        source: string | null;
    }>;
    propertyStats(slug: string, days?: string): Promise<{
        period: string;
        views: number;
        tourStarts: number;
        tourCompletes: number;
        inquiries: number;
        bookings: number;
        saved: number;
    } | null>;
    developerStats(user: {
        id: string;
    }): Promise<{
        properties: {
            total: number;
            active: number;
        };
        inquiries: {
            last30Days: number;
        };
        bookings: {
            pending: number;
        };
        reservations: {
            active: number;
        };
    } | null>;
    platformStats(): Promise<{
        users: {
            [k: string]: number;
        };
        properties: {
            [k: string]: number;
        };
        activity: {
            inquiries30d: number;
            bookings30d: number;
            activeReservations: number;
        };
    }>;
}
