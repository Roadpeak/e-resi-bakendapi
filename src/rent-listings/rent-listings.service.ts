import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RentListingStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateRentListingDto } from './dto/create-rent-listing.dto.js';
import type { UpdateRentListingDto } from './dto/update-rent-listing.dto.js';
import type { CreateRentUnitDto } from './dto/create-rent-unit.dto.js';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
}

async function uniqueSlug(prisma: PrismaService, base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (await prisma.rentListing.findUnique({ where: { slug } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

@Injectable()
export class RentListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwner(rentListingId: string, userId: string, userRole: UserRole) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { id: rentListingId },
      include: { developer: true },
    });
    if (!listing) throw new NotFoundException('Rent listing not found');
    if (userRole !== UserRole.ADMIN && listing.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this rent listing');
    }
    return listing;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateRentListingDto) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
    if (!property) throw new NotFoundException('Property not found');
    if (property.developerId !== developer.id) throw new ForbiddenException('Property does not belong to you');

    const slug = await uniqueSlug(this.prisma, slugify(dto.name));

    return this.prisma.rentListing.create({
      data: {
        slug,
        name: dto.name,
        tagline: dto.tagline,
        description: dto.description,
        propertyId: property.id,
        developerId: developer.id,
        furnishing: dto.furnishing ?? 'UNFURNISHED',
        neighborhood: dto.neighborhood,
        city: dto.city ?? property.city,
        priceFrom: dto.priceFrom,
        ...(dto.currency && { currency: dto.currency.toUpperCase() }),
        priceTo: dto.priceTo,
        heroImageUrl: dto.heroImageUrl,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        minLeaseTerm: dto.minLeaseTerm ?? 12,
        tags: dto.tags ?? [],
      },
    });
  }

  // ─── Public: list ──────────────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, city?: string, q?: string) {
    const where: Record<string, unknown> = {
      status: { not: RentListingStatus.ARCHIVED },
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(q && {
        // "search by area, building or listing" — match location too, not just the name
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { tagline: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { neighborhood: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.rentListing.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: {
          developer: { select: { companyName: true, logoUrl: true } },
          rentUnits: { select: { label: true, pricePerMonth: true, available: true, total: true, bedrooms: true } },
          media: {
            orderBy: { order: 'asc' },
            take: 8,
            select: { url: true, title: true },
          },
        },
      }),
      this.prisma.rentListing.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Public: by slug ──────────────────────────────────────────────────────

  async findBySlug(slug: string) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { slug },
      include: {
        developer: true,
        property: { select: { id: true, slug: true, name: true, heroImageUrl: true, has3DTour: true, hasCinematicTour: true } },
        rentUnits: true,
        media: { orderBy: { order: 'asc' } },
        inquiries: false,
      },
    });
    if (!listing || listing.status === 'ARCHIVED') throw new NotFoundException('Rent listing not found');
    return listing;
  }

  // ─── Developer: my listings ───────────────────────────────────────────────

  async findMyListings(userId: string, pagination: PaginationDto) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const [data, total] = await Promise.all([
      this.prisma.rentListing.findMany({
        where: { developerId: developer.id },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { rentUnits: true, _count: { select: { inquiries: true } } },
      }),
      this.prisma.rentListing.count({ where: { developerId: developer.id } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateRentListingDto) {
    await this.assertOwner(id, userId, userRole);
    return this.prisma.rentListing.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.furnishing !== undefined && { furnishing: dto.furnishing }),
        ...(dto.neighborhood !== undefined && { neighborhood: dto.neighborhood }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.priceFrom !== undefined && { priceFrom: dto.priceFrom }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.priceTo !== undefined && { priceTo: dto.priceTo }),
        ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
        ...(dto.availableFrom !== undefined && { availableFrom: new Date(dto.availableFrom) }),
        ...(dto.minLeaseTerm !== undefined && { minLeaseTerm: dto.minLeaseTerm }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
  }

  // ─── Set status ───────────────────────────────────────────────────────────

  async setStatus(id: string, userId: string, userRole: UserRole, status: RentListingStatus) {
    await this.assertOwner(id, userId, userRole);
    return this.prisma.rentListing.update({ where: { id }, data: { status } });
  }

  // ─── Rent Units CRUD ──────────────────────────────────────────────────────

  async addRentUnit(rentListingId: string, userId: string, userRole: UserRole, dto: CreateRentUnitDto) {
    await this.assertOwner(rentListingId, userId, userRole);
    return this.prisma.rentUnit.create({
      data: {
        rentListingId,
        label: dto.label,
        unitId: dto.unitId,
        unitType: dto.unitType,
        floor: dto.floor,
        bedrooms: dto.bedrooms ?? 1,
        bathrooms: dto.bathrooms ?? 1,
        sqm: dto.sqm,
        pricePerMonth: dto.pricePerMonth,
        available: dto.available ?? 0,
        total: dto.total ?? 1,
        furnishing: dto.furnishing ?? 'UNFURNISHED',
        features: dto.features ?? [],
        showCinematicTour: dto.showCinematicTour ?? false,
        show3DTour: dto.show3DTour ?? false,
        showVRTour: dto.showVRTour ?? false,
      },
    });
  }

  async removeRentUnit(rentUnitId: string, userId: string, userRole: UserRole) {
    const unit = await this.prisma.rentUnit.findUnique({
      where: { id: rentUnitId },
      include: { rentListing: { include: { developer: true } } },
    });
    if (!unit) throw new NotFoundException('Rent unit not found');
    if (userRole !== UserRole.ADMIN && unit.rentListing.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this rent unit');
    }
    await this.prisma.rentUnit.delete({ where: { id: rentUnitId } });
    return { message: 'Rent unit removed' };
  }
}
