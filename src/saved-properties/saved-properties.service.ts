import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@Injectable()
export class SavedPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async save(userId: string, propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    const existing = await this.prisma.savedProperty.findUnique({
      where: { userId_propertyId: { userId, propertyId: property.id } },
    });
    if (existing) throw new ConflictException('Property already saved');

    return this.prisma.savedProperty.create({
      data: { userId, propertyId: property.id },
      include: { property: { select: { slug: true, name: true, heroImageUrl: true, city: true, priceFrom: true } } },
    });
  }

  async unsave(userId: string, propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    const existing = await this.prisma.savedProperty.findUnique({
      where: { userId_propertyId: { userId, propertyId: property.id } },
    });
    if (!existing) throw new NotFoundException('Property not in saved list');

    await this.prisma.savedProperty.delete({
      where: { userId_propertyId: { userId, propertyId: property.id } },
    });

    return { message: 'Property removed from saved list' };
  }

  async findMine(userId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.savedProperty.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              id: true, slug: true, name: true, heroImageUrl: true,
              city: true, category: true, priceFrom: true, priceTo: true,
              hasCinematicTour: true, has3DTour: true, hasVRTour: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.savedProperty.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  async isSaved(userId: string, propertySlug: string): Promise<{ saved: boolean }> {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) return { saved: false };
    const saved = await this.prisma.savedProperty.findUnique({
      where: { userId_propertyId: { userId, propertyId: property.id } },
    });
    return { saved: !!saved };
  }
}
