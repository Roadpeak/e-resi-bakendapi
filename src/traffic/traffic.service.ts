import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseUserAgent } from './user-agent.js';
import { normaliseDomain, subdomainOf } from '../properties/custom-domain.js';

export interface HitDto {
  visitorId: string;
  sessionId: string;
  path: string;
  /** Host the page was served on; identifies a development's own domain. */
  host?: string;
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

/** e-resi's own app hosts. Any other <name>.e-resi.com is a development. */
const APP_HOSTS = new Set(['e-resi.com', 'www.e-resi.com', 'app.e-resi.com', 'localhost']);

/** Readable name for a page within one development's site. */
function sectionOf(path: string, slug: string) {
  // //host/rest (own domain) or /slug/rest (e-resi.com link)
  let rest = path.startsWith('//') ? path.replace(/^\/\/[^/]+/, '') : path;
  if (rest === `/${slug}` || rest.startsWith(`/${slug}/`)) rest = rest.slice(slug.length + 1);
  rest = rest || '/';
  if (rest === '/') return 'Main page';
  if (rest.startsWith('/tour/vr')) return 'VR tour';
  if (rest.startsWith('/tour/3d')) return '3D tour';
  if (rest.startsWith('/tour/cinematic')) return 'Cinematic tour';
  if (rest.startsWith('/tour')) return 'Tours';
  if (rest.startsWith('/units')) return 'Unit pages';
  return rest;
}

/** Cloudflare's placeholders for "no country": unknown and Tor. */
const NO_COUNTRY = new Set(['XX', 'T1']);

const RANGE_DAYS = new Set([1, 7, 30, 90]);

@Injectable()
export class TrafficService {
  private readonly jwt: JwtService;
  /** host-or-slug → property id, so each page view costs no extra query. */
  private readonly propertyCache = new Map<string, { id: string | null; at: number }>();

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

  /**
   * Which development a page view belongs to: by the host for a
   * development's own domain or e-resi address, by the first path segment
   * for an e-resi.com/<slug> link. Cached for five minutes.
   */
  private async propertyFor(host: string | undefined, path: string): Promise<string | null> {
    const h = host ? normaliseDomain(host) : '';
    const own = !h || APP_HOSTS.has(h) || APP_HOSTS.has(`www.${h}`);
    const slug = own ? path.split('/')[1] ?? '' : '';
    const key = own ? `slug:${slug}` : `host:${h}`;
    if (own && !/^[a-z0-9-]{2,}$/.test(slug)) return null;

    const hit = this.propertyCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.id;

    const label = own ? null : subdomainOf(h);
    const row = await this.prisma.property.findFirst({
      where: own ? { slug } : label ? { subdomain: label } : { customDomain: h },
      select: { id: true },
    });
    if (this.propertyCache.size > 5000) this.propertyCache.clear();
    this.propertyCache.set(key, { id: row?.id ?? null, at: Date.now() });
    return row?.id ?? null;
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

    const host = clip(dto.host, 255)?.toLowerCase();
    const propertyId = await this.propertyFor(host, path).catch(() => null);

    const visit = await this.prisma.siteVisit.create({
      data: {
        visitorId,
        sessionId,
        host,
        propertyId,
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
    // Which developments draw the traffic, across every address they use.
    const topProperties = await this.prisma.$queryRaw<{ slug: string; name: string; views: bigint; visitors: bigint }[]>`
      SELECT p."slug", p."name", COUNT(*) AS views, COUNT(DISTINCT v."visitorId") AS visitors
      FROM "SiteVisit" v JOIN "Property" p ON p."id" = v."propertyId"
      WHERE v."createdAt" >= ${from}
      GROUP BY 1, 2 ORDER BY views DESC LIMIT 10`;

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
      properties: topProperties.map((r) => ({ label: r.name, slug: r.slug, views: n(r.views), visitors: n(r.visitors) })),
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

  // ─── One development's traffic, for its developer ─────────────────────────

  /**
   * Everything a developer can learn about who visits one development —
   * from any address it is served on. Visitors stay anonymous to the
   * developer: signed-in visits are counted, never named.
   */
  async propertyTraffic(slug: string, userId: string, role: string, daysParam: number) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, customDomain: true, subdomain: true, developer: { select: { userId: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (role !== 'ADMIN' && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    const { days, from } = this.since(daysParam);
    const pid = property.id;
    const bucket = Prisma.raw(days === 1 ? `'hour'` : `'day'`);
    const by = (column: string, limit = 10) => {
      const col = Prisma.raw(`"${column}"`);
      return this.prisma.$queryRaw<{ label: string | null; views: bigint; visitors: bigint }[]>`
        SELECT ${col} AS label, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
        FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from}
        GROUP BY ${col} ORDER BY views DESC LIMIT ${limit}`;
    };

    const [totals, sessions, returning, series, countries, cities, devices, browsers, os, sources, hosts, paths, recent] =
      await Promise.all([
        this.prisma.$queryRaw<{ views: bigint; visitors: bigint; signed_views: bigint; signed_visitors: bigint; avg_ms: number | null }[]>`
          SELECT COUNT(*) AS views,
                 COUNT(DISTINCT "visitorId") AS visitors,
                 COUNT(*) FILTER (WHERE "userId" IS NOT NULL) AS signed_views,
                 COUNT(DISTINCT "visitorId") FILTER (WHERE "userId" IS NOT NULL) AS signed_visitors,
                 AVG("durationMs") FILTER (WHERE "durationMs" IS NOT NULL) AS avg_ms
          FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from}`,
        this.prisma.$queryRaw<{ sessions: bigint; bounces: bigint }[]>`
          SELECT COUNT(*) AS sessions, COUNT(*) FILTER (WHERE n = 1) AS bounces
          FROM (SELECT COUNT(*) AS n FROM "SiteVisit"
                WHERE "propertyId" = ${pid} AND "createdAt" >= ${from} GROUP BY "sessionId") s`,
        // Returning: visitors in this window who had also visited before it.
        this.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(DISTINCT v."visitorId") AS n FROM "SiteVisit" v
          WHERE v."propertyId" = ${pid} AND v."createdAt" >= ${from}
            AND EXISTS (SELECT 1 FROM "SiteVisit" o WHERE o."propertyId" = ${pid}
                        AND o."visitorId" = v."visitorId" AND o."createdAt" < ${from})`,
        this.prisma.$queryRaw<{ t: Date; views: bigint; visitors: bigint }[]>`
          SELECT date_trunc(${bucket}, "createdAt") AS t, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from} GROUP BY 1 ORDER BY 1`,
        by('country', 15),
        this.prisma.$queryRaw<{ label: string | null; country: string | null; views: bigint; visitors: bigint }[]>`
          SELECT "city" AS label, "country", COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from} AND "city" IS NOT NULL
          GROUP BY 1, 2 ORDER BY views DESC LIMIT 15`,
        by('deviceType'),
        by('browser'),
        by('os'),
        this.prisma.$queryRaw<{ label: string; views: bigint; visitors: bigint }[]>`
          SELECT COALESCE("utmSource", "referrerHost", 'Direct') AS label,
                 COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from}
          GROUP BY 1 ORDER BY views DESC LIMIT 12`,
        by('host'),
        this.prisma.$queryRaw<{ label: string; views: bigint; visitors: bigint }[]>`
          SELECT "path" AS label, COUNT(*) AS views, COUNT(DISTINCT "visitorId") AS visitors
          FROM "SiteVisit" WHERE "propertyId" = ${pid} AND "createdAt" >= ${from}
          GROUP BY 1 ORDER BY views DESC LIMIT 100`,
        this.prisma.siteVisit.findMany({
          where: { propertyId: pid, createdAt: { gte: from } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            createdAt: true, path: true, host: true, country: true, region: true, city: true,
            deviceType: true, os: true, browser: true, referrerHost: true, utmSource: true,
            durationMs: true, userId: true, sessionId: true,
          },
        }),
      ]);

    const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
    const rows = (r: { label: string | null; views: bigint; visitors: bigint }[]) =>
      r.map((x) => ({ label: x.label, views: n(x.views), visitors: n(x.visitors) }));

    // Fold raw paths into the sections a developer recognises.
    const pageMap = new Map<string, { views: number; visitors: number }>();
    for (const r of paths) {
      const key = sectionOf(r.label, property.slug);
      const cur = pageMap.get(key) ?? { views: 0, visitors: 0 };
      cur.views += n(r.views);
      cur.visitors += n(r.visitors); // upper bound when sections merge; fine for ranking
      pageMap.set(key, cur);
    }

    // Which address people used: the e-resi.com link, the e-resi address or the own domain.
    const addressOf = (host: string | null) => {
      const h = host ? normaliseDomain(host) : '';
      if (!h || APP_HOSTS.has(h)) return `e-resi.com/${property.slug}`;
      return h;
    };
    const addressMap = new Map<string, { views: number; visitors: number }>();
    for (const r of hosts) {
      const key = addressOf(r.label);
      const cur = addressMap.get(key) ?? { views: 0, visitors: 0 };
      cur.views += n(r.views);
      cur.visitors += n(r.visitors);
      addressMap.set(key, cur);
    }

    const t = totals[0];
    const s = sessions[0];
    const visitors = n(t?.visitors);
    return {
      property: { slug: property.slug, name: property.name, customDomain: property.customDomain, subdomain: property.subdomain },
      days,
      totals: {
        views: n(t?.views),
        visitors,
        signedInViews: n(t?.signed_views),
        guestViews: n(t?.views) - n(t?.signed_views),
        signedInVisitors: n(t?.signed_visitors),
        guestVisitors: visitors - n(t?.signed_visitors),
        returningVisitors: n(returning[0]?.n),
        newVisitors: visitors - n(returning[0]?.n),
        sessions: n(s?.sessions),
        bounceRate: n(s?.sessions) ? n(s?.bounces) / n(s?.sessions) : 0,
        avgTimeOnPageMs: t?.avg_ms != null ? Math.round(Number(t.avg_ms)) : null,
      },
      series: series.map((r) => ({ t: r.t, views: n(r.views), visitors: n(r.visitors) })),
      countries: rows(countries),
      cities: cities.map((r) => ({ label: r.label, country: r.country, views: n(r.views), visitors: n(r.visitors) })),
      devices: rows(devices),
      browsers: rows(browsers),
      os: rows(os),
      sources: rows(sources),
      addresses: [...addressMap].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.views - a.views),
      pages: [...pageMap].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.views - a.views).slice(0, 12),
      recent: recent.map((v) => ({
        at: v.createdAt,
        page: sectionOf(v.path, property.slug),
        address: addressOf(v.host),
        country: v.country,
        region: v.region,
        city: v.city,
        deviceType: v.deviceType,
        os: v.os,
        browser: v.browser,
        source: v.utmSource ?? v.referrerHost ?? null,
        durationMs: v.durationMs,
        signedIn: !!v.userId,
      })),
    };
  }
}
