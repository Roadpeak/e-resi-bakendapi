import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEventType, Prisma, UserRole } from '@prisma/client';
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

  /**
   * The mini-site engagement report a developer sees for one development.
   *
   * This is what makes the mini-site defensible: "4,200 opened it, 380 spent
   * over two minutes in the tour, unit B4 leads three weeks running" is
   * something no standalone microsite can tell them, and it is the evidence
   * a recurring fee is eventually argued from. A bare view count is not.
   *
   * `userId`/`userRole` are required rather than optional — this previously
   * took a slug alone, which let any signed-in developer read a competitor's
   * numbers just by guessing a slug.
   */
  async miniSiteReport(
    propertySlug: string,
    userId: string,
    userRole: UserRole,
    days = 30,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { slug: propertySlug },
      include: { developer: true, units: { select: { id: true, name: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');

    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const scope = { propertyId: property.id, createdAt: { gte: since } };

    const [byType, sessions, sources, tourEvents, unitEvents, inquiries, bookings, saved] =
      await Promise.all([
        this.prisma.analyticsEvent.groupBy({
          by: ['type'],
          where: scope,
          _count: { type: true },
        }),
        // Distinct sessions, not raw hits: one person refreshing five times is
        // one interested buyer, and inflating that would mislead the developer.
        this.prisma.analyticsEvent.findMany({
          where: { ...scope, type: AnalyticsEventType.PAGE_VIEW },
          select: { sessionId: true },
          distinct: ['sessionId'],
        }),
        this.prisma.analyticsEvent.groupBy({
          by: ['source'],
          where: { ...scope, type: AnalyticsEventType.PAGE_VIEW },
          _count: { source: true },
        }),
        this.prisma.analyticsEvent.findMany({
          where: {
            ...scope,
            type: { in: [AnalyticsEventType.TOUR_START, AnalyticsEventType.TOUR_COMPLETE] },
          },
          select: { type: true, metadata: true },
        }),
        this.prisma.analyticsEvent.findMany({
          where: { ...scope, type: AnalyticsEventType.UNIT_VIEWED },
          select: { metadata: true, sessionId: true },
        }),
        this.prisma.inquiry.count({ where: scope }),
        this.prisma.booking.count({ where: scope }),
        this.prisma.savedProperty.count({ where: { propertyId: property.id } }),
      ]);

    const counts = Object.fromEntries(byType.map((e) => [e.type, e._count.type]));

    // Per-tour split, so a developer can see which format their buyers
    // actually use — that decides what is worth producing next.
    //
    // `timed` counts only completions that actually carry a duration. Events
    // recorded before dwell tracking existed have null metadata, and averaging
    // total seconds over *all* completions let those zero-second rows drag the
    // reported average down — understating engagement on exactly the metric a
    // developer is being asked to pay for.
    const tours: Record<
      string,
      { starts: number; completes: number; timed: number; totalSeconds: number }
    > = {};
    for (const e of tourEvents) {
      const meta = (e.metadata ?? {}) as { tour?: string; seconds?: number };
      const key = meta.tour ?? 'UNKNOWN';
      tours[key] ??= { starts: 0, completes: 0, timed: 0, totalSeconds: 0 };
      if (e.type === AnalyticsEventType.TOUR_START) {
        tours[key].starts += 1;
      } else {
        tours[key].completes += 1;
        const seconds = Number(meta.seconds);
        if (Number.isFinite(seconds) && seconds > 0) {
          tours[key].timed += 1;
          tours[key].totalSeconds += seconds;
        }
      }
    }

    const unitNames = new Map(property.units.map((u) => [u.id, u.name]));
    const unitTally = new Map<string, { name: string; views: number; sessions: Set<string> }>();
    for (const e of unitEvents) {
      const meta = (e.metadata ?? {}) as { unitId?: string; unitName?: string };
      if (!meta.unitId) continue;
      const row = unitTally.get(meta.unitId) ?? {
        name: unitNames.get(meta.unitId) ?? meta.unitName ?? 'Unit',
        views: 0,
        sessions: new Set<string>(),
      };
      row.views += 1;
      if (e.sessionId) row.sessions.add(e.sessionId);
      unitTally.set(meta.unitId, row);
    }

    const tourStarts = counts[AnalyticsEventType.TOUR_START] ?? 0;
    const tourCompletes = counts[AnalyticsEventType.TOUR_COMPLETE] ?? 0;
    const totalSeconds = Object.values(tours).reduce((a, t) => a + t.totalSeconds, 0);
    const timedCompletes = Object.values(tours).reduce((a, t) => a + t.timed, 0);
    const views = counts[AnalyticsEventType.PAGE_VIEW] ?? 0;

    return {
      property: { id: property.id, slug: property.slug, name: property.name },
      period: { days, since: since.toISOString() },
      headline: {
        views,
        uniqueVisitors: sessions.length,
        tourStarts,
        tourCompletes,
        shares: counts[AnalyticsEventType.SHARE] ?? 0,
        inquiries,
        bookings,
        saved,
        /** Share of visitors who opened a tour at all. */
        tourOpenRate: views ? Math.round((tourStarts / views) * 100) : 0,
        /** Share of tour openers who stayed past the engagement threshold. */
        tourEngagementRate: tourStarts ? Math.round((tourCompletes / tourStarts) * 100) : 0,
        /**
         * Average dwell across viewings that recorded a duration. Divided by
         * `timedCompletes`, not `tourCompletes`: pre-instrumentation rows have
         * no duration and would otherwise pull this toward zero.
         */
        averageTourSeconds: timedCompletes ? Math.round(totalSeconds / timedCompletes) : 0,
      },
      tours: Object.entries(tours)
        .map(([tour, t]) => ({
          tour,
          starts: t.starts,
          completes: t.completes,
          averageSeconds: t.timed ? Math.round(t.totalSeconds / t.timed) : 0,
        }))
        .sort((a, b) => b.starts - a.starts),
      // Where the traffic came from — the number that shows a developer how
      // much our marketplace adds on top of the links they share themselves.
      sources: sources
        .map((s) => ({ source: s.source ?? 'Direct', visits: s._count.source }))
        .sort((a, b) => b.visits - a.visits),
      topUnits: [...unitTally.entries()]
        .map(([unitId, r]) => ({
          unitId,
          name: r.name,
          views: r.views,
          uniqueViewers: r.sessions.size,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10),
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

  // ─── Developer: daily engagement + traffic sources ────────────────────────

  async developerEngagement(userId: string, days = 7) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) return null;

    const clamped = Math.max(1, Math.min(days, 90));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (clamped - 1));

    const propertyFilter = { property: { developerId: developer.id } };

    const [events, inquiries, bookings] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where: { ...propertyFilter, createdAt: { gte: since } },
        select: { type: true, source: true, createdAt: true },
      }),
      this.prisma.inquiry.findMany({
        where: {
          OR: [propertyFilter, { rentListing: { developerId: developer.id } }],
          createdAt: { gte: since },
        },
        select: { createdAt: true },
      }),
      this.prisma.booking.findMany({
        where: { ...propertyFilter, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    // Buckets start at local midnight, so the key must be local too. Using
    // toISOString() here shifts the date by the UTC offset, which puts events
    // outside every bucket (and previously threw on the missing entry).
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const daily: { date: string; views: number; inquiries: number; bookings: number }[] = [];
    for (let i = 0; i < clamped; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      daily.push({ date: dayKey(d), views: 0, inquiries: 0, bookings: 0 });
    }
    const byDate = new Map(daily.map((row) => [row.date, row]));

    // A row can still be missing if a record lands outside the window (clock
    // skew, an event written during the query) — skip rather than throw.
    for (const e of events) {
      if (e.type !== 'PAGE_VIEW') continue;
      const row = byDate.get(dayKey(e.createdAt));
      if (row) row.views += 1;
    }
    for (const i of inquiries) {
      const row = byDate.get(dayKey(i.createdAt));
      if (row) row.inquiries += 1;
    }
    for (const b of bookings) {
      const row = byDate.get(dayKey(b.createdAt));
      if (row) row.bookings += 1;
    }

    const sourceCounts = new Map<string, number>();
    for (const e of events) {
      const src = e.source?.trim() || 'Direct';
      sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
    }
    const sources = [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { daily, sources };
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
