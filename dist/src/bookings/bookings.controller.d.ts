import { BookingStatus, UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingsService } from './bookings.service.js';
export declare class BookingsController {
    private readonly service;
    constructor(service: BookingsService);
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
    findMine(user: {
        id: string;
    }, pagination: PaginationDto): Promise<{
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
    findForDeveloper(user: {
        id: string;
    }, pagination: PaginationDto, status?: BookingStatus): Promise<{
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
    updateStatus(id: string, user: {
        id: string;
        role: UserRole;
    }, status: BookingStatus, meetingUrl?: string): Promise<{
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
    cancel(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
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
