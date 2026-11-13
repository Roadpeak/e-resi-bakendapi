import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PropertyCategory, RentListingStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify, uniqueSlug } from './slug.util.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { areasMatch } from '../neighborhoods/neighborhoods.service.js';
import type { CreateRentListingDto } from './dto/create-rent-listing.dto.js';
import type { UpdateRentListingDto } from './dto/update-rent-listing.dto.js';
import type { CreateRentUnitDto } from './dto/create-rent-unit.dto.js';

@Injectable()
export class RentListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who may manage this listing.
   *
   * Developer listings answer to the developer, as always. An owner-listed
   * unit answers to whoever the owner put in charge: themselves, the
   * developer (when delegated), or the letting agent they engaged — and
   * NOT to the developer merely because the unit sits in their building.
   * An owner keeps edit rights over their own listing in every mode; hiring
   * a manager is a delegation, not a surrender.
   */
  private async assertOwner(rentListingId: string, userId: string, userRole: UserRole) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { id: rentListingId },
      include: {
        developer: true,
        managingAgent: { select: { userId: true } },
        listedByAgent: { select: { userId: true } },
      },
    });
    if (!listing) throw new NotFoundException('Rent listing not found');
    if (userRole === UserRole.ADMIN) return listing;

    const isOwner = listing.ownerId === userId;
    const isManagingAgent = listing.managingAgent?.userId === userId;
    const isListingAgent = listing.listedByAgent?.userId === userId;
    const isDeveloper = listing.developer?.userId === userId;
    // An agent-listed rental is the agent's to run; the developer of the
    // building does not manage it merely because the units are theirs.
    const developerMayManage =
      isDeveloper && !listing.listedByAgentId
      && (listing.ownerId === null || listing.managerKind === 'DEVELOPER');

    if (!isOwner && !isManagingAgent && !isListingAgent && !developerMayManage) {
      throw new ForbiddenException('You do not manage this rent listing');
    }
    return listing;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Which developments a user may let: a developer their own; an agent the
   * developments they list themselves, plus those assigned to them for
   * letting through an active partnership.
   */
  private async lettableProperty(userId: string, userRole: UserRole, propertySlug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole === UserRole.AGENT) {
      const agent = await this.prisma.agentProfile.findUnique({ where: { userId } });
      if (!agent) throw new ForbiddenException('Agent profile required');
      if (property.listedByAgentId === agent.id) return { property, developerId: property.developerId, agentId: agent.id };
      const assigned = await this.prisma.propertyAssignment.findFirst({
        where: {
          propertyId: property.id, kind: 'RENT', isActive: true,
          partnership: { agentId: agent.id, status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!assigned) throw new ForbiddenException('This development is not yours to let');
      return { property, developerId: property.developerId, agentId: agent.id };
    }

    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');
    if (property.developerId !== developer.id) throw new ForbiddenException('Property does not belong to you');
    return { property, developerId: developer.id, agentId: null as string | null };
  }

  /**
   * A standalone rental has no development behind it: the agent (or
   * developer) listing it is its owner, and it carries its own kind,
   * photos, features and location.
   */
  private async standaloneOwner(userId: string, userRole: UserRole) {
    if (userRole === UserRole.AGENT) {
      const agent = await this.prisma.agentProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!agent) throw new ForbiddenException('Agent profile required');
      return { developerId: null as string | null, agentId: agent.id as string | null };
    }
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!developer) throw new ForbiddenException('Developer profile required');
    return { developerId: developer.id as string | null, agentId: null as string | null };
  }

  async create(userId: string, dto: CreateRentListingDto, userRole: UserRole = UserRole.DEVELOPER) {
    const { property, developerId, agentId } = dto.propertySlug
      ? await this.lettableProperty(userId, userRole, dto.propertySlug)
      : { property: null, ...(await this.standaloneOwner(userId, userRole)) };
    if (!property && !dto.city) throw new BadRequestException('A standalone rental needs a city');

    const slug = await uniqueSlug(this.prisma, slugify(dto.name));

    return this.prisma.rentListing.create({
      data: {
        slug,
        name: dto.name,
        tagline: dto.tagline,
        description: dto.description,
        ...(property && { propertyId: property.id }),
        developerId,
        ...(agentId && { listedByAgentId: agentId, managerKind: 'AGENT' as const, managingAgentId: agentId }),
        ...(!property && { category: dto.category ?? 'APARTMENT' }),
        hideExactLocation: dto.hideExactLocation ?? !property,
        features: dto.features ?? [],
        latitude: dto.latitude ?? property?.latitude,
        longitude: dto.longitude ?? property?.longitude,
        county: dto.county ?? property?.county,
        furnishing: dto.furnishing ?? 'UNFURNISHED',
        neighborhood: dto.neighborhood ?? property?.neighborhood,
        city: dto.city ?? property?.city,
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

  /**
   * The typed neighbourhood spellings that belong to an area guide —
   * "Kilimani ward" and "Kilimani" both count for kilimani-nairobi.
   * Null when the guide does not exist.
   */
  private async areaSpellings(areaSlug: string): Promise<string[] | null> {
    const guide = await this.prisma.neighborhood.findUnique({ where: { slug: areaSlug }, select: { name: true } });
    if (!guide) return null;
    const rows = await this.prisma.rentListing.findMany({
      where: { status: { not: RentListingStatus.ARCHIVED }, neighborhood: { not: null } },
      distinct: ['neighborhood'],
      select: { neighborhood: true },
    });
    return rows.map((r) => r.neighborhood as string).filter((n) => areasMatch(n, guide.name));
  }

  async findAll(pagination: PaginationDto, city?: string, q?: string, category?: PropertyCategory, area?: string) {
    let spellings: string[] | null = null;
    if (area) {
      spellings = await this.areaSpellings(area);
      if (!spellings?.length) {
        return { data: [], meta: { total: 0, page: pagination.page, limit: pagination.limit, totalPages: 0 } };
      }
    }
    const where: Record<string, unknown> = {
      status: { not: RentListingStatus.ARCHIVED },
      ...(spellings && { neighborhood: { in: spellings } }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      // In-development listings take their kind from the building; standalone
      // ones carry their own.
      ...(category && { OR: [{ category }, { property: { category } }] }),
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
          developer: { select: { companyName: true, logoUrl: true, phone: true, whatsapp: true } },
          listedByAgent: { select: { displayName: true, photoUrl: true } },
          // Call / WhatsApp buttons on the browse cards reach whoever runs the letting.
          managingAgent: { select: { phone: true, whatsapp: true } },
          rentUnits: { select: { label: true, pricePerMonth: true, available: true, total: true, bedrooms: true } },
          media: {
            orderBy: { order: 'asc' },
            take: 8,
            select: { url: true, title: true },
          },
          // Rent listings rarely have their own uploads — they're units within a
          // development, so fall back to the parent property's gallery below.
          property: { select: { media: { orderBy: { order: 'asc' }, take: 8, select: { url: true, title: true } } } },
        },
      }),
      this.prisma.rentListing.count({ where }),
    ]);

    return {
      data: data.map(({ property, ...listing }) => ({
        ...listing,
        ...(listing.hideExactLocation && { latitude: null, longitude: null }),
        media: listing.media.length > 0 ? listing.media : (property?.media ?? []),
      })),
      meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Public: by slug ──────────────────────────────────────────────────────

  async findBySlug(slug: string) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { slug },
      include: {
        developer: true,
        listedByAgent: { select: { id: true, displayName: true, photoUrl: true, phone: true } },
        // Who a tenant deals with when an agent runs the letting.
        managingAgent: { select: { id: true, displayName: true, photoUrl: true, logoUrl: true, phone: true, whatsapp: true } },
        property: {
          select: {
            id: true, slug: true, name: true, heroImageUrl: true,
            has3DTour: true, hasCinematicTour: true, hasVRTour: true,
            latitude: true, longitude: true, neighborhood: true, city: true,
            features: true, unitFeatures: true, petsAllowed: true, petPolicy: true, leaseTerms: true,
            // A short film of the building, for the listing's video card.
            cinematicScenes: {
              orderBy: { order: 'asc' }, take: 4,
              select: { id: true, label: true, videoUrl: true, thumbnailUrl: true },
            },
            // A rental is units inside a building, so the development's
            // photography is what the listing page falls back to when the
            // listing has none of its own. Without this the tenant sees a
            // single hero image and nothing else.
            media: {
              orderBy: { order: 'asc' },
              take: 12,
              select: { url: true, title: true, type: true },
            },
            amenities: true,
          },
        },
        rentUnits: true,
        media: { orderBy: { order: 'asc' } },
        inquiries: false,
      },
    });
    if (!listing || listing.status === 'ARCHIVED') throw new NotFoundException('Rent listing not found');
    if (listing.hideExactLocation) {
      // Area only: the exact spot is shared once the tenant gets in touch.
      return {
        ...listing,
        latitude: null,
        longitude: null,
        ...(listing.property && { property: { ...listing.property, latitude: null, longitude: null } }),
      };
    }
    return listing;
  }

  // ─── Developer: my listings ───────────────────────────────────────────────

  async findMyListings(userId: string, pagination: PaginationDto, userRole: UserRole = UserRole.DEVELOPER) {
    let where: Record<string, unknown>;
    if (userRole === UserRole.AGENT) {
      const agent = await this.prisma.agentProfile.findUnique({ where: { userId } });
      if (!agent) throw new ForbiddenException('Agent profile required');
      // Rentals they listed, and owners' units they were engaged to let.
      where = { OR: [{ listedByAgentId: agent.id }, { managingAgentId: agent.id }] };
    } else {
      const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
      if (!developer) throw new ForbiddenException('Developer profile required');
      where = { developerId: developer.id, listedByAgentId: null };
    }

    const [data, total] = await Promise.all([
      this.prisma.rentListing.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { rentUnits: true, _count: { select: { inquiries: true, bookings: true } } },
      }),
      this.prisma.rentListing.count({ where }),
    ]);

    // Visits per listing, last 30 days and all time.
    const ids = data.map((l) => l.id);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [all, recent] = ids.length
      ? await Promise.all([
        this.prisma.analyticsEvent.groupBy({ by: ['rentListingId'], where: { rentListingId: { in: ids }, type: 'PAGE_VIEW' }, _count: { _all: true } }),
        this.prisma.analyticsEvent.groupBy({ by: ['rentListingId'], where: { rentListingId: { in: ids }, type: 'PAGE_VIEW', createdAt: { gte: since } }, _count: { _all: true } }),
      ])
      : [[], []];
    const allBy = new Map(all.map((g) => [g.rentListingId, g._count._all]));
    const recentBy = new Map(recent.map((g) => [g.rentListingId, g._count._all]));

    return {
      data: data.map((l) => ({
        ...l,
        stats: {
          views: allBy.get(l.id) ?? 0,
          views30d: recentBy.get(l.id) ?? 0,
          leads: l._count.inquiries + l._count.bookings,
        },
      })),
      meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  /**
   * One rental's numbers for whoever runs it: visits by day, unique visitors,
   * where they came from, contact taps, and the leads it produced.
   */
  async stats(id: string, userId: string, userRole: UserRole, days = 30) {
    await this.assertOwner(id, userId, userRole);
    const span = Math.max(7, Math.min(days, 90));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (span - 1));

    const [events, inquiries, bookings, reservations] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where: { rentListingId: id, createdAt: { gte: since } },
        select: { type: true, sessionId: true, userId: true, source: true, metadata: true, createdAt: true },
      }),
      this.prisma.inquiry.findMany({
        where: { rentListingId: id },
        orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, name: true, email: true, phone: true, message: true, status: true, createdAt: true },
      }),
      this.prisma.booking.findMany({
        where: { rentListingId: id },
        orderBy: { createdAt: 'desc' }, take: 20,
        select: { id: true, name: true, email: true, phone: true, date: true, time: true, type: true, status: true, createdAt: true },
      }),
      this.prisma.reservation.count({ where: { rentUnit: { rentListingId: id } } }).catch(() => 0),
    ]);

    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const daily: { date: string; views: number; leads: number }[] = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      daily.push({ date: key(d), views: 0, leads: 0 });
    }
    const byDay = new Map(daily.map((x) => [x.date, x]));
    const views = events.filter((e) => e.type === 'PAGE_VIEW');
    for (const e of views) { const b = byDay.get(key(e.createdAt)); if (b) b.views += 1; }
    for (const l of [...inquiries, ...bookings]) { const b = byDay.get(key(l.createdAt)); if (b) b.leads += 1; }

    const sources = new Map<string, number>();
    for (const e of views) sources.set(e.source || 'direct', (sources.get(e.source || 'direct') ?? 0) + 1);
    const contact = events.filter((e) => e.type === 'CONTACT_CLICK');
    const channel = (m: unknown) => (m && typeof m === 'object' && 'channel' in m ? String((m as { channel: unknown }).channel) : 'other');

    return {
      days: span,
      totals: {
        views: views.length,
        visitors: new Set(views.map((e) => e.sessionId ?? e.userId ?? '')).size,
        signedInVisitors: new Set(views.filter((e) => e.userId).map((e) => e.userId)).size,
        whatsapp: contact.filter((e) => channel(e.metadata) === 'whatsapp').length,
        calls: contact.filter((e) => channel(e.metadata) === 'phone').length,
        enquiries: inquiries.filter((i) => i.createdAt >= since).length,
        viewings: bookings.filter((b) => b.createdAt >= since).length,
        reservations,
      },
      daily,
      sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      leads: [
        ...inquiries.map((i) => ({ id: i.id, kind: 'ENQUIRY' as const, name: i.name, email: i.email, phone: i.phone, note: i.message, status: i.status, createdAt: i.createdAt })),
        ...bookings.map((b) => ({
          id: b.id, kind: 'VIEWING' as const, name: b.name, email: b.email, phone: b.phone,
          note: `${b.type === 'VIRTUAL' ? 'Virtual tour' : 'Viewing'} on ${b.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${b.time}`,
          status: b.status, createdAt: b.createdAt,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20),
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
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.hideExactLocation !== undefined && { hideExactLocation: dto.hideExactLocation }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.county !== undefined && { county: dto.county }),
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
    const unit = await this.prisma.rentUnit.findUnique({ where: { id: rentUnitId }, select: { rentListingId: true } });
    if (!unit) throw new NotFoundException('Rent unit not found');
    await this.assertOwner(unit.rentListingId, userId, userRole);
    await this.prisma.rentUnit.delete({ where: { id: rentUnitId } });
    return { message: 'Rent unit removed' };
  }
}
