import { CinematicSceneCategory } from '@prisma/client';
export declare class CreateCinematicSceneDto {
    label: string;
    sublabel?: string;
    category: CinematicSceneCategory;
    videoUrl: string;
    thumbnailUrl?: string;
    order?: number;
}
