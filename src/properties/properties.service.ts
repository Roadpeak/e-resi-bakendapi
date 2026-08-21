import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PropertyStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { clearDeleteBlockers } from './delete-blockers.js';
import { ProductionOrdersService } from '../production-tiers/production-orders.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { QueryPropertiesDto } from './dto/query-properties.dto.js';
import type { UpdateBrandingDto } from './dto/update-branding.dto.js';
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

/**
 * Drop blank fields and sections that end up empty.
 *
 * A blank string and an absent key mean the same thing to the renderer — the
 * template's own wording — so storing blanks would only bloat the row and make
 * "has this been customised?" harder to answer.
 */
function pruneSectionCopy(input: Record<string, object>) {
  const out: Record<string, Record<string, string>> = {};
  for (const [sectionId, fields] of Object.entries(input ?? {})) {
    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries((fields ?? {}) as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) kept[key] = value.trim();
    }
    if (Object.keys(kept).length) out[sectionId] = kept;
  }
  return out;
}

/**
 * The frontend's fallback presentation. Must match DEFAULT_PRICE_DISPLAY in
 * web/apps/web/lib/units/unit-types.ts.
 */
const DEFAULT_PRICE_DISPLAY = 'from';

/**
 * Store only the choices that differ from the default.
 *
 * A developer who leaves every type alone should persist nothing, so "has this
 * been customised?" stays answerable and the stored default never diverges
 * from the rendered one.
 */
function pruneUnitPriceDisplay(input: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [typeKey, mode] of Object.entries(input ?? {})) {
    if (typeof mode === 'string' && mode && mode !== DEFAULT_PRICE_DISPLAY) {
      out[typeKey] = mode;
    }
  }
  return out;
}

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productionOrders: ProductionOrdersService,
    private readonly events: PlatformEventsService,
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
        ...(dto.currency && { currency: dto.currency.toUpperCase() }),
        tags: dto.tags ?? [],
        // On-site facilities. Nearby landmarks are Amenity rows, not these.
        features: dto.features ?? [],
        completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
        submissionData: dto.submissionData as object | undefined,
      },
    });

    await this.syncOrders(created.id);

    // Admin notifications email every active admin, and a send is only as
    // fast as the mail provider. Awaiting that fan-out made creating a
    // development hang past the gateway timeout whenever mail was slow — the
    // developer saw a 504 for a property that had in fact been created, and
    // retried, producing duplicates.
    //
    // The property is saved by this point, so notifying is follow-up work: it
    // runs detached and its failure is logged rather than returned.
    void this.notifyAdminsOfSubmission(created.id, created.name, developer.companyName);

    return created;
  }

  /** Fire-and-forget admin alerts for a new submission. Never throws. */
  private async notifyAdminsOfSubmission(
    propertyId: string,
    propertyName: string,
    companyName: string,
  ): Promise<void> {
    try {
      // A new development lands in the review queue. Admins had no signal for
      // this before — the queue was poll-only.
      await this.events.propertySubmitted(propertyName, companyName, propertyId);

      // Any services picked with it are work someone has to schedule.
      const orders = await this.prisma.productionOrder.findMany({
        where: { propertyId, status: 'ORDERED' },
        select: { label: true, amount: true, currency: true },
      });
      await this.events.productionOrdered(propertyName, companyName, orders);
    } catch (err) {
      this.logger.error(
        `Could not notify admins about ${propertyName}: ${(err as Error).message}`,
      );
    }
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
          // Card gallery strips only need a few thumbnails, not the full asset shape.
          media: {
            orderBy: { order: 'asc' },
            take: 8,
            select: { url: true, title: true },
          },
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

  /**
   * Update the mini-site branding for one development.
   *
   * Kept apart from update() because these are presentation settings, edited
   * from the customise screen rather than the listing form. White-label and
   * custom domains are commercial tiers, so both are admin-gated here — a
   * developer toggling whiteLabel themselves would remove our attribution
   * without ever paying for it.
   */
  async updateBranding(
    slug: string,
    userId: string,
    userRole: UserRole,
    dto: UpdateBrandingDto,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const isAdmin = userRole === UserRole.ADMIN;
    if (!isAdmin && dto.whiteLabel !== undefined) {
      throw new ForbiddenException('White-label is enabled by e-resi on your plan');
    }
    if (!isAdmin && dto.customDomain !== undefined) {
      throw new ForbiddenException('Custom domains are set up by e-resi on your plan');
    }

    if (dto.customDomain) {
      // Domains route requests, so a duplicate would make resolution ambiguous.
      const clash = await this.prisma.property.findFirst({
        where: { customDomain: dto.customDomain, NOT: { slug } },
        select: { slug: true },
      });
      if (clash) throw new BadRequestException('That domain is already in use');
    }

    return this.prisma.property.update({
      where: { slug },
      data: {
        ...(dto.brandColor !== undefined && { brandColor: dto.brandColor }),
        ...(dto.brandFont !== undefined && { brandFont: dto.brandFont }),
        ...(dto.templateKey !== undefined && { templateKey: dto.templateKey }),
        ...(dto.heroStyle !== undefined && { heroStyle: dto.heroStyle }),
        ...(dto.sectionOrder !== undefined && { sectionOrder: dto.sectionOrder }),
        ...(dto.hiddenSections !== undefined && { hiddenSections: dto.hiddenSections }),
        // Stored as given, minus empty entries: a developer who clears every
        // field for a section should leave no key behind, or the JSON grows
        // with dead sections nobody can see or remove.
        ...(dto.sectionCopy !== undefined && {
          sectionCopy: pruneSectionCopy(dto.sectionCopy),
        }),
        // Entries matching the default are dropped rather than stored: it is
        // the frontend's fallback anyway, and keeping them would freeze this
        // property against any future change to that default.
        ...(dto.unitPriceDisplay !== undefined && {
          unitPriceDisplay: pruneUnitPriceDisplay(dto.unitPriceDisplay),
        }),
        ...(dto.ctaLabel !== undefined && { ctaLabel: dto.ctaLabel }),
        ...(dto.navbarStyle !== undefined && { navbarStyle: dto.navbarStyle }),
        ...(dto.navbarTheme !== undefined && { navbarTheme: dto.navbarTheme }),
        ...(dto.heroOverlay !== undefined && { heroOverlay: dto.heroOverlay as boolean }),
        ...(dto.customDomain !== undefined && { customDomain: dto.customDomain || null }),
        ...(dto.whiteLabel !== undefined && { whiteLabel: dto.whiteLabel as boolean }),
      },
    });
  }

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
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.features !== undefined && { features: dto.features }),
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

  /**
   * Permanently delete a listing the developer owns.
   *
   * Archiving alone left no way to remove a development that should never have
   * existed — a duplicate, a typo, a draft abandoned halfway. Those sat in the
   * dashboard forever, and the only recourse was to ask us.
   *
   * Deliberately narrower than the admin's equivalent: a developer may delete
   * a draft or an archived listing, never a live one. A live listing has been
   * seen by buyers and may carry their bookings, so taking it down is a
   * status change that we keep a record of, not an erasure.
   */
  async remove(slug: string, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: {
        developer: true,
        _count: { select: { bookings: true, inquiries: true, rentListings: true } },
      },
    });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const deletable: PropertyStatus[] = [PropertyStatus.DRAFT, PropertyStatus.ARCHIVED];
    if (!deletable.includes(property.status)) {
      throw new BadRequestException(
        `${property.name} is live. Archive it first — deleting a published `
        + 'listing would remove viewings and enquiries buyers have already made.',
      );
    }

    // An archived listing was live once, so it can hold a real buyer's
    // booking. Deleting it would destroy that record silently.
    if (property.status === PropertyStatus.ARCHIVED) {
      const blockers = [
        ['rent listing', property._count.rentListings],
        ['booking', property._count.bookings],
        ['enquiry', property._count.inquiries],
      ].filter(([, n]) => (n as number) > 0)
        .map(([label, n]) => `${n} ${label}${(n as number) === 1 ? '' : 's'}`);

      if (blockers.length) {
        throw new BadRequestException(
          `${property.name} still has ${blockers.join(', ')} against it, so it `
          + 'cannot be deleted. It stays archived and hidden from buyers.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (property.status === PropertyStatus.DRAFT) {
        await clearDeleteBlockers(tx, property.id);
      }
      await tx.property.delete({ where: { slug } });
    });

    return { message: `${property.name} deleted` };
  }
}
