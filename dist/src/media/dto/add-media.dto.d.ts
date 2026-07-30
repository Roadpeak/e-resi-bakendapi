import { MediaType } from '@prisma/client';
export declare class AddMediaDto {
    type: MediaType;
    url: string;
    thumbnailUrl?: string;
    title?: string;
    order?: number;
    isFeatured?: boolean;
    sizeBytes?: number;
    mimeType?: string;
}
