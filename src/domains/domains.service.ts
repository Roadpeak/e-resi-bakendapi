import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { CloudflareService } from './cloudflare.service.js';

/** Second-level suffixes where the registrable domain has three labels. */
const MULTI_LABEL_SUFFIXES = [
  'co.ke', 'or.ke', 'ac.ke', 'go.ke', 'ne.ke', 'sc.ke', 'me.ke', 'info.ke', 'mobi.ke',
  'co.uk', 'org.uk', 'co.za', 'co.tz', 'or.tz', 'co.ug', 'or.ug', 'com.ng', 'com.gh', 'co.rw', 'com.au',
];

/** herisresidence.co.ke → true; tours.developer.co.ke → false. */
export function isApexDomain(domain: string) {
  const labels = domain.split('.');
  const multi = MULTI_LABEL_SUFFIXES.some((s) => domain.endsWith(`.${s}`));
  return labels.length <= (multi ? 3 : 2);
}

const RECHECK_THROTTLE_MS = 20_000;

/**
 * Connects, checks and disconnects development custom domains through
 * Cloudflare, so a developer adding a domain needs nothing from the e-resi
 * team:
 *
 *  - a whole domain becomes a zone in e-resi's account; the developer is
 *    shown its two nameservers and switches to them at their registrar;
 *  - a subdomain becomes a Cloudflare for SaaS custom hostname; the
 *    developer adds one CNAME.
 *
 * A cron moves PENDING domains to ACTIVE once Cloudflare sees the change and
 * tells the developer. Without Cloudflare credentials every domain is MANUAL
 * and admins are notified to connect it by hand, as before.
 */
@Injectable()
export class DomainsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cf: CloudflareService,
    private readonly events: PlatformEventsService,
  ) {}

  get automated() {
    return this.cf.enabled;
  }

  get saasTarget() {
    return this.cf.saasTarget;
  }

  /**
   * Free <name>.e-resi.com addresses need a wildcard record in e-resi's own
   * zone. Created once, here, so nobody has to remember to add it.
   */
  async onApplicationBootstrap() {
    if (!this.cf.enabled) return;
    try {
      await this.cf.ensureSiteRecord('*');
    } catch (e) {
      this.logger.warn(`Wildcard record not ensured: ${(e as Error).message}`);
    }
  }

  /** Attach a freshly saved domain. Never throws — failures land in domainError. */
  async connect(propertyId: string, domain: string) {
    if (!this.cf.enabled) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: {
          domainProvider: 'MANUAL', domainStatus: 'MANUAL', domainExternalId: null,
          domainNameservers: [], domainError: null, domainVerifiedAt: null,
        },
      });
      return;
    }

    try {
      if (isApexDomain(domain)) {
        const zone = await this.cf.createZone(domain);
        await this.cf.pointZoneAtOrigin(zone.id, domain);
        const active = zone.status === 'active';
        await this.prisma.property.update({
          where: { id: propertyId },
          data: {
            domainProvider: 'CLOUDFLARE_ZONE',
            domainExternalId: zone.id,
            domainNameservers: zone.name_servers ?? [],
            domainStatus: active ? 'ACTIVE' : 'PENDING',
            domainError: null,
            domainVerifiedAt: active ? new Date() : null,
            domainCheckedAt: new Date(),
          },
        });
      } else {
        const hostname = await this.cf.createCustomHostname(domain);
        await this.prisma.property.update({
          where: { id: propertyId },
          data: {
            domainProvider: 'CLOUDFLARE_SAAS',
            domainExternalId: hostname.id,
            domainNameservers: [],
            domainStatus: 'PENDING',
            domainError: null,
            domainVerifiedAt: null,
            domainCheckedAt: new Date(),
          },
        });
      }
    } catch (e) {
      let message = (e as Error).message;
      this.logger.error(`Connecting ${domain} failed: ${message}`);
      // Cloudflare's wording for an account without Custom Hostnames points
      // the developer at Cloudflare sales; say what they can actually do.
      if (!isApexDomain(domain) && /quota|ssl for saas|custom hostname/i.test(message)) {
        message = `Subdomains like ${domain} can't be connected yet. Use a whole domain instead, `
          + `e.g. ${domain.split('.').slice(1).join('.')}.`;
      }
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { domainStatus: 'ERROR', domainError: message.slice(0, 500), domainCheckedAt: new Date() },
      });
      const p = await this.prisma.property.findUnique({
        where: { id: propertyId }, select: { name: true, developer: { select: { companyName: true } } },
      });
      if (p) void this.events.customDomainFailed(p.name, p.developer.companyName, domain, propertyId, message);
    }
  }

  /** Remove whatever Cloudflare holds for a property's current domain. Never throws. */
  async disconnect(property: { domainProvider: string | null; domainExternalId: string | null; customDomain?: string | null }) {
    if (!this.cf.enabled || !property.domainExternalId) return;
    try {
      if (property.domainProvider === 'CLOUDFLARE_ZONE') await this.cf.deleteZone(property.domainExternalId);
      if (property.domainProvider === 'CLOUDFLARE_SAAS') await this.cf.deleteCustomHostname(property.domainExternalId);
    } catch (e) {
      this.logger.warn(`Removing ${property.customDomain ?? property.domainExternalId} failed: ${(e as Error).message}`);
    }
  }

  /** Clear domain state and Cloudflare objects, e.g. when the domain is removed. */
  async detach(propertyId: string) {
    const p = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { domainProvider: true, domainExternalId: true, customDomain: true },
    });
    if (!p) return;
    await this.disconnect(p);
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        domainProvider: null, domainExternalId: null, domainNameservers: [], domainStatus: null,
        domainError: null, domainVerifiedAt: null, domainCheckedAt: null,
      },
    });
  }

  /**
   * Re-check one property's domain: retries a failed connection, or asks
   * Cloudflare whether a pending one is active yet. Throttled, since a
   * developer clicking "Check now" repeatedly would otherwise hammer the API.
   */
  async refresh(propertyId: string, force = false) {
    const p = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true, slug: true, name: true, customDomain: true, domainProvider: true, domainExternalId: true,
        domainStatus: true, domainCheckedAt: true, developer: { select: { userId: true } },
      },
    });
    if (!p?.customDomain || !this.cf.enabled) return;
    // Unpaid domains are connected by payment, never by a re-check.
    if (p.domainStatus === 'AWAITING_PAYMENT' || p.domainStatus === 'SUSPENDED') return;
    if (!force && p.domainCheckedAt && Date.now() - p.domainCheckedAt.getTime() < RECHECK_THROTTLE_MS) return;

    if (p.domainStatus === 'ERROR' || p.domainStatus === 'MANUAL' || !p.domainExternalId) {
      await this.connect(p.id, p.customDomain);
      return;
    }
    if (p.domainStatus !== 'PENDING') {
      await this.prisma.property.update({ where: { id: p.id }, data: { domainCheckedAt: new Date() } });
      return;
    }

    try {
      let active = false;
      let nameservers: string[] | undefined;
      if (p.domainProvider === 'CLOUDFLARE_ZONE') {
        const zone = await this.cf.getZone(p.domainExternalId);
        active = zone.status === 'active';
        nameservers = zone.name_servers;
        if (!active) await this.cf.activationCheck(p.domainExternalId);
      } else {
        const h = await this.cf.getCustomHostname(p.domainExternalId);
        active = h.status === 'active' && (h.ssl?.status ?? 'active') === 'active';
      }
      await this.prisma.property.update({
        where: { id: p.id },
        data: {
          domainCheckedAt: new Date(),
          ...(nameservers && { domainNameservers: nameservers }),
          ...(active && { domainStatus: 'ACTIVE', domainVerifiedAt: new Date(), domainError: null }),
        },
      });
      if (active) void this.events.customDomainLive(p.developer.userId, p.name, p.customDomain, p.id, p.slug);
    } catch (e) {
      // A zone deleted on Cloudflare's side (unactivated zones expire) is
      // reconnected next time rather than polled forever.
      const message = (e as Error).message;
      await this.prisma.property.update({
        where: { id: p.id },
        data: { domainStatus: 'ERROR', domainError: message.slice(0, 500), domainCheckedAt: new Date() },
      });
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'custom-domain-checks' })
  async checkPending() {
    if (!this.cf.enabled) return;
    const pending = await this.prisma.property.findMany({
      where: { domainStatus: 'PENDING', customDomain: { not: null } },
      select: { id: true },
      orderBy: { domainCheckedAt: 'asc' },
      take: 100,
    });
    for (const { id } of pending) {
      await this.refresh(id, true);
    }
  }
}
