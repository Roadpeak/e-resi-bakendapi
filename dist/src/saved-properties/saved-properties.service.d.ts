import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
export declare class SavedPropertiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    save(userId: string, propertySlug: string): Promise<{
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
    unsave(userId: string, propertySlug: string): Promise<{
        message: string;
    }>;
    findMine(userId: string, pagination: PaginationDto): Promise<{
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
    isSaved(userId: string, propertySlug: string): Promise<{
        saved: boolean;
    }>;
}
