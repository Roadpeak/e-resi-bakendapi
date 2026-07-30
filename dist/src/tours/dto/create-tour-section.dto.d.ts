import { TourCameraPreset } from '@prisma/client';
export declare class CreateTourSectionDto {
    label: string;
    order?: number;
}
export declare class CreateTourSceneDto {
    label: string;
    description?: string;
    imageUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    cameraPreset?: TourCameraPreset;
    order?: number;
}
