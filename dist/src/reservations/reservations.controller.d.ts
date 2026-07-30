import { ReservationStage, UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationsService } from './reservations.service.js';
export declare class ReservationsController {
    private readonly service;
    constructor(service: ReservationsService);
    create(dto: CreateReservationDto, user: {
        id: string;
    }): Promise<{
        unit: {
            property: {
                name: string;
                slug: string;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.UnitStatus;
            currency: string;
            price: number;
            propertyId: string;
            floor: number | null;
            bedrooms: number;
            bathrooms: number;
            sqm: number | null;
            floorPlanId: string | null;
            features: string[];
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        unitId: string;
        expiresAt: Date;
        stage: import("@prisma/client").$Enums.ReservationStage;
    }>;
    findAll(pagination: PaginationDto, stage?: ReservationStage): Promise<{
        data: ({
            user: {
                email: string;
                firstName: string;
                lastName: string;
                id: string;
            };
            unit: {
                property: {
                    name: string;
                    slug: string;
                };
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import("@prisma/client").$Enums.UnitStatus;
                currency: string;
                price: number;
                propertyId: string;
                floor: number | null;
                bedrooms: number;
                bathrooms: number;
                sqm: number | null;
                floorPlanId: string | null;
                features: string[];
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            unitId: string;
            expiresAt: Date;
            stage: import("@prisma/client").$Enums.ReservationStage;
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
            unit: {
                property: {
                    name: string;
                    slug: string;
                    heroImageUrl: string | null;
                };
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import("@prisma/client").$Enums.UnitStatus;
                currency: string;
                price: number;
                propertyId: string;
                floor: number | null;
                bedrooms: number;
                bathrooms: number;
                sqm: number | null;
                floorPlanId: string | null;
                features: string[];
            };
            payments: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                userId: string;
                status: import("@prisma/client").$Enums.PaymentStatus;
                currency: string;
                metadata: import("@prisma/client/runtime/client").JsonValue | null;
                reservationId: string | null;
                amount: number;
                method: import("@prisma/client").$Enums.PaymentMethod;
                reference: string | null;
                stripeId: string | null;
                mpesaCode: string | null;
            }[];
            documents: {
                url: string;
                name: string;
                type: string;
                id: string;
                createdAt: Date;
                userId: string;
                sizeBytes: number | null;
                reservationId: string | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            unitId: string;
            expiresAt: Date;
            stage: import("@prisma/client").$Enums.ReservationStage;
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
    }, pagination: PaginationDto): Promise<{
        data: ({
            user: {
                email: string;
                firstName: string;
                lastName: string;
                phone: string | null;
                id: string;
            };
            unit: {
                property: {
                    name: string;
                    slug: string;
                };
            } & {
                name: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import("@prisma/client").$Enums.UnitStatus;
                currency: string;
                price: number;
                propertyId: string;
                floor: number | null;
                bedrooms: number;
                bathrooms: number;
                sqm: number | null;
                floorPlanId: string | null;
                features: string[];
            };
            payments: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                userId: string;
                status: import("@prisma/client").$Enums.PaymentStatus;
                currency: string;
                metadata: import("@prisma/client/runtime/client").JsonValue | null;
                reservationId: string | null;
                amount: number;
                method: import("@prisma/client").$Enums.PaymentMethod;
                reference: string | null;
                stripeId: string | null;
                mpesaCode: string | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            unitId: string;
            expiresAt: Date;
            stage: import("@prisma/client").$Enums.ReservationStage;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        user: {
            email: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            id: string;
        };
        unit: {
            property: {
                developer: {
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
                };
            } & {
                name: string;
                tags: string[];
                description: string | null;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import("@prisma/client").$Enums.PropertyStatus;
                slug: string;
                tagline: string | null;
                category: import("@prisma/client").$Enums.PropertyCategory;
                developerId: string;
                addressLine: string | null;
                neighborhood: string | null;
                city: string;
                county: string | null;
                country: string;
                latitude: number | null;
                longitude: number | null;
                heroImageUrl: string | null;
                heroVideoUrl: string | null;
                priceFrom: number | null;
                priceTo: number | null;
                currency: string;
                hasCinematicTour: boolean;
                has3DTour: boolean;
                hasVRTour: boolean;
                isFeatured: boolean;
                completionDate: Date | null;
            };
        } & {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("@prisma/client").$Enums.UnitStatus;
            currency: string;
            price: number;
            propertyId: string;
            floor: number | null;
            bedrooms: number;
            bathrooms: number;
            sqm: number | null;
            floorPlanId: string | null;
            features: string[];
        };
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            status: import("@prisma/client").$Enums.PaymentStatus;
            currency: string;
            metadata: import("@prisma/client/runtime/client").JsonValue | null;
            reservationId: string | null;
            amount: number;
            method: import("@prisma/client").$Enums.PaymentMethod;
            reference: string | null;
            stripeId: string | null;
            mpesaCode: string | null;
        }[];
        documents: {
            url: string;
            name: string;
            type: string;
            id: string;
            createdAt: Date;
            userId: string;
            sizeBytes: number | null;
            reservationId: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        unitId: string;
        expiresAt: Date;
        stage: import("@prisma/client").$Enums.ReservationStage;
    }>;
    advanceStage(id: string, user: {
        id: string;
        role: UserRole;
    }, stage: ReservationStage): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        unitId: string;
        expiresAt: Date;
        stage: import("@prisma/client").$Enums.ReservationStage;
    }>;
    cancel(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
