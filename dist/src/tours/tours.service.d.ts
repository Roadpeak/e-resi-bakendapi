import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCinematicSceneDto } from './dto/create-cinematic-scene.dto.js';
import type { CreateFloorPlanDto } from './dto/create-floor-plan.dto.js';
import type { CreateTourSceneDto, CreateTourSectionDto } from './dto/create-tour-section.dto.js';
export declare class ToursService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private assertOwner;
    addCinematicScene(slug: string, userId: string, userRole: UserRole, dto: CreateCinematicSceneDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.CinematicSceneCategory;
        order: number;
        propertyId: string;
        thumbnailUrl: string | null;
        label: string;
        sublabel: string | null;
        videoUrl: string;
    }>;
    listCinematicScenes(slug: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("@prisma/client").$Enums.CinematicSceneCategory;
        order: number;
        propertyId: string;
        thumbnailUrl: string | null;
        label: string;
        sublabel: string | null;
        videoUrl: string;
    }[]>;
    removeCinematicScene(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    addTourSection(slug: string, userId: string, userRole: UserRole, dto: CreateTourSectionDto): Promise<{
        id: string;
        createdAt: Date;
        order: number;
        propertyId: string;
        label: string;
    }>;
    addTourScene(sectionId: string, userId: string, userRole: UserRole, dto: CreateTourSceneDto): Promise<{
        description: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        order: number;
        imageUrl: string | null;
        thumbnailUrl: string | null;
        label: string;
        videoUrl: string | null;
        sectionId: string;
        cameraPreset: import("@prisma/client").$Enums.TourCameraPreset;
    }>;
    list3DTour(slug: string): Promise<({
        scenes: {
            description: string | null;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            order: number;
            imageUrl: string | null;
            thumbnailUrl: string | null;
            label: string;
            videoUrl: string | null;
            sectionId: string;
            cameraPreset: import("@prisma/client").$Enums.TourCameraPreset;
        }[];
    } & {
        id: string;
        createdAt: Date;
        order: number;
        propertyId: string;
        label: string;
    })[]>;
    removeTourSection(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    addVRScene(slug: string, userId: string, userRole: UserRole, dto: CreateTourSceneDto): Promise<{
        description: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        order: number;
        propertyId: string;
        imageUrl: string | null;
        thumbnailUrl: string | null;
        label: string;
        videoUrl: string | null;
        cameraPreset: import("@prisma/client").$Enums.TourCameraPreset;
    }>;
    listVRTour(slug: string): Promise<{
        description: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        order: number;
        propertyId: string;
        imageUrl: string | null;
        thumbnailUrl: string | null;
        label: string;
        videoUrl: string | null;
        cameraPreset: import("@prisma/client").$Enums.TourCameraPreset;
    }[]>;
    removeVRScene(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    addFloorPlan(slug: string, userId: string, userRole: UserRole, dto: CreateFloorPlanDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        order: number;
        propertyId: string;
        bedrooms: number | null;
        bathrooms: number | null;
        sqm: number | null;
        imageUrl: string;
        sqft: number | null;
    }>;
    listFloorPlans(slug: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        order: number;
        propertyId: string;
        bedrooms: number | null;
        bathrooms: number | null;
        sqm: number | null;
        imageUrl: string;
        sqft: number | null;
    }[]>;
    removeFloorPlan(id: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
}
