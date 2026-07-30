import { InquiryStatus, UserRole } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateInquiryDto } from './dto/create-inquiry.dto.js';
import { ReplyInquiryDto } from './dto/reply-inquiry.dto.js';
import { InquiriesService } from './inquiries.service.js';
export declare class InquiriesController {
    private readonly service;
    constructor(service: InquiriesService);
    create(dto: CreateInquiryDto, userId?: string): Promise<{
        name: string;
        email: string;
        message: string;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.InquiryStatus;
        propertyId: string | null;
        rentListingId: string | null;
        interestedUnit: string | null;
    }>;
    findAll(pagination: PaginationDto, status?: InquiryStatus): Promise<{
        data: ({
            property: {
                name: string;
                slug: string;
            } | null;
            rentListing: {
                name: string;
                slug: string;
            } | null;
            _count: {
                replies: number;
            };
        } & {
            name: string;
            email: string;
            message: string;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.InquiryStatus;
            propertyId: string | null;
            rentListingId: string | null;
            interestedUnit: string | null;
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
                heroImageUrl: string | null;
            } | null;
            rentListing: {
                name: string;
                slug: string;
                heroImageUrl: string | null;
            } | null;
            replies: {
                message: string;
                id: string;
                createdAt: Date;
                inquiryId: string;
                senderId: string;
            }[];
        } & {
            name: string;
            email: string;
            message: string;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.InquiryStatus;
            propertyId: string | null;
            rentListingId: string | null;
            interestedUnit: string | null;
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
    }, pagination: PaginationDto, status?: InquiryStatus): Promise<{
        data: ({
            property: {
                name: string;
                slug: string;
            } | null;
            rentListing: {
                name: string;
                slug: string;
            } | null;
            replies: {
                message: string;
                id: string;
                createdAt: Date;
                inquiryId: string;
                senderId: string;
            }[];
        } & {
            name: string;
            email: string;
            message: string;
            phone: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            status: import("@prisma/client").$Enums.InquiryStatus;
            propertyId: string | null;
            rentListingId: string | null;
            interestedUnit: string | null;
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
        property: ({
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
        }) | null;
        rentListing: ({
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
            status: import("@prisma/client").$Enums.RentListingStatus;
            slug: string;
            tagline: string | null;
            developerId: string;
            neighborhood: string | null;
            city: string;
            county: string | null;
            country: string;
            latitude: number | null;
            longitude: number | null;
            heroImageUrl: string | null;
            priceFrom: number | null;
            priceTo: number | null;
            currency: string;
            isFeatured: boolean;
            propertyId: string;
            furnishing: import("@prisma/client").$Enums.FurnishingType;
            availableFrom: Date | null;
            minLeaseTerm: number;
            show3DTour: boolean;
            showCinematicTour: boolean;
            featuredCinematicSceneIds: string[];
        }) | null;
        replies: ({
            sender: {
                firstName: string;
                lastName: string;
                role: import("@prisma/client").$Enums.UserRole;
                avatarUrl: string | null;
                id: string;
            };
        } & {
            message: string;
            id: string;
            createdAt: Date;
            inquiryId: string;
            senderId: string;
        })[];
    } & {
        name: string;
        email: string;
        message: string;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.InquiryStatus;
        propertyId: string | null;
        rentListingId: string | null;
        interestedUnit: string | null;
    }>;
    reply(id: string, user: {
        id: string;
        role: UserRole;
    }, dto: ReplyInquiryDto): Promise<{
        sender: {
            firstName: string;
            lastName: string;
            role: import("@prisma/client").$Enums.UserRole;
            id: string;
        };
    } & {
        message: string;
        id: string;
        createdAt: Date;
        inquiryId: string;
        senderId: string;
    }>;
    updateStatus(id: string, user: {
        id: string;
        role: UserRole;
    }, status: InquiryStatus): Promise<{
        name: string;
        email: string;
        message: string;
        phone: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        status: import("@prisma/client").$Enums.InquiryStatus;
        propertyId: string | null;
        rentListingId: string | null;
        interestedUnit: string | null;
    }>;
}
