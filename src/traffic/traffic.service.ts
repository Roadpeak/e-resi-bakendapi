import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseUserAgent } from './user-agent.js';

export interface HitDto {
  visitorId: string;
  sessionId: string;
  path: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  screen?: string;
  language?: string;
  timezone?: string;
}

/** What the controller lifts off the request — headers, not the body. */
export interface HitContext {
  headers: Record<string, string | string[] | undefined>;
  remoteIp?: string;
}

const clip = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const header = (h: HitContext['headers'], name: string) => {
  const v = h[name];
  return clip(Array.isArray(v) ? v[0] : v, 255);
};

/** Our own hosts never count as a referral source. */
const OWN_HOST = /(^|\.)e-resi\.com$|^localhost$/i;

/** Cloudflare's placeholders for "no country": unknown and Tor. */
const NO_COUNTRY = new Set(['XX', 'T1']);

const RANGE_DAYS = new Set([1, 7, 30, 90]);

@Injectable()
export class TrafficService {
  private readonly jwt: JwtService;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') });
  }

  /**
   * The signed-in user, from the bearer token when one is sent. Verified
   * rather than trusted from the body, so a visit can't be pinned on
   * someone else. An expired or bad token simply counts as anonymous.
   */
  private userFrom(headers: HitContext['headers']): string | undefined {
    const auth = header(headers, 'authorization');
    if (!auth?.startsWith('Bearer ')) return undefined;
    try {
      return this.jwt.verify<{ sub: string }>(auth.slice(7)).sub;
    } catch {
      return undefined;
    }
  }

  async recordHit(dto: HitDto, ctx: HitContext) {
    const ua = header(ctx.headers, 'user-agent');
    const agent = parseUserAgent(ua);
    const visitorId = clip(dto.visitorId, 64);
    const sessionId = clip(dto.sessionId, 64);
    const path = clip(dto.path, 500);
    // Crawlers and malformed beacons are not traffic.
    if (agent.isBot || !visitorId || !sessionId || !path?.startsWith('/')) return { id: null };

    const referrer = clip(dto.referrer, 1000);
    let referrerHost: string | undefined;
    if (referrer) {
      try {
        const host = new URL(referrer).hostname.replace(/^www\./, '');
        if (!OWN_HOST.test(host)) referrerHost = host;
      } catch {
        // Not a URL — keep the raw string, skip the host.
      }
    }

    const h = ctx.headers;
    const country = header(h, 'cf-ipcountry')?.toUpperCase();
    const lat = Number(header(h, 'cf-iplatitude'));
    const lng = Number(header(h, 'cf-iplongitude'));
    const ip = header(h, 'cf-connecting-ip')
      ?? header(h, 'x-forwarded-for')?.split(',')[0]?.trim()
      ?? clip(ctx.remoteIp, 64);

    const visit = await this.prisma.siteVisit.create({
      data: {
        visitorId,
        sessionId,
        userId: this.userFrom(h),
        path,
        referrer,
        referrerHost,
        utmSource: clip(dto.utmSource, 100),
        utmMedium: clip(dto.utmMedium, 100),
        utmCampaign: clip(dto.utmCampaign, 150),
        ip,
        country: country && !NO_COUNTRY.has(country) ? country : undefined,
        region: header(h, 'cf-region'),
        city: header(h, 'cf-ipcity'),
        latitude: Number.isFinite(lat) && header(h, 'cf-iplatitude') ? lat : undefined,
        longitude: Number.isFinite(lng) && header(h, 'cf-iplongitude') ? lng : undefined,
        timezone: header(h, 'cf-timezone') ?? clip(dto.timezone, 64),
        userAgent: clip(ua, 500),
        deviceType: agent.deviceType,
        os: agent.os,
        browser: agent.browser,
        screen: clip(dto.screen, 20),
        language: clip(dto.language, 20),
      },
      select: { id: true },
    });
    return { id: visit.id };
  }

  /**
   * Time on page, sent as the visitor leaves it. The visitorId must match,
   * so one browser can't rewrite another's visits; capped at 30 minutes,
   * past which a tab was left open rather than read.
   */
  async recordDuration(id: string, visitorId: string, durationMs: number) {
    const ms = Math.round(Number(durationMs));
    if (!Number.isFinite(ms) || ms <= 0) return { ok: false };
    await this.prisma.siteVisit.updateMany({
      where: { id, visitorId },
      data: { durationMs: Math.min(ms, 30 * 60 * 1000) },
    });
    return { ok: true };
  }

  // ─── Admin reporting ──────────────────────────────────────────────────────

  private since(days: number) {
    const d = RANGE_DAYS.has(days) ? days : 7;
    return { days: d, from: new Date(Date.now() - d * 24 * 60 * 60 * 1000) };
  }

  /** Top values of one column, as [{ label, views, visitors }]. */
  private async breakdown(column: string, from: Date, limit = 10) {
    const col = Prisma.raw(`"${column}"`);
    const rows = await this.prisma.$queryRaw<{ label: string | null; views: bigint; visitors: bigint }[]>`
      SELECT ${col} AS label, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
      FROM "SiteVisit" WHERE "createdAt" >= ${from}
      GROUP BY ${col} ORDER BY views DESC LIMIT ${limit}`;
    return rows.map((r) => ({ label: r.label, views: Number(r.views), visitors: Number(r.visitors) }));
  }

  async overview(daysParam: number) {
    const { days, from } = this.since(daysParam);
    const bucket = Prisma.raw(days === 1 ? `'hour'` : `'day'`);

    const [totals, sessions, series, pages, sources, countries, cities, devices, os, browsers, live] =
      await Promise.all([
        this.prisma.$queryRaw<{
          views: bigint; visitors: bigint; signed_visitors: bigint; signed_users: bigint; avg_ms: number | null;
        }[]>`
          SELECT COUNT(*) AS views,
                 COUNT(DISTINCT "visitorId") AS visitors,
                 COUNT(DISTINCT "visitorId") FILTER (WHERE "userId" IS NOT NULL) AS signed_visitors,
                 COUNT(DISTINCT "userId") AS signed_users,
                 AVG("durationMs") FILTER (WHERE "durationMs" IS NOT NULL) AS avg_ms
          FROM "SiteVisit" WHERE "createdAt" >= ${from}`,
        // A bounce is a session that saw exactly one page.
        this.prisma.$queryRaw<{ sessions: bigint; bounces: bigint }[]>`
          SELECT COUNT(*) AS sessions, COUNT(*) FILTER (WHERE n = 1) AS bounces
          FROM (SELECT COUNT(*) AS n FROM "SiteVisit" WHERE "createdAt" >= ${from} GROUP BY "sessionId") s`,
        this.prisma.$queryRaw<{ t: Date; views: bigint; visitors: bigint }[]>`
          SELECT date_trunc(${bucket}, "createdAt") AS t, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "createdAt" >= ${from} GROUP BY 1 ORDER BY 1`,
        this.breakdown('path', from, 15),
        this.prisma.$queryRaw<{ label: string; views: bigint; visitors: bigint }[]>`
          SELECT COALESCE("utmSource", "referrerHost", 'Direct') AS label,
                 COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "createdAt" >= ${from}
          GROUP BY 1 ORDER BY views DESC LIMIT 12`,
        this.breakdown('country', from, 15),
        this.prisma.$queryRaw<{ label: string | null; country: string | null; views: bigint; visitors: bigint }[]>`
          SELECT "city" AS label, "country", COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "createdAt" >= ${from} AND "city" IS NOT NULL
          GROUP BY 1, 2 ORDER BY views DESC LIMIT 15`,
        this.breakdown('deviceType', from),
        this.breakdown('os', from),
        this.breakdown('browser', from),
        this.live(),
      ]);

    const t = totals[0];
    const s = sessions[0];
    const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
    return {
      days,
      totals: {
        views: n(t?.views),
        visitors: n(t?.visitors),
        signedInVisitors: n(t?.signed_visitors),
        anonymousVisitors: n(t?.visitors) - n(t?.signed_visitors),
        signedInUsers: n(t?.signed_users),
        sessions: n(s?.sessions),
        bounceRate: n(s?.sessions) ? n(s?.bounces) / n(s?.sessions) : 0,
        avgTimeOnPageMs: t?.avg_ms != null ? Math.round(Number(t.avg_ms)) : null,
        liveNow: live.visitors,
      },
      series: series.map((r) => ({ t: r.t, views: n(r.views), visitors: n(r.visitors) })),
      pages,
      sources: sources.map((r) => ({ label: r.label, views: n(r.views), visitors: n(r.visitors) })),
      countries,
      cities: cities.map((r) => ({ label: r.label, country: r.country, views: n(r.views), visitors: n(r.visitors) })),
      devices,
      os,
      browsers,
    };
  }

  /** Visitors seen in the last five minutes, and where each one is now. */
  async live() {
    const from = new Date(Date.now() - 5 * 60 * 1000);
    const rows = await this.prisma.siteVisit.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: 'desc' },
      distinct: ['visitorId'],
      take: 50,
      select: {
        visitorId: true, path: true, createdAt: true, country: true, city: true,
        deviceType: true, os: true, browser: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return { visitors: rows.length, rows };
  }

  /** The raw feed, newest first, with optional filters. */
  async visits(q: {
    days?: number; page?: number; limit?: number;
    audience?: 'signed' | 'anonymous'; country?: string; deviceType?: string; path?: string;
  }) {
    const { from } = this.since(Number(q.days) || 7);
    const take = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const where: Prisma.SiteVisitWhereInput = {
      createdAt: { gte: from },
      ...(q.audience === 'signed' && { userId: { not: null } }),
      ...(q.audience === 'anonymous' && { userId: null }),
      ...(q.country && { country: q.country.toUpperCase() }),
      ...(q.deviceType && { deviceType: q.deviceType }),
      ...(q.path && { path: { contains: q.path, mode: 'insensitive' } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.siteVisit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
      }),
      this.prisma.siteVisit.count({ where }),
    ]);
    return { data, meta: { total, page, limit: take, totalPages: Math.ceil(total / take) } };
  }

  /** One visitor's whole trail — every page, in order, across sessions. */
  async visitor(visitorId: string) {
    const visits = await this.prisma.siteVisit.findMany({
      where: { visitorId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    });
    if (!visits.length) throw new NotFoundException('Visitor not found');
    const first = visits[0];
    const last = visits[visits.length - 1];
    return {
      visitorId,
      user: [...visits].reverse().find((v) => v.user)?.user ?? null,
      firstSeen: first.createdAt,
      lastSeen: last.createdAt,
      sessions: new Set(visits.map((v) => v.sessionId)).size,
      views: visits.length,
      device: { deviceType: last.deviceType, os: last.os, browser: last.browser, screen: last.screen },
      location: { country: last.country, region: last.region, city: last.city, ip: last.ip },
      firstReferrer: first.referrer,
      visits: visits.map(({ user: _u, userAgent: _ua, ...v }) => v),
    };
  }
}
