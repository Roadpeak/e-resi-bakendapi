import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { UpdateUnitDto } from './dto/update-unit.dto.js';

@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPropertyOwner(propertySlug: string, userId: string, userRole: UserRole) {
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

  async create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateUnitDto) {
    const property = await this.assertPropertyOwner(propertySlug, userId, userRole);
    return this.prisma.unit.create({
      data: {
        propertyId: property.id,
        name: dto.name,
        floor: dto.floor,
        bedrooms: dto.bedrooms ?? 1,
        bathrooms: dto.bathrooms ?? 1,
        sqm: dto.sqm,
        price: dto.price,
        status: dto.status ?? 'AVAILABLE',
        features: dto.features ?? [],
      },
    });
  }

  async findAll(propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.unit.findMany({
      where: { propertyId: property.id },
      orderBy: [{ floor: 'asc' }, { price: 'asc' }],
    });
  }

  /**
   * Public unit detail — enriched with the parent property, its gallery
   * images, cinematic scenes and the unit's floor plan so the unit page can
   * stand on its own.
   */
  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true, slug: true, name: true, tagline: true, city: true,
            neighborhood: true, county: true, heroImageUrl: true, currency: true,
            hasCinematicTour: true, has3DTour: true, hasVRTour: true,
            developer: { select: { companyName: true, logoUrl: true } },
            media: { orderBy: { order: 'asc' } },
            cinematicScenes: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found');

    const floorPlan = unit.floorPlanId
      ? await this.prisma.floorPlan.findUnique({ where: { id: unit.floorPlanId } })
      : null;

    return { ...unit, floorPlan };
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (userRole !== UserRole.ADMIN && unit.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this unit');
    }
    return this.prisma.unit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.floor !== undefined && { floor: dto.floor }),
        ...(dto.bedrooms !== undefined && { bedrooms: dto.bedrooms }),
        ...(dto.bathrooms !== undefined && { bathrooms: dto.bathrooms }),
        ...(dto.sqm !== undefined && { sqm: dto.sqm }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.features !== undefined && { features: dto.features }),
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (userRole !== UserRole.ADMIN && unit.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this unit');
    }
    await this.prisma.unit.delete({ where: { id } });
    return { message: 'Unit deleted' };
  }
}
