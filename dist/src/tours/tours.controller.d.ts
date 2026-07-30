import { UserRole } from '@prisma/client';
import { CreateCinematicSceneDto } from './dto/create-cinematic-scene.dto.js';
import { CreateFloorPlanDto } from './dto/create-floor-plan.dto.js';
import { CreateTourSceneDto, CreateTourSectionDto } from './dto/create-tour-section.dto.js';
import { ToursService } from './tours.service.js';
export declare class ToursController {
    private readonly service;
    constructor(service: ToursService);
    listCinematic(slug: string): Promise<{
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
    addCinematic(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateCinematicSceneDto): Promise<{
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
    removeCinematic(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
    list3D(slug: string): Promise<({
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
    addSection(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateTourSectionDto): Promise<{
        id: string;
        createdAt: Date;
        order: number;
        propertyId: string;
        label: string;
    }>;
    addScene(sectionId: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateTourSceneDto): Promise<{
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
    removeSection(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
    listVR(slug: string): Promise<{
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
    addVRScene(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateTourSceneDto): Promise<{
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
    removeVRScene(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
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
    addFloorPlan(slug: string, user: {
        id: string;
        role: UserRole;
    }, dto: CreateFloorPlanDto): Promise<{
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
    removeFloorPlan(id: string, user: {
        id: string;
        role: UserRole;
    }): Promise<{
        message: string;
    }>;
}
