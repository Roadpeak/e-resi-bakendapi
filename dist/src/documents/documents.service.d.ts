import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';
export declare class DocumentsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, dto: CreateDocumentDto): Promise<{
        url: string;
        name: string;
        type: string;
        id: string;
        createdAt: Date;
        userId: string;
        sizeBytes: number | null;
        reservationId: string | null;
    }>;
    findMine(userId: string, pagination: PaginationDto): Promise<{
        data: ({
            reservation: {
                unit: {
                    property: {
                        name: string;
                        slug: string;
                    };
                    name: string;
                };
                id: string;
                stage: import("@prisma/client").$Enums.ReservationStage;
            } | null;
        } & {
            url: string;
            name: string;
            type: string;
            id: string;
            createdAt: Date;
            userId: string;
            sizeBytes: number | null;
            reservationId: string | null;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    findForReservation(reservationId: string, userId: string, userRole: UserRole): Promise<{
        url: string;
        name: string;
        type: string;
        id: string;
        createdAt: Date;
        userId: string;
        sizeBytes: number | null;
        reservationId: string | null;
    }[]>;
    remove(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    findAll(pagination: PaginationDto): Promise<{
        data: ({
            user: {
                email: string;
                firstName: string;
                lastName: string;
                id: string;
            };
            reservation: {
                id: string;
                stage: import("@prisma/client").$Enums.ReservationStage;
            } | null;
        } & {
            url: string;
            name: string;
            type: string;
            id: string;
            createdAt: Date;
            userId: string;
            sizeBytes: number | null;
            reservationId: string | null;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
}
