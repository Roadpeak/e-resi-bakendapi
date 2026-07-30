import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AmenityType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateAmenityDto } from './dto/create-amenity.dto.js';

@Injectable()
export class AmenitiesService {
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

  async create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateAmenityDto) {
    const property = await this.assertOwner(propertySlug, userId, userRole);
    return this.prisma.amenity.create({
      data: {
        propertyId: property.id,
        name: dto.name,
        type: dto.type,
        distance: dto.distance,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async findAll(propertySlug: string, type?: AmenityType) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    return this.prisma.amenity.findMany({
      where: { propertyId: property.id, ...(type && { type }) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async bulkCreate(propertySlug: string, userId: string, userRole: UserRole, dtos: CreateAmenityDto[]) {
    const property = await this.assertOwner(propertySlug, userId, userRole);
    return this.prisma.amenity.createMany({
      data: dtos.map((dto) => ({
        propertyId: property.id,
        name: dto.name,
        type: dto.type,
        distance: dto.distance,
        latitude: dto.latitude,
        longitude: dto.longitude,
      })),
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const amenity = await this.prisma.amenity.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!amenity) throw new NotFoundException('Amenity not found');
    if (userRole !== UserRole.ADMIN && amenity.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }
    await this.prisma.amenity.delete({ where: { id } });
    return { message: 'Amenity deleted' };
  }

  async removeAll(propertySlug: string, userId: string, userRole: UserRole) {
    const property = await this.assertOwner(propertySlug, userId, userRole);
    const { count } = await this.prisma.amenity.deleteMany({ where: { propertyId: property.id } });
    return { message: `${count} amenity/amenities deleted` };
  }
}
