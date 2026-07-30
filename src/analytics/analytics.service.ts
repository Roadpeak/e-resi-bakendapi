import { Injectable } from '@nestjs/common';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

interface TrackEventDto {
  type: AnalyticsEventType;
  propertyId?: string;
  sessionId?: string;
  source?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Track event ──────────────────────────────────────────────────────────

  async track(dto: TrackEventDto, userId?: string) {
    return this.prisma.analyticsEvent.create({
      data: {
        type: dto.type,
        propertyId: dto.propertyId,
        userId,
        sessionId: dto.sessionId,
        source: dto.source,
        metadata: dto.metadata,
      },
    });
  }

  // ─── Property stats (developer dashboard) ────────────────────────────────

  async propertyStats(propertySlug: string, days = 30) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) return null;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [events, inquiriesCount, bookingsCount, savedCount] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ['type'],
        where: { propertyId: property.id, createdAt: { gte: since } },
        _count: { type: true },
      }),
      this.prisma.inquiry.count({ where: { propertyId: property.id, createdAt: { gte: since } } }),
      this.prisma.booking.count({ where: { propertyId: property.id, createdAt: { gte: since } } }),
      this.prisma.savedProperty.count({ where: { propertyId: property.id } }),
    ]);

    const eventMap = Object.fromEntries(events.map((e) => [e.type, e._count.type]));

    return {
      period: `last ${days} days`,
      views: eventMap[AnalyticsEventType.PAGE_VIEW] ?? 0,
      tourStarts: eventMap[AnalyticsEventType.TOUR_START] ?? 0,
      tourCompletes: eventMap[AnalyticsEventType.TOUR_COMPLETE] ?? 0,
      inquiries: inquiriesCount,
      bookings: bookingsCount,
      saved: savedCount,
    };
  }

  // ─── Developer overview ───────────────────────────────────────────────────

  async developerStats(userId: string) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) return null;

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [properties, activeListings, totalInquiries, pendingBookings, activeReservations] = await Promise.all([
      this.prisma.property.count({ where: { developerId: developer.id } }),
      this.prisma.property.count({ where: { developerId: developer.id, status: 'ACTIVE' } }),
      this.prisma.inquiry.count({
        where: {
          OR: [
            { property: { developerId: developer.id } },
            { rentListing: { developerId: developer.id } },
          ],
          createdAt: { gte: since30d },
        },
      }),
      this.prisma.booking.count({
        where: { property: { developerId: developer.id }, status: 'PENDING' },
      }),
      this.prisma.reservation.count({
        where: {
          unit: { property: { developerId: developer.id } },
          stage: { notIn: ['TITLE_TRANSFERRED', 'CANCELLED'] },
        },
      }),
    ]);

    return {
      properties: { total: properties, active: activeListings },
      inquiries: { last30Days: totalInquiries },
      bookings: { pending: pendingBookings },
      reservations: { active: activeReservations },
    };
  }

  // ─── Admin: platform overview ─────────────────────────────────────────────

  async platformStats() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [users, properties, inquiries, bookings, reservations] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
      this.prisma.property.groupBy({ by: ['status'], _count: { status: true } }),
      this.prisma.inquiry.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.booking.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.reservation.count({ where: { stage: { notIn: ['TITLE_TRANSFERRED', 'CANCELLED'] } } }),
    ]);

    return {
      users: Object.fromEntries(users.map((u) => [u.role, u._count.role])),
      properties: Object.fromEntries(properties.map((p) => [p.status, p._count.status])),
      activity: { inquiries30d: inquiries, bookings30d: bookings, activeReservations: reservations },
    };
  }
}
