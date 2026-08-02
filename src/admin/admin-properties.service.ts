import { Injectable, NotFoundException } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@Injectable()
export class AdminPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    pagination: PaginationDto,
    filters: { status?: PropertyStatus; developerId?: string; q?: string } = {},
  ) {
    const where = {
      ...(filters.status && { status: filters.status }),
      ...(filters.developerId && { developerId: filters.developerId }),
      ...(filters.q && {
        OR: [
          { name: { contains: filters.q, mode: 'insensitive' as const } },
          { city: { contains: filters.q, mode: 'insensitive' as const } },
          { neighborhood: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          city: true,
          neighborhood: true,
          heroImageUrl: true,
          isFeatured: true,
          priceFrom: true,
          currency: true,
          latitude: true,
          longitude: true,
          reviewNotes: true,
          reviewedAt: true,
          createdAt: true,
          developer: { select: { id: true, companyName: true } },
          _count: { select: { units: true, media: true, inquiries: true } },
        },
      }),
      this.prisma.property.count({ where }),
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

  /**
   * Approve or reject a submitted listing. Approving publishes it; rejecting
   * returns it to draft with a note the developer can act on.
   */
  async review(
    slug: string,
    decision: 'APPROVE' | 'REJECT',
    reviewerId: string,
    notes?: string,
  ) {
    const before = await this.prisma.property.findUnique({ where: { slug } });
    if (!before) throw new NotFoundException('Property not found');

    const after = await this.prisma.property.update({
      where: { slug },
      data: {
        status: decision === 'APPROVE' ? PropertyStatus.ACTIVE : PropertyStatus.DRAFT,
        reviewNotes: notes ?? null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    return { before, after };
  }

  async setStatus(slug: string, status: PropertyStatus) {
    const before = await this.prisma.property.findUnique({ where: { slug } });
    if (!before) throw new NotFoundException('Property not found');
    const after = await this.prisma.property.update({ where: { slug }, data: { status } });
    return { before, after };
  }

  async setFeatured(slug: string, isFeatured: boolean) {
    const before = await this.prisma.property.findUnique({ where: { slug } });
    if (!before) throw new NotFoundException('Property not found');
    const after = await this.prisma.property.update({ where: { slug }, data: { isFeatured } });
    return { before, after };
  }

  /** Move a listing to another developer — used when an account is closed. */
  async reassign(slug: string, developerId: string) {
    const before = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: { select: { companyName: true } } },
    });
    if (!before) throw new NotFoundException('Property not found');

    const target = await this.prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!target) throw new NotFoundException('Target developer not found');

    const after = await this.prisma.property.update({
      where: { slug },
      data: { developerId },
      include: { developer: { select: { companyName: true } } },
    });
    return { before, after };
  }
}
