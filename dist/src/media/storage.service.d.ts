import { ConfigService } from '@nestjs/config';
export type UploadFolder = 'properties' | 'rentals' | 'avatars' | 'logos' | 'documents' | 'tours';
export declare class StorageService {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly bucket;
    private readonly cdnBase;
    constructor(config: ConfigService);
    private buildKey;
    private buildUrl;
    upload(folder: UploadFolder, originalName: string, buffer: Buffer, mimeType: string): Promise<{
        url: string;
        key: string;
        sizeBytes: number;
    }>;
    delete(key: string): Promise<void>;
    presignedUploadUrl(folder: UploadFolder, originalName: string, mimeType: string, expiresIn?: number): Promise<{
        uploadUrl: string;
        key: string;
        fileUrl: string;
    }>;
}
