import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PropertyStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductionOrdersService } from '../production-tiers/production-orders.service.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { QueryPropertiesDto } from './dto/query-properties.dto.js';
import type { UpdatePropertyDto } from './dto/update-property.dto.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

async function uniqueSlug(prisma: PrismaService, base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (await prisma.property.findUnique({ where: { slug } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productionOrders: ProductionOrdersService,
  ) {}

  /**
   * Turn selected production services into order rows. Never allowed to fail
   * the write that triggered it — an unsynced order is an ops problem, losing
   * the developer's submission is not.
   */
  private async syncOrders(propertyId: string): Promise<void> {
    try {
      await this.productionOrders.syncFromSubmission(propertyId);
    } catch (err) {
      this.logger.error(
        `Could not sync production orders for ${propertyId}: ${(err as Error).message}`,
      );
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreatePropertyDto) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const slug = await uniqueSlug(this.prisma, slugify(dto.name));

    const created = await this.prisma.property.create({
      data: {
        slug,
        name: dto.name,
        tagline: dto.tagline,
        description: dto.description,
        category: dto.category,
        developerId: developer.id,
        neighborhood: dto.neighborhood,
        city: dto.city ?? 'Nairobi',
        county: dto.county,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heroImageUrl: dto.heroImageUrl,
        heroVideoUrl: dto.heroVideoUrl,
        priceFrom: dto.priceFrom,
        priceTo: dto.priceTo,
        tags: dto.tags ?? [],
        completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
        submissionData: dto.submissionData as object | undefined,
      },
    });

    await this.syncOrders(created.id);
    return created;
  }

  // ─── Public list ──────────────────────────────────────────────────────────

  async findAll(query: QueryPropertiesDto) {
    // The marketplace sends `search`; `q` is the documented name.
    const term = query.q ?? query.search;
    const priceMin = query.priceMin ? Number(query.priceMin) : undefined;
    const priceMax = query.priceMax ? Number(query.priceMax) : undefined;
    const bedrooms = query.bedrooms ? Number(query.bedrooms) : undefined;

    const where: Record<string, unknown> = {
      status: query.status ?? PropertyStatus.ACTIVE,
      ...(query.category && { category: query.category }),
      ...(query.city && { city: { contains: query.city, mode: 'insensitive' } }),
      ...(query.neighborhood && { neighborhood: { contains: query.neighborhood, mode: 'insensitive' } }),
      ...(query.has3DTour === 'true' && { has3DTour: true }),
      ...(query.hasVRTour === 'true' && { hasVRTour: true }),
      // priceFrom is the advertised entry price, so range filters compare against it
      ...((priceMin !== undefined || priceMax !== undefined) && {
        priceFrom: {
          ...(priceMin !== undefined && { gte: priceMin }),
          ...(priceMax !== undefined && { lte: priceMax }),
        },
      }),
      // match on the units actually offered rather than a property-level field
      ...(bedrooms !== undefined && { units: { some: { bedrooms: { gte: bedrooms } } } }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { tagline: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { neighborhood: { contains: term, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy =
      query.sortBy === 'newest'
        ? [{ createdAt: 'desc' as const }]
        : query.sortBy === 'price_asc'
          ? [{ priceFrom: 'asc' as const }]
          : query.sortBy === 'price_desc'
            ? [{ priceFrom: 'desc' as const }]
            : [{ isFeatured: 'desc' as const }, { createdAt: 'desc' as const }];

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy,
        include: {
          developer: { select: { companyName: true, logoUrl: true } },
          _count: { select: { units: true } },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  // ─── Get by slug (public) ─────────────────────────────────────────────────

  async findBySlug(slug: string) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: {
        developer: true,
        units: { orderBy: { price: 'asc' } },
        floorPlans: true,
        amenities: true,
        media: { orderBy: { order: 'asc' } },
        cinematicScenes: { orderBy: { order: 'asc' } },
        tourSections3D: { include: { scenes: true }, orderBy: { order: 'asc' } },
        tourScenesVR: { orderBy: { order: 'asc' } },
        constructionUpdates: { orderBy: { date: 'desc' }, take: 5 },
        rentListings: { where: { status: { not: 'ARCHIVED' } } },
        _count: { select: { savedBy: true, inquiries: true } },
      },
    });
    if (!property || property.status === PropertyStatus.ARCHIVED) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }

  // ─── Developer: my properties ─────────────────────────────────────────────

  async findMyProperties(userId: string, query: QueryPropertiesDto) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const where: Record<string, unknown> = {
      developerId: developer.id,
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { tagline: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { units: true, inquiries: true } } },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(slug: string, userId: string, userRole: UserRole, dto: UpdatePropertyDto) {
    const property = await this.prisma.property.findUnique({ where: { slug }, include: { developer: true } });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const updated = await this.prisma.property.update({
      where: { slug },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.neighborhood !== undefined && { neighborhood: dto.neighborhood }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.county !== undefined && { county: dto.county }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
        ...(dto.heroVideoUrl !== undefined && { heroVideoUrl: dto.heroVideoUrl }),
        ...(dto.priceFrom !== undefined && { priceFrom: dto.priceFrom }),
        ...(dto.priceTo !== undefined && { priceTo: dto.priceTo }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.completionDate !== undefined && { completionDate: new Date(dto.completionDate) }),
        // Previously accepted by the DTO but never written, so editing a
        // submission silently discarded any change to the selected services.
        ...(dto.submissionData !== undefined && { submissionData: dto.submissionData as object }),
      },
    });

    if (dto.submissionData !== undefined) await this.syncOrders(updated.id);

    // the property photo is the face of everything listed under it — keep
    // its rent listings in sync when it changes
    if (dto.heroImageUrl !== undefined) {
      await this.prisma.rentListing.updateMany({
        where: { propertyId: property.id },
        data: { heroImageUrl: dto.heroImageUrl },
      });
    }

    return updated;
  }

  // ─── Publish / Unpublish ──────────────────────────────────────────────────

  async setStatus(slug: string, userId: string, userRole: UserRole, status: PropertyStatus) {
    const property = await this.prisma.property.findUnique({ where: { slug }, include: { developer: true } });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    return this.prisma.property.update({ where: { slug }, data: { status } });
  }

  // ─── Delete (soft: archive) ───────────────────────────────────────────────

  async archive(slug: string, userId: string, userRole: UserRole) {
    return this.setStatus(slug, userId, userRole, PropertyStatus.ARCHIVED);
  }
}
