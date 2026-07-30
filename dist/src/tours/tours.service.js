"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToursService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let ToursService = class ToursService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assertOwner(propertySlug, userId, userRole) {
        const property = await this.prisma.property.findUnique({
            where: { slug: propertySlug },
            include: { developer: true },
        });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return property;
    }
    async addCinematicScene(slug, userId, userRole, dto) {
        const property = await this.assertOwner(slug, userId, userRole);
        const scene = await this.prisma.cinematicScene.create({
            data: {
                propertyId: property.id,
                label: dto.label,
                sublabel: dto.sublabel,
                category: dto.category,
                videoUrl: dto.videoUrl,
                thumbnailUrl: dto.thumbnailUrl,
                order: dto.order ?? 0,
            },
        });
        if (!property.hasCinematicTour) {
            await this.prisma.property.update({ where: { id: property.id }, data: { hasCinematicTour: true } });
        }
        return scene;
    }
    async listCinematicScenes(slug) {
        const property = await this.prisma.property.findUnique({ where: { slug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.cinematicScene.findMany({
            where: { propertyId: property.id },
            orderBy: { order: 'asc' },
        });
    }
    async removeCinematicScene(id, userId, userRole) {
        const scene = await this.prisma.cinematicScene.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!scene)
            throw new common_1.NotFoundException('Scene not found');
        if (userRole !== client_1.UserRole.ADMIN && scene.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        await this.prisma.cinematicScene.delete({ where: { id } });
        return { message: 'Scene deleted' };
    }
    async addTourSection(slug, userId, userRole, dto) {
        const property = await this.assertOwner(slug, userId, userRole);
        const section = await this.prisma.tourSection3D.create({
            data: { propertyId: property.id, label: dto.label, order: dto.order ?? 0 },
        });
        if (!property.has3DTour) {
            await this.prisma.property.update({ where: { id: property.id }, data: { has3DTour: true } });
        }
        return section;
    }
    async addTourScene(sectionId, userId, userRole, dto) {
        const section = await this.prisma.tourSection3D.findUnique({
            where: { id: sectionId },
            include: { property: { include: { developer: true } } },
        });
        if (!section)
            throw new common_1.NotFoundException('Tour section not found');
        if (userRole !== client_1.UserRole.ADMIN && section.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        return this.prisma.tourScene3D.create({
            data: {
                sectionId,
                label: dto.label,
                description: dto.description,
                imageUrl: dto.imageUrl,
                videoUrl: dto.videoUrl,
                thumbnailUrl: dto.thumbnailUrl,
                cameraPreset: dto.cameraPreset ?? 'INTERIOR',
                order: dto.order ?? 0,
            },
        });
    }
    async list3DTour(slug) {
        const property = await this.prisma.property.findUnique({ where: { slug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.tourSection3D.findMany({
            where: { propertyId: property.id },
            include: { scenes: { orderBy: { order: 'asc' } } },
            orderBy: { order: 'asc' },
        });
    }
    async removeTourSection(id, userId, userRole) {
        const section = await this.prisma.tourSection3D.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!section)
            throw new common_1.NotFoundException('Section not found');
        if (userRole !== client_1.UserRole.ADMIN && section.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        await this.prisma.tourSection3D.delete({ where: { id } });
        return { message: 'Section and its scenes deleted' };
    }
    async addVRScene(slug, userId, userRole, dto) {
        const property = await this.assertOwner(slug, userId, userRole);
        const scene = await this.prisma.tourSceneVR.create({
            data: {
                propertyId: property.id,
                label: dto.label,
                description: dto.description,
                imageUrl: dto.imageUrl,
                videoUrl: dto.videoUrl,
                thumbnailUrl: dto.thumbnailUrl,
                cameraPreset: dto.cameraPreset ?? 'INTERIOR',
                order: dto.order ?? 0,
            },
        });
        if (!property.hasVRTour) {
            await this.prisma.property.update({ where: { id: property.id }, data: { hasVRTour: true } });
        }
        return scene;
    }
    async listVRTour(slug) {
        const property = await this.prisma.property.findUnique({ where: { slug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.tourSceneVR.findMany({
            where: { propertyId: property.id },
            orderBy: { order: 'asc' },
        });
    }
    async removeVRScene(id, userId, userRole) {
        const scene = await this.prisma.tourSceneVR.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!scene)
            throw new common_1.NotFoundException('VR scene not found');
        if (userRole !== client_1.UserRole.ADMIN && scene.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        await this.prisma.tourSceneVR.delete({ where: { id } });
        return { message: 'VR scene deleted' };
    }
    async addFloorPlan(slug, userId, userRole, dto) {
        const property = await this.assertOwner(slug, userId, userRole);
        return this.prisma.floorPlan.create({
            data: {
                propertyId: property.id,
                name: dto.name,
                imageUrl: dto.imageUrl,
                bedrooms: dto.bedrooms,
                bathrooms: dto.bathrooms,
                sqm: dto.sqm,
                sqft: dto.sqft,
                order: dto.order ?? 0,
            },
        });
    }
    async listFloorPlans(slug) {
        const property = await this.prisma.property.findUnique({ where: { slug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.floorPlan.findMany({
            where: { propertyId: property.id },
            orderBy: { order: 'asc' },
        });
    }
    async removeFloorPlan(id, userId, userRole) {
        const plan = await this.prisma.floorPlan.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!plan)
            throw new common_1.NotFoundException('Floor plan not found');
        if (userRole !== client_1.UserRole.ADMIN && plan.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        await this.prisma.floorPlan.delete({ where: { id } });
        return { message: 'Floor plan deleted' };
    }
};
exports.ToursService = ToursService;
exports.ToursService = ToursService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], ToursService);
//# sourceMappingURL=tours.service.js.map