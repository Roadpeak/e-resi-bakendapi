import { BookingStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';
export declare class BookingsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateBookingDto, userId?: string): Promise<{
        property: {
            name: string;
            slug: string;
            heroImageUrl: string | null;
        };
    } & {
        name: string;
        date: Date;
        type: import("@prisma/client").$Enums.BookingType;
        email: string;
        message: string | null;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.BookingStatus;
        propertyId: string;
        time: string;
        meetingUrl: string | null;
    }>;
    findMine(userId: string, pagination: PaginationDto): Promise<{
        data: ({
            property: {
                name: string;
                slug: string;
                city: string;
                heroImageUrl: string | null;
            };
        } & {
            name: string;
            date: Date;
            type: import("@prisma/client").$Enums.BookingType;
            email: string;
            message: string | null;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.BookingStatus;
            propertyId: string;
            time: string;
            meetingUrl: string | null;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    findForDeveloper(userId: string, pagination: PaginationDto, status?: BookingStatus): Promise<{
        data: ({
            property: {
                name: string;
                slug: string;
            };
        } & {
            name: string;
            date: Date;
            type: import("@prisma/client").$Enums.BookingType;
            email: string;
            message: string | null;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.BookingStatus;
            propertyId: string;
            time: string;
            meetingUrl: string | null;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    updateStatus(id: string, userId: string, userRole: UserRole, status: BookingStatus, meetingUrl?: string): Promise<{
        name: string;
        date: Date;
        type: import("@prisma/client").$Enums.BookingType;
        email: string;
        message: string | null;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.BookingStatus;
        propertyId: string;
        time: string;
        meetingUrl: string | null;
    }>;
    findAll(pagination: PaginationDto, status?: BookingStatus): Promise<{
        data: ({
            property: {
                name: string;
                slug: string;
            };
        } & {
            name: string;
            date: Date;
            type: import("@prisma/client").$Enums.BookingType;
            email: string;
            message: string | null;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.BookingStatus;
            propertyId: string;
            time: string;
            meetingUrl: string | null;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    cancel(id: string, userId: string, userRole: UserRole): Promise<{
        name: string;
        date: Date;
        type: import("@prisma/client").$Enums.BookingType;
        email: string;
        message: string | null;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.BookingStatus;
        propertyId: string;
        time: string;
        meetingUrl: string | null;
    }>;
}
