import { AnalyticsEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
interface TrackEventDto {
    type: AnalyticsEventType;
    propertyId?: string;
    sessionId?: string;
    source?: string;
    metadata?: Prisma.InputJsonValue;
}
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    track(dto: TrackEventDto, userId?: string): Promise<{
        type: import("@prisma/client").$Enums.AnalyticsEventType;
        id: string;
        createdAt: Date;
        userId: string | null;
        propertyId: string | null;
        metadata: Prisma.JsonValue | null;
        sessionId: string | null;
        source: string | null;
    }>;
    propertyStats(propertySlug: string, days?: number): Promise<{
        period: string;
        views: number;
        tourStarts: number;
        tourCompletes: number;
        inquiries: number;
        bookings: number;
        saved: number;
    } | null>;
    developerStats(userId: string): Promise<{
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
export {};
