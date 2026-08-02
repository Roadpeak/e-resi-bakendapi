import { Injectable, NotFoundException } from '@nestjs/common';
import { RentListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

/** Cross-developer oversight: rentals, leads, bookings and conversations. */
@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Rentals ──────────────────────────────────────────────────────────────

  async rentListings(pagination: PaginationDto, status?: RentListingStatus) {
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.rentListing.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          developer: { select: { companyName: true } },
          property: { select: { slug: true, name: true } },
          rentUnits: {
            select: { id: true, label: true, floor: true, available: true, total: true, pricePerMonth: true },
          },
        },
      }),
      this.prisma.rentListing.count({ where }),
    ]);

    return { data, meta: this.meta(total, pagination) };
  }

  async setRentListingStatus(id: string, status: RentListingStatus) {
    const before = await this.prisma.rentListing.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Rent listing not found');
    const after = await this.prisma.rentListing.update({ where: { id }, data: { status } });
    return { before, after };
  }

  // ─── Inquiries ────────────────────────────────────────────────────────────

  async inquiries(pagination: PaginationDto, status?: string) {
    const where = status ? { status: status as never } : {};
    const [data, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: { slug: true, name: true, developer: { select: { companyName: true } } },
          },
        },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return { data, meta: this.meta(total, pagination) };
  }

  // ─── Bookings ─────────────────────────────────────────────────────────────

  async bookings(pagination: PaginationDto, status?: string) {
    const where = status ? { status: status as never } : {};
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: { slug: true, name: true, developer: { select: { companyName: true } } },
          },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { data, meta: this.meta(total, pagination) };
  }

  // ─── Chat moderation ──────────────────────────────────────────────────────

  async conversations(pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.conversation.findMany({
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          customer: { select: { id: true, email: true, firstName: true, lastName: true } },
          developer: { select: { id: true, email: true, firstName: true, lastName: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.conversation.count(),
    ]);

    return { data, meta: this.meta(total, pagination) };
  }

  /** Full transcript — read-only, for investigating a complaint. */
  async messages(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: { select: { email: true, firstName: true, lastName: true } },
        developer: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    return { conversation, messages };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  /** Conversion funnel plus the properties drawing the most interest. */
  async funnel(days = 30) {
    const clamped = Math.max(1, Math.min(days, 365));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (clamped - 1));

    const [views, inquiries, bookings, reservations, topProperties] = await Promise.all([
      this.prisma.analyticsEvent.count({ where: { type: 'PAGE_VIEW', createdAt: { gte: since } } }),
      this.prisma.inquiry.count({ where: { createdAt: { gte: since } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: since } } }),
      this.prisma.reservation.count({ where: { createdAt: { gte: since } } }),
      this.prisma.analyticsEvent.groupBy({
        by: ['propertyId'],
        where: { type: 'PAGE_VIEW', createdAt: { gte: since }, propertyId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { propertyId: 'desc' } },
        take: 8,
      }),
    ]);

    // groupBy returns ids only — resolve names in one follow-up query.
    const ids = topProperties.map((p) => p.propertyId).filter((id): id is string => !!id);
    const named = ids.length
      ? await this.prisma.property.findMany({
          where: { id: { in: ids } },
          select: { id: true, slug: true, name: true, developer: { select: { companyName: true } } },
        })
      : [];
    const byId = new Map(named.map((p) => [p.id, p]));

    return {
      funnel: { views, inquiries, bookings, reservations },
      topProperties: topProperties.map((p) => ({
        views: p._count._all,
        property: byId.get(p.propertyId as string) ?? null,
      })),
    };
  }

  private meta(total: number, pagination: PaginationDto) {
    return {
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 20,
      totalPages: Math.ceil(total / (pagination.limit ?? 20)),
    };
  }
}
