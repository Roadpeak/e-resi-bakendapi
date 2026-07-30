import { UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { DocumentsService } from './documents.service.js';
export declare class DocumentsController {
    private readonly service;
    constructor(service: DocumentsService);
    create(user: {
        id: string;
    }, dto: CreateDocumentDto): Promise<{
        url: string;
        name: string;
        type: string;
        id: string;
        createdAt: Date;
        userId: string;
        sizeBytes: number | null;
        reservationId: string | null;
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
    findMine(user: {
        id: string;
    }, pagination: PaginationDto): Promise<{
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
    findForReservation(reservationId: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        url: string;
        name: string;
        type: string;
        id: string;
        createdAt: Date;
        userId: string;
        sizeBytes: number | null;
        reservationId: string | null;
    }[]>;
    remove(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
