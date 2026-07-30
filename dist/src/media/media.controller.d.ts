import { MediaType, UserRole } from '@prisma/client';
import { AddMediaDto } from './dto/add-media.dto.js';
import { PresignUploadDto } from './dto/presign-upload.dto.js';
import { MediaService } from './media.service.js';
export declare class MediaController {
    private readonly service;
    constructor(service: MediaService);
    getPresignedUrl(dto: PresignUploadDto): Promise<{
        uploadUrl: string;
        key: string;
        fileUrl: string;
    }>;
    upload(file: Express.Multer.File, folder?: string): Promise<{
        url: string;
        key: string;
        sizeBytes: number;
    }>;
    listForProperty(slug: string, type?: MediaType): Promise<{
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
    addToProperty(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: AddMediaDto): Promise<{
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
    reorder(slug: string, user: {
        id: string;
        role: UserRole;
    }, orderedIds: string[]): Promise<{
        message: string;
    }>;
    addToRentListing(id: string, user: {
        id: string;
        role: UserRole;
    }, dto: AddMediaDto): Promise<{
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
    remove(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
