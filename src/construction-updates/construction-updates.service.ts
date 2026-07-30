import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateConstructionUpdateDto } from './dto/create-construction-update.dto.js';
import type { UpdateConstructionUpdateDto } from './dto/update-construction-update.dto.js';

@Injectable()
export class ConstructionUpdatesService {
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

  async create(propertySlug: string, userId: string, userRole: UserRole, dto: CreateConstructionUpdateDto) {
    const property = await this.assertOwner(propertySlug, userId, userRole);

    return this.prisma.constructionUpdate.create({
      data: {
        propertyId: property.id,
        title: dto.title,
        description: dto.description,
        percentComplete: dto.percentComplete,
        images: dto.images ?? [],
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
  }

  async findAll(propertySlug: string, pagination: PaginationDto) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    const [data, total] = await Promise.all([
      this.prisma.constructionUpdate.findMany({
        where: { propertyId: property.id },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { date: 'desc' },
      }),
      this.prisma.constructionUpdate.count({ where: { propertyId: property.id } }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page ?? 1,
        limit: pagination.limit ?? 20,
        totalPages: Math.ceil(total / (pagination.limit ?? 20)),
      },
    };
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateConstructionUpdateDto) {
    const update = await this.prisma.constructionUpdate.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!update) throw new NotFoundException('Construction update not found');
    if (userRole !== UserRole.ADMIN && update.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    return this.prisma.constructionUpdate.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.percentComplete !== undefined && { percentComplete: dto.percentComplete }),
        ...(dto.images !== undefined && { images: dto.images }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const update = await this.prisma.constructionUpdate.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!update) throw new NotFoundException('Construction update not found');
    if (userRole !== UserRole.ADMIN && update.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    await this.prisma.constructionUpdate.delete({ where: { id } });
    return { message: 'Construction update deleted' };
  }
}
