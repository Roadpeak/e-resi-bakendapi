import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateCinematicSceneDto } from './dto/create-cinematic-scene.dto.js';
import type { CreateFloorPlanDto } from './dto/create-floor-plan.dto.js';
import type { CreateTourSceneDto, CreateTourSectionDto } from './dto/create-tour-section.dto.js';

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwner(propertySlug: string, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug: propertySlug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }
    return property;
  }

  // ─── Cinematic Scenes ─────────────────────────────────────────────────────

  async addCinematicScene(slug: string, userId: string, userRole: UserRole, dto: CreateCinematicSceneDto) {
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

  async listCinematicScenes(slug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.cinematicScene.findMany({
      where: { propertyId: property.id },
      orderBy: { order: 'asc' },
    });
  }

  async removeCinematicScene(id: string, userId: string, userRole: UserRole) {
    const scene = await this.prisma.cinematicScene.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!scene) throw new NotFoundException('Scene not found');
    if (userRole !== UserRole.ADMIN && scene.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.cinematicScene.delete({ where: { id } });
    return { message: 'Scene deleted' };
  }

  // ─── 3D Tour Sections + Scenes ────────────────────────────────────────────

  async addTourSection(slug: string, userId: string, userRole: UserRole, dto: CreateTourSectionDto) {
    const property = await this.assertOwner(slug, userId, userRole);
    const section = await this.prisma.tourSection3D.create({
      data: { propertyId: property.id, label: dto.label, order: dto.order ?? 0 },
    });
    if (!property.has3DTour) {
      await this.prisma.property.update({ where: { id: property.id }, data: { has3DTour: true } });
    }
    return section;
  }

  async addTourScene(sectionId: string, userId: string, userRole: UserRole, dto: CreateTourSceneDto) {
    const section = await this.prisma.tourSection3D.findUnique({
      where: { id: sectionId },
      include: { property: { include: { developer: true } } },
    });
    if (!section) throw new NotFoundException('Tour section not found');
    if (userRole !== UserRole.ADMIN && section.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
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

  async list3DTour(slug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.tourSection3D.findMany({
      where: { propertyId: property.id },
      include: { scenes: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
  }

  async removeTourSection(id: string, userId: string, userRole: UserRole) {
    const section = await this.prisma.tourSection3D.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (userRole !== UserRole.ADMIN && section.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.tourSection3D.delete({ where: { id } });
    return { message: 'Section and its scenes deleted' };
  }

  /** Remove a single 3D scene (leaving its section intact). */
  async remove3DScene(id: string, userId: string, userRole: UserRole) {
    const scene = await this.prisma.tourScene3D.findUnique({
      where: { id },
      include: { section: { include: { property: { include: { developer: true } } } } },
    });
    if (!scene) throw new NotFoundException('Scene not found');
    if (userRole !== UserRole.ADMIN && scene.section.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.tourScene3D.delete({ where: { id } });
    return { message: 'Scene deleted' };
  }

  // ─── VR Tour Scenes ───────────────────────────────────────────────────────

  async addVRScene(slug: string, userId: string, userRole: UserRole, dto: CreateTourSceneDto) {
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

  async listVRTour(slug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.tourSceneVR.findMany({
      where: { propertyId: property.id },
      orderBy: { order: 'asc' },
    });
  }

  async removeVRScene(id: string, userId: string, userRole: UserRole) {
    const scene = await this.prisma.tourSceneVR.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!scene) throw new NotFoundException('VR scene not found');
    if (userRole !== UserRole.ADMIN && scene.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.tourSceneVR.delete({ where: { id } });
    return { message: 'VR scene deleted' };
  }

  // ─── Floor Plans ──────────────────────────────────────────────────────────

  async addFloorPlan(slug: string, userId: string, userRole: UserRole, dto: CreateFloorPlanDto) {
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

  async listFloorPlans(slug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.floorPlan.findMany({
      where: { propertyId: property.id },
      orderBy: { order: 'asc' },
    });
  }

  async removeFloorPlan(id: string, userId: string, userRole: UserRole) {
    const plan = await this.prisma.floorPlan.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!plan) throw new NotFoundException('Floor plan not found');
    if (userRole !== UserRole.ADMIN && plan.property.developer.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.floorPlan.delete({ where: { id } });
    return { message: 'Floor plan deleted' };
  }
}
