import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@Injectable()
export class AdminPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

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
    const before = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: { select: { userId: true } } },
    });
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

    // The developer is waiting on this decision — tell them either way, and
    // carry the reason when it is a rejection.
    const owner = before.developer.userId;
    if (decision === 'APPROVE') {
      await this.events.propertyApproved(owner, { id: after.id, name: after.name, slug: after.slug });
    } else {
      await this.events.propertyRejected(owner, { id: after.id, name: after.name }, notes);
    }

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

  /**
   * Permanently delete a property. Media, units, tours and reservations cascade
   * with it; rent listings, bookings and inquiries deliberately do not, so those
   * are checked up front — otherwise Postgres rejects the delete with a foreign
   * key error that tells the admin nothing about what is actually in the way.
   *
   * Archiving via setStatus is the reversible option; this is not.
   */
  async remove(slug: string) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: {
        _count: { select: { rentListings: true, bookings: true, inquiries: true } },
      },
    });
    if (!property) throw new NotFoundException('Property not found');

    const blockers = [
      ['rent listing', property._count.rentListings],
      ['booking', property._count.bookings],
      ['inquiry', property._count.inquiries],
    ].filter(([, n]) => (n as number) > 0)
      .map(([label, n]) => `${n} ${label}${(n as number) === 1 ? '' : 's'}`);

    if (blockers.length) {
      throw new BadRequestException(
        `${property.name} still has ${blockers.join(', ')}. `
        + 'Remove those first, or archive the property instead of deleting it.',
      );
    }

    await this.prisma.property.delete({ where: { slug } });
    return property;
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
