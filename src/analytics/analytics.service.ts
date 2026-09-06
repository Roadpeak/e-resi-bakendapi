import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsEventType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { DealsService } from '../agents/deals.service.js';

interface TrackEventDto {
  type: AnalyticsEventType;
  propertyId?: string;
  /// The referring agent's profile id, when the visit came through a shared
  /// link. Validated against the table before it is stored — this arrives on
  /// a public endpoint, and junk ids would poison the referral report.
  agentId?: string;
  sessionId?: string;
  source?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
  ) {}

  // ─── Track event ──────────────────────────────────────────────────────────

  async track(dto: TrackEventDto, userId?: string) {
    let agentId: string | undefined;
    if (dto.agentId && /^[a-z0-9]{20,32}$/i.test(dto.agentId)) {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { id: dto.agentId },
        select: { id: true },
      });
      agentId = agent?.id;
    }
    return this.prisma.analyticsEvent.create({
      data: {
        type: dto.type,
        propertyId: dto.propertyId,
        agentId,
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

    const [
      byType, sessions, sources, tourEvents, unitEvents,
      inquiries, bookings, saved, bookingSplit,
      inquiriesByAgent, bookingsByAgent,
    ] = await Promise.all([
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
        // Bookings split by type — a developer running virtual tours needs to
        // know whether anyone actually takes them up on it.
        this.prisma.booking.groupBy({
          by: ['type', 'status'],
          where: scope,
          _count: { _all: true },
        }),
        // Which partnered agents introduced the leads on this development.
        // Grouped rather than joined so an agent with no leads costs nothing.
        this.prisma.inquiry.groupBy({
          by: ['agentId'],
          where: { ...scope, agentId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.booking.groupBy({
          by: ['agentId'],
          where: { ...scope, agentId: { not: null } },
          _count: { _all: true },
        }),
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

    // Resolve agent names in one query rather than per row.
    const agentIds = [
      ...new Set(
        [...inquiriesByAgent, ...bookingsByAgent]
          .map((r) => r.agentId)
          .filter((id): id is string => !!id),
      ),
    ];
    const agentRows = agentIds.length
      ? await this.prisma.agentProfile.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, displayName: true, kind: true },
        })
      : [];
    const agentById = new Map(agentRows.map((a) => [a.id, a]));

    const byAgent = agentIds
      .map((id) => {
        const a = agentById.get(id);
        const inq = inquiriesByAgent.find((r) => r.agentId === id)?._count._all ?? 0;
        const bkg = bookingsByAgent.find((r) => r.agentId === id)?._count._all ?? 0;
        return {
          agentId: id,
          name: a?.displayName ?? 'Agent',
          kind: a?.kind ?? null,
          inquiries: inq,
          bookings: bkg,
          total: inq + bkg,
        };
      })
      .sort((a, b) => b.total - a.total);

    const bookingCount = (t: string, st?: string) =>
      bookingSplit
        .filter((r) => r.type === t && (st === undefined || r.status === st))
        .reduce((n, r) => n + r._count._all, 0);

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
      // The funnel a developer actually reads down: how many arrived, how
      // many engaged with the tour they paid for, how many asked, how many
      // booked. Each step as a share of the one above it, so a drop-off is
      // visible rather than something to work out.
      funnel: [
        { step: 'Visited the page', value: sessions.length, of: sessions.length },
        { step: 'Opened a tour', value: tourStarts, of: sessions.length },
        { step: 'Watched it through', value: tourCompletes, of: tourStarts },
        { step: 'Enquired', value: inquiries, of: sessions.length },
        { step: 'Booked a viewing', value: bookings, of: sessions.length },
      ],
      bookingsByType: {
        physical: bookingCount('PHYSICAL'),
        virtual: bookingCount('VIRTUAL'),
        confirmed: bookingSplit
          .filter((r) => r.status === 'CONFIRMED')
          .reduce((n, r) => n + r._count._all, 0),
      },
      /** Leads credited to partnered agents on this development. */
      byAgent,
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


  // ─── Agent referral traffic ────────────────────────────────────────────────

  /**
   * What each agent's shared links actually delivered, per property.
   *
   * For a developer this is the accountability side of the mandate pool:
   * they published a commission, agents took it — this is who brought
   * traffic, and how much of it turned into a lead. For an agent it is the
   * same table filtered to themself: proof of contribution, which is the
   * thing they otherwise assert in a WhatsApp message with no evidence.
   *
   * Views come from AnalyticsEvent (PAGE_VIEW rows carrying the agentId the
   * visitor arrived with); leads come from the attribution columns on
   * inquiries, bookings and reservations. Same GROUP BY, opposite chairs.
   */
  async referralStats(
    who: { developerUserId?: string; agentUserId?: string },
    days = 90,
  ) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Resolve the scope: a developer sees all agents across their own
    // properties; an agent sees all properties for just themself.
    let propertyIds: string[] | undefined;
    let agentId: string | undefined;

    if (who.developerUserId) {
      const developer = await this.prisma.developerProfile.findUnique({
        where: { userId: who.developerUserId },
        select: { id: true },
      });
      if (!developer) throw new ForbiddenException('Developer profile required');
      propertyIds = (
        await this.prisma.property.findMany({
          where: { developerId: developer.id },
          select: { id: true },
        })
      ).map((prop) => prop.id);
      if (!propertyIds.length) return { days, rows: [] };
    } else {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { userId: who.agentUserId },
        select: { id: true },
      });
      if (!agent) throw new ForbiddenException('Agent profile required');
      agentId = agent.id;
    }

    const scope = {
      ...(propertyIds && { propertyId: { in: propertyIds } }),
      ...(agentId && { agentId }),
    };

    const [views, tours, inquiries, bookings, reservations] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ['agentId', 'propertyId'],
        where: {
          ...scope,
          agentId: agentId ?? { not: null },
          type: 'PAGE_VIEW',
          createdAt: { gte: since },
        },
        _count: true,
      }),
      this.prisma.analyticsEvent.groupBy({
        by: ['agentId', 'propertyId'],
        where: {
          ...scope,
          agentId: agentId ?? { not: null },
          type: 'TOUR_START',
          createdAt: { gte: since },
        },
        _count: true,
      }),
      this.prisma.inquiry.groupBy({
        by: ['agentId', 'propertyId'],
        where: { ...scope, agentId: agentId ?? { not: null }, createdAt: { gte: since } },
        _count: true,
      }),
      this.prisma.booking.groupBy({
        by: ['agentId', 'propertyId'],
        where: { ...scope, agentId: agentId ?? { not: null }, createdAt: { gte: since } },
        _count: true,
      }),
      // Reservations hang off units, not properties, so the property scope
      // travels through the relation.
      this.prisma.reservation.groupBy({
        by: ['agentId', 'unitId'],
        where: {
          agentId: agentId ?? { not: null },
          createdAt: { gte: since },
          ...(propertyIds && { unit: { propertyId: { in: propertyIds } } }),
        },
        _count: true,
      }),
    ]);

    // Reservations need their unit resolved back to a property to join the
    // same (agent, property) cell as everything else.
    const unitIds = [...new Set(reservations.map((r) => r.unitId))];
    const units = unitIds.length
      ? await this.prisma.unit.findMany({
          where: { id: { in: unitIds } },
          select: { id: true, propertyId: true },
        })
      : [];
    const unitToProperty = new Map(units.map((u) => [u.id, u.propertyId]));

    type Cell = {
      agentId: string;
      propertyId: string;
      views: number;
      tourStarts: number;
      inquiries: number;
      bookings: number;
      reservations: number;
    };
    const cells = new Map<string, Cell>();
    const cell = (aId: string | null, pId: string | null): Cell | null => {
      if (!aId || !pId) return null;
      const key = `${aId}:${pId}`;
      let c = cells.get(key);
      if (!c) {
        c = { agentId: aId, propertyId: pId, views: 0, tourStarts: 0, inquiries: 0, bookings: 0, reservations: 0 };
        cells.set(key, c);
      }
      return c;
    };
    for (const v of views) { const c = cell(v.agentId, v.propertyId); if (c) c.views = v._count; }
    for (const t of tours) { const c = cell(t.agentId, t.propertyId); if (c) c.tourStarts = t._count; }
    for (const i of inquiries) { const c = cell(i.agentId, i.propertyId); if (c) c.inquiries = i._count; }
    for (const b of bookings) { const c = cell(b.agentId, b.propertyId); if (c) c.bookings = b._count; }
    for (const r of reservations) {
      const c = cell(r.agentId, unitToProperty.get(r.unitId) ?? null);
      if (c) c.reservations = r._count;
    }

    // Names, attached once rather than joined per row.
    const rows = [...cells.values()];
    const [agents, properties] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.agentId))] } },
        select: { id: true, displayName: true, photoUrl: true, logoUrl: true },
      }),
      this.prisma.property.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.propertyId))] } },
        select: { id: true, name: true, slug: true },
      }),
    ]);
    const agentById = new Map(agents.map((a) => [a.id, a]));
    const propertyById = new Map(properties.map((prop) => [prop.id, prop]));

    return {
      days,
      rows: rows
        .map((r) => ({
          ...r,
          agent: agentById.get(r.agentId) ?? null,
          property: propertyById.get(r.propertyId) ?? null,
        }))
        // Busiest cells first — the report answers "who is driving traffic",
        // so the answer leads.
        .sort((a, b) => b.views + b.bookings * 10 - (a.views + a.bookings * 10)),
    };
  }


  // ─── Interested viewers ────────────────────────────────────────────────────

  /**
   * Signed-in customers who have been looking at these properties.
   *
   * A registered investor who opened a development four times this week is a
   * lead that never filled a form — the strongest kind of quiet interest the
   * platform can see. This surfaces them to whoever can act: the developer
   * for their own properties, the agent for visitors who came through their
   * links. Guests are invisible here by construction — there is no account
   * to surface, which is also the privacy line: only people who signed in
   * are shown, only to the parties their viewing already involved.
   */
  async interestedViewers(who: { developerUserId?: string; agentUserId?: string }, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let propertyIds: string[] | undefined;
    let agentId: string | undefined;
    if (who.developerUserId) {
      const developer = await this.prisma.developerProfile.findUnique({
        where: { userId: who.developerUserId },
        select: { id: true },
      });
      if (!developer) throw new ForbiddenException('Developer profile required');
      propertyIds = (
        await this.prisma.property.findMany({
          where: { developerId: developer.id },
          select: { id: true },
        })
      ).map((prop) => prop.id);
      if (!propertyIds.length) return { days, rows: [] };
    } else {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { userId: who.agentUserId },
        select: { id: true },
      });
      if (!agent) throw new ForbiddenException('Agent profile required');
      agentId = agent.id;
    }

    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['userId', 'propertyId'],
      where: {
        type: 'PAGE_VIEW',
        userId: { not: null },
        createdAt: { gte: since },
        ...(propertyIds && { propertyId: { in: propertyIds } }),
        ...(agentId && { agentId }),
      },
      _count: true,
      _max: { createdAt: true },
    });
    const rows = grouped.filter((g) => g.userId && g.propertyId);
    if (!rows.length) return { days, rows: [] };

    const [users, properties] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { in: [...new Set(rows.map((r) => r.userId as string))] },
          // Only customers: a developer previewing their own page, or an
          // admin reviewing it, is traffic — not a lead.
          role: { in: ['BUYER', 'INVESTOR', 'TENANT'] },
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
      }),
      this.prisma.property.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.propertyId as string))] } },
        select: { id: true, name: true, slug: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const propertyById = new Map(properties.map((prop) => [prop.id, prop]));

    // "Already a lead" so the button does not offer to capture twice.
    const userIds = users.map((u) => u.id);
    const existing = who.developerUserId
      ? await this.prisma.inquiry.findMany({
          where: { userId: { in: userIds }, propertyId: { in: rows.map((r) => r.propertyId as string) } },
          select: { userId: true, propertyId: true },
        })
      : await this.prisma.deal.findMany({
          where: {
            agentId,
            clientEmail: { in: users.map((u) => u.email) },
            propertyId: { in: rows.map((r) => r.propertyId as string) },
          },
          select: { clientEmail: true, propertyId: true },
        });
    const leadKeys = new Set(
      existing.map((e) =>
        'userId' in e
          ? `${e.userId}:${e.propertyId}`
          : `${users.find((u) => u.email === e.clientEmail)?.id}:${e.propertyId}`,
      ),
    );

    return {
      days,
      rows: rows
        .map((r) => ({
          userId: r.userId as string,
          propertyId: r.propertyId as string,
          views: r._count,
          lastViewedAt: r._max.createdAt,
          user: userById.get(r.userId as string) ?? null,
          property: propertyById.get(r.propertyId as string) ?? null,
          alreadyLead: leadKeys.has(`${r.userId}:${r.propertyId}`),
        }))
        .filter((r) => r.user && r.property)
        .sort((a, b) => b.views - a.views),
    };
  }

  /**
   * File an interested viewer as a lead.
   *
   * Developer → an Inquiry in their existing queue, marked as coming from
   * browsing so the follow-up knows nobody wrote anything yet. Agent → a
   * Deal, under the partnership rules the deals service enforces.
   */
  async captureViewer(
    who: { developerUserId?: string; agentUserId?: string },
    dto: { userId: string; propertyId: string },
  ) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
    });
    if (!viewer || !['BUYER', 'INVESTOR', 'TENANT'].includes(viewer.role)) {
      throw new BadRequestException('Only a buyer, investor or tenant can be captured as a lead');
    }
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, name: true, developerId: true, developer: { select: { userId: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    const clientName = [viewer.firstName, viewer.lastName].filter(Boolean).join(' ') || viewer.email;

    if (who.agentUserId) {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { userId: who.agentUserId },
        select: { id: true },
      });
      if (!agent) throw new ForbiddenException('Agent profile required');
      const partnership = await this.prisma.agentPartnership.findUnique({
        where: { developerId_agentId: { developerId: property.developerId, agentId: agent.id } },
        select: { id: true, status: true },
      });
      if (!partnership || partnership.status !== 'ACTIVE') {
        throw new BadRequestException(
          'You need an active partnership with this developer to open a deal on their property',
        );
      }
      const deal = await this.deals.create(who.agentUserId, {
        partnershipId: partnership.id,
        propertyId: property.id,
        clientName,
        clientEmail: viewer.email,
        clientPhone: viewer.phone ?? undefined,
        notes: 'Captured from browsing activity',
      });
      return { kind: 'deal' as const, id: deal.id };
    }

    if (property.developer.userId !== who.developerUserId) {
      throw new ForbiddenException('Not your property');
    }
    const dup = await this.prisma.inquiry.findFirst({
      where: { userId: viewer.id, propertyId: property.id },
      select: { id: true },
    });
    if (dup) throw new BadRequestException('This person is already a lead on this property');
    const inquiry = await this.prisma.inquiry.create({
      data: {
        propertyId: property.id,
        userId: viewer.id,
        name: clientName,
        email: viewer.email,
        phone: viewer.phone ?? undefined,
        message: `Captured from browsing activity — viewed ${property.name} while signed in.`,
      },
    });
    return { kind: 'inquiry' as const, id: inquiry.id };
  }
}
