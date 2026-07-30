import { PaginationDto } from '../common/dto/pagination.dto.js';
import { SavedPropertiesService } from './saved-properties.service.js';
export declare class SavedPropertiesController {
    private readonly service;
    constructor(service: SavedPropertiesService);
    findMine(user: {
        id: string;
    }, pagination: PaginationDto): Promise<{
        data: ({
            property: {
                name: string;
                id: string;
                status: import("@prisma/client").$Enums.PropertyStatus;
                slug: string;
                category: import("@prisma/client").$Enums.PropertyCategory;
                city: string;
                heroImageUrl: string | null;
                priceFrom: number | null;
                priceTo: number | null;
                hasCinematicTour: boolean;
                has3DTour: boolean;
                hasVRTour: boolean;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            propertyId: string;
        })[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    save(user: {
        id: string;
    }, slug: string): Promise<{
        property: {
            name: string;
            slug: string;
            city: string;
            heroImageUrl: string | null;
            priceFrom: number | null;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        propertyId: string;
    }>;
    unsave(user: {
        id: string;
    }, slug: string): Promise<{
        message: string;
    }>;
    isSaved(user: {
        id: string;
    }, slug: string): Promise<{
        saved: boolean;
    }>;
}
