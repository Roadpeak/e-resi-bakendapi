import { MediaType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService, UploadFolder } from './storage.service.js';
import type { AddMediaDto } from './dto/add-media.dto.js';
import type { PresignUploadDto } from './dto/presign-upload.dto.js';
export declare class MediaService {
    private readonly prisma;
    private readonly storage;
    constructor(prisma: PrismaService, storage: StorageService);
    getPresignedUrl(dto: PresignUploadDto): Promise<{
        uploadUrl: string;
        key: string;
        fileUrl: string;
    }>;
    uploadFile(folder: UploadFolder, file: Express.Multer.File): Promise<{
        url: string;
        key: string;
        sizeBytes: number;
    }>;
    addToProperty(propertySlug: string, userId: string, userRole: UserRole, dto: AddMediaDto): Promise<{
        url: string;
        type: import("@prisma/client").$Enums.MediaType;
        title: string | null;
        id: string;
        createdAt: Date;
        isFeatured: boolean;
        order: number;
        propertyId: string | null;
        thumbnailUrl: string | null;
        sizeBytes: number | null;
        mimeType: string | null;
        rentListingId: string | null;
    }>;
    addToRentListing(rentListingId: string, userId: string, userRole: UserRole, dto: AddMediaDto): Promise<{
        url: string;
        type: import("@prisma/client").$Enums.MediaType;
        title: string | null;
        id: string;
        createdAt: Date;
        isFeatured: boolean;
        order: number;
        propertyId: string | null;
        thumbnailUrl: string | null;
        sizeBytes: number | null;
        mimeType: string | null;
        rentListingId: string | null;
    }>;
    listForProperty(propertySlug: string, type?: MediaType): Promise<{
        url: string;
        type: import("@prisma/client").$Enums.MediaType;
        title: string | null;
        id: string;
        createdAt: Date;
        isFeatured: boolean;
        order: number;
        propertyId: string | null;
        thumbnailUrl: string | null;
        sizeBytes: number | null;
        mimeType: string | null;
        rentListingId: string | null;
    }[]>;
    remove(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    reorder(propertySlug: string, userId: string, userRole: UserRole, orderedIds: string[]): Promise<{
        message: string;
    }>;
}
