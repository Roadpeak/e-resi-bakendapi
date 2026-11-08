import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KybStatus, PropertyStatus, type Invoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CloudflareService } from '../domains/cloudflare.service.js';
import { isApexDomain } from '../domains/domains.service.js';
import {
  isReservedDomain, normaliseDomain, normaliseSubdomain, subdomainProblem,
} from '../properties/custom-domain.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Agent websites: <handle>.e-resi.com and/or the agent's own domain, serving
 * a branded site of their own listings plus the developments they're
 * partnered on. Each is unlocked by a one-time fee set in admin (0 = free);
 * paying the AGENT_SITE invoice activates it.
 */

const SETTINGS = [
  { key: 'agent_site_fee', value: '0', valueType: 'number', label: 'Agent website — e-resi address fee', description: 'One-time fee for <name>.e-resi.com. 0 makes it free.' },
  { key: 'agent_site_domain_fee', value: '0', valueType: 'number', label: 'Agent website — custom domain fee', description: 'One-time fee to serve an agent site on their own domain. 0 makes it free.' },
];

const LIVE: PropertyStatus[] = [PropertyStatus.ACTIVE, PropertyStatus.OFF_PLAN, PropertyStatus.SOLD_OUT];
const RECHECK_MS = 20_000;
const SUBDOMAIN = 'AGENT_SITE:SUBDOMAIN';
const CUSTOM = 'AGENT_SITE:CUSTOM_DOMAIN';

const CARD_SELECT = {
  id: true, slug: true, name: true, tagline: true, heroImageUrl: true, city: true, neighborhood: true,
  category: true, status: true, priceFrom: true, priceTo: true, currency: true,
  has3DTour: true, hasVRTour: true, hasCinematicTour: true,
  customDomain: true, subdomain: true, subdomainActivatedAt: true, domainStatus: true,
  developer: { select: { companyName: true } }, developerName: true,
  _count: { select: { units: true } },
} as const;

@Injectable()
export class AgentSiteService implements OnModuleInit {
  private readonly logger = new Logger(AgentSiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly cf: CloudflareService,
  ) {}

  async onModuleInit() {
    for (const s of SETTINGS) {
      await this.prisma.platformSetting.upsert({ where: { key: s.key }, update: {}, create: { ...s, group: 'billing' } })
        .catch((e) => this.logger.warn(`Setting ${s.key}: ${(e as Error).message}`));
    }
    this.invoices.onPaid('AGENT_SITE', (inv) => this.fulfil(inv));
  }

  async prices() {
    const [sub, custom, currency] = await Promise.all([
      this.pricing.getSetting('agent_site_fee', '0'),
      this.pricing.getSetting('agent_site_domain_fee', '0'),
      this.pricing.platformCurrency(),
    ]);
    return { currency, subdomain: Math.max(0, Number(sub) || 0), customDomain: Math.max(0, Number(custom) || 0) };
  }

  private async agentOf(userId: string) {
    const a = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!a) throw new ForbiddenException('Agent profile required');
    return a;
  }

  private publicUrl(a: { siteHandle: string | null; siteActivatedAt: Date | null; siteCustomDomain: string | null; siteDomainStatus: string | null }) {
    if (a.siteCustomDomain && a.siteDomainStatus === 'ACTIVE') return `https://${a.siteCustomDomain}`;
    if (a.siteHandle && a.siteActivatedAt) return `https://${a.siteHandle}.e-resi.com`;
    return null;
  }

  /** Everything the agent's Website page shows. */
  async mine(userId: string) {
    const a = await this.agentOf(userId);
    const open = async (id: string | null) => {
      if (!id) return null;
      const inv = await this.prisma.invoice.findUnique({ where: { id }, select: { id: true, number: true, total: true, currency: true, status: true } });
      return inv && !['PAID', 'CANCELLED', 'WAIVED'].includes(inv.status) ? inv : null;
    };
    return {
      prices: await this.prices(),
      verified: a.kybStatus === KybStatus.APPROVED,
      handle: a.siteHandle,
      activatedAt: a.siteActivatedAt,
      invoice: await open(a.siteInvoiceId),
      tagline: a.siteTagline, accent: a.siteAccent, heroUrl: a.siteHeroUrl,
      customDomain: a.siteCustomDomain,
      domain: {
        status: a.siteDomainStatus, provider: a.siteDomainProvider, nameservers: a.siteDomainNameservers,
        error: a.siteDomainError, checkedAt: a.siteDomainCheckedAt, paid: !!a.siteDomainPaidAt,
        invoice: await open(a.siteDomainInvoiceId),
        cnameTarget: this.cf.enabled ? this.cf.saasTarget : null,
        apex: a.siteCustomDomain ? isApexDomain(a.siteCustomDomain) : null,
      },
      url: this.publicUrl(a),
      previewPath: `/site/agent/${a.id}`,
    };
  }

  async updateBranding(userId: string, dto: { tagline?: string | null; accent?: string | null; heroUrl?: string | null }) {
    const a = await this.agentOf(userId);
    if (dto.accent && !/^#[0-9a-f]{6}$/i.test(dto.accent)) throw new BadRequestException('Accent must be a hex colour like #1a73e8');
    await this.prisma.agentProfile.update({
      where: { id: a.id },
      data: {
        ...(dto.tagline !== undefined && { siteTagline: dto.tagline?.trim().slice(0, 160) || null }),
        ...(dto.accent !== undefined && { siteAccent: dto.accent || null }),
        ...(dto.heroUrl !== undefined && { siteHeroUrl: dto.heroUrl || null }),
      },
    });
    return this.mine(userId);
  }

  // ─── e-resi address ─────────────────────────────────────────────────────

  /** Claim (or change, before activation) the handle and activate: free → now, else invoice. */
  async claimHandle(userId: string, raw: string) {
    const a = await this.agentOf(userId);
    const handle = normaliseSubdomain(raw);
    const problem = subdomainProblem(handle);
    if (problem) throw new BadRequestException(problem);
    if (a.siteActivatedAt && a.siteHandle && a.siteHandle !== handle) {
      throw new BadRequestException('Your address is already active. Contact e-resi to change it.');
    }
    const [agentClash, propertyClash] = await Promise.all([
      this.prisma.agentProfile.findFirst({ where: { siteHandle: handle, NOT: { id: a.id } }, select: { id: true } }),
      this.prisma.property.findFirst({ where: { subdomain: handle }, select: { id: true } }),
    ]);
    if (agentClash || propertyClash) throw new BadRequestException(`${handle}.e-resi.com is already taken`);

    await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteHandle: handle } });
    if (a.siteActivatedAt) return this.mine(userId);

    const { subdomain, currency } = await this.prices();
    if (subdomain <= 0) {
      if (a.siteInvoiceId) await this.invoices.cancel(a.siteInvoiceId).catch(() => undefined);
      await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteActivatedAt: new Date(), siteInvoiceId: null } });
      return this.mine(userId);
    }
    if (!a.siteInvoiceId || !(await this.isOpen(a.siteInvoiceId))) {
      const inv = await this.invoices.create({
        userId, kind: 'AGENT_SITE', currency, sendNow: true,
        lines: [{ description: `Agent website — ${handle}.e-resi.com (one-time)`, quantity: 1, unitAmount: subdomain, amount: subdomain }],
        dueAt: new Date(Date.now() + 7 * 86_400_000),
        notes: SUBDOMAIN,
      });
      await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteInvoiceId: inv.id } });
    }
    return this.mine(userId);
  }

  private async isOpen(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    return !!inv && !['PAID', 'CANCELLED', 'WAIVED'].includes(inv.status);
  }

  // ─── Custom domain ──────────────────────────────────────────────────────

  async setCustomDomain(userId: string, raw: string | null) {
    const a = await this.agentOf(userId);
    if (!raw) {
      await this.disconnect(a);
      if (a.siteDomainInvoiceId) await this.invoices.cancel(a.siteDomainInvoiceId).catch(() => undefined);
      await this.prisma.agentProfile.update({
        where: { id: a.id },
        data: {
          siteCustomDomain: null, siteDomainStatus: null, siteDomainProvider: null, siteDomainExternalId: null,
          siteDomainNameservers: [], siteDomainError: null, siteDomainInvoiceId: null,
        },
      });
      return this.mine(userId);
    }
    const domain = normaliseDomain(raw);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new BadRequestException('Enter a domain like kellerwilliams.co.ke');
    if (isReservedDomain(domain)) throw new BadRequestException('That domain belongs to e-resi');
    const [agentClash, propertyClash] = await Promise.all([
      this.prisma.agentProfile.findFirst({ where: { siteCustomDomain: domain, NOT: { id: a.id } }, select: { id: true } }),
      this.prisma.property.findFirst({ where: { customDomain: domain }, select: { id: true } }),
    ]);
    if (agentClash || propertyClash) throw new BadRequestException('That domain is already in use');
    if (a.siteCustomDomain === domain && a.siteDomainStatus && a.siteDomainStatus !== 'ERROR') return this.mine(userId);

    // Changing domains: release the old one on Cloudflare first.
    if (a.siteCustomDomain && a.siteCustomDomain !== domain) await this.disconnect(a);
    await this.prisma.agentProfile.update({
      where: { id: a.id },
      data: { siteCustomDomain: domain, siteDomainExternalId: null, siteDomainProvider: null, siteDomainNameservers: [], siteDomainError: null },
    });

    const { customDomain, currency } = await this.prices();
    if (a.siteDomainPaidAt || customDomain <= 0) {
      if (!a.siteDomainPaidAt) await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteDomainPaidAt: new Date() } });
      await this.connect(a.id, domain);
      return this.mine(userId);
    }
    if (a.siteDomainInvoiceId) await this.invoices.cancel(a.siteDomainInvoiceId).catch(() => undefined);
    const inv = await this.invoices.create({
      userId, kind: 'AGENT_SITE', currency, sendNow: true,
      lines: [{ description: `Agent website — custom domain ${domain} (one-time)`, quantity: 1, unitAmount: customDomain, amount: customDomain }],
      dueAt: new Date(Date.now() + 7 * 86_400_000),
      notes: CUSTOM,
    });
    await this.prisma.agentProfile.update({
      where: { id: a.id }, data: { siteDomainInvoiceId: inv.id, siteDomainStatus: 'AWAITING_PAYMENT' },
    });
    return this.mine(userId);
  }

  private async connect(agentId: string, domain: string) {
    if (!this.cf.enabled) {
      await this.prisma.agentProfile.update({ where: { id: agentId }, data: { siteDomainStatus: 'MANUAL', siteDomainProvider: 'MANUAL' } });
      return;
    }
    try {
      if (isApexDomain(domain)) {
        const zone = await this.cf.createZone(domain);
        await this.cf.pointZoneAtOrigin(zone.id, domain);
        const active = zone.status === 'active';
        await this.prisma.agentProfile.update({
          where: { id: agentId },
          data: {
            siteDomainProvider: 'CLOUDFLARE_ZONE', siteDomainExternalId: zone.id, siteDomainNameservers: zone.name_servers ?? [],
            siteDomainStatus: active ? 'ACTIVE' : 'PENDING', siteDomainError: null, siteDomainCheckedAt: new Date(),
          },
        });
      } else {
        const h = await this.cf.createCustomHostname(domain);
        await this.prisma.agentProfile.update({
          where: { id: agentId },
          data: {
            siteDomainProvider: 'CLOUDFLARE_SAAS', siteDomainExternalId: h.id, siteDomainNameservers: [],
            siteDomainStatus: 'PENDING', siteDomainError: null, siteDomainCheckedAt: new Date(),
          },
        });
      }
    } catch (e) {
      const message = (e as Error).message;
      this.logger.error(`Agent site domain ${domain} failed: ${message}`);
      await this.prisma.agentProfile.update({
        where: { id: agentId },
        data: { siteDomainStatus: 'ERROR', siteDomainError: message.slice(0, 500), siteDomainCheckedAt: new Date() },
      });
    }
  }

  private async disconnect(a: { siteDomainProvider: string | null; siteDomainExternalId: string | null }) {
    if (!this.cf.enabled || !a.siteDomainExternalId) return;
    try {
      if (a.siteDomainProvider === 'CLOUDFLARE_ZONE') await this.cf.deleteZone(a.siteDomainExternalId);
      if (a.siteDomainProvider === 'CLOUDFLARE_SAAS') await this.cf.deleteCustomHostname(a.siteDomainExternalId);
    } catch (e) {
      this.logger.warn(`Releasing agent domain failed: ${(e as Error).message}`);
    }
  }

  /** Re-check a pending domain (button and cron). */
  async refresh(agentId: string, force = false) {
    const a = await this.prisma.agentProfile.findUnique({ where: { id: agentId } });
    if (!a?.siteCustomDomain || !this.cf.enabled) return;
    if (a.siteDomainStatus === 'AWAITING_PAYMENT') return;
    if (!force && a.siteDomainCheckedAt && Date.now() - a.siteDomainCheckedAt.getTime() < RECHECK_MS) return;
    if (a.siteDomainStatus === 'ERROR' || a.siteDomainStatus === 'MANUAL' || !a.siteDomainExternalId) {
      await this.connect(a.id, a.siteCustomDomain);
      return;
    }
    if (a.siteDomainStatus !== 'PENDING') return;
    try {
      let active = false; let ns: string[] | undefined;
      if (a.siteDomainProvider === 'CLOUDFLARE_ZONE') {
        const z = await this.cf.getZone(a.siteDomainExternalId);
        active = z.status === 'active'; ns = z.name_servers;
        if (!active) await this.cf.activationCheck(a.siteDomainExternalId);
      } else {
        const h = await this.cf.getCustomHostname(a.siteDomainExternalId);
        active = h.status === 'active' && (h.ssl?.status ?? 'active') === 'active';
      }
      await this.prisma.agentProfile.update({
        where: { id: a.id },
        data: {
          siteDomainCheckedAt: new Date(), ...(ns && { siteDomainNameservers: ns }),
          ...(active && { siteDomainStatus: 'ACTIVE', siteDomainError: null }),
        },
      });
      if (active) {
        await this.notifications.createNotification(a.userId, 'SYSTEM_ANNOUNCEMENT', `${a.siteCustomDomain} is live`,
          `Your agent website now opens at https://${a.siteCustomDomain}.`, a.id, 'AgentSite', '/agent/website').catch(() => undefined);
      }
    } catch (e) {
      await this.prisma.agentProfile.update({
        where: { id: a.id },
        data: { siteDomainStatus: 'ERROR', siteDomainError: (e as Error).message.slice(0, 500), siteDomainCheckedAt: new Date() },
      });
    }
  }

  async refreshMine(userId: string) {
    const a = await this.agentOf(userId);
    await this.refresh(a.id);
    return this.mine(userId);
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'agent-site-domains' })
  async checkPending() {
    if (!this.cf.enabled) return;
    const rows = await this.prisma.agentProfile.findMany({
      where: { siteDomainStatus: 'PENDING', siteCustomDomain: { not: null } },
      select: { id: true }, take: 100,
    });
    for (const r of rows) await this.refresh(r.id, true);
  }

  /** Paid (or waived) AGENT_SITE invoice. */
  private async fulfil(inv: Invoice) {
    const a = await this.prisma.agentProfile.findUnique({ where: { userId: inv.userId } });
    if (!a) return;
    if (inv.notes?.includes(SUBDOMAIN)) {
      await this.prisma.agentProfile.update({
        where: { id: a.id },
        data: { siteActivatedAt: a.siteActivatedAt ?? new Date(), ...(a.siteInvoiceId === inv.id && { siteInvoiceId: null }) },
      });
      return;
    }
    await this.prisma.agentProfile.update({
      where: { id: a.id },
      data: { siteDomainPaidAt: new Date(), ...(a.siteDomainInvoiceId === inv.id && { siteDomainInvoiceId: null }) },
    });
    if (a.siteCustomDomain) await this.connect(a.id, a.siteCustomDomain);
  }

  // ─── Public ─────────────────────────────────────────────────────────────

  /** Host → agent id, for the web proxy. Only paid-for, verified, listed agents route. */
  async resolveHost(domain: string, label: string | null) {
    const a = await this.prisma.agentProfile.findFirst({
      where: {
        kybStatus: KybStatus.APPROVED, isListed: true,
        ...(label
          ? { siteHandle: label, siteActivatedAt: { not: null } }
          : { siteCustomDomain: domain, siteDomainStatus: { in: ['ACTIVE', 'PENDING', 'MANUAL'] } }),
      },
      select: { id: true },
    });
    return a?.id ?? null;
  }

  /** The site's content: profile, branding, own listings and partnered developments. */
  async site(agentId: string, preview = false) {
    const a = await this.prisma.agentProfile.findFirst({
      where: { id: agentId, ...(preview ? {} : { kybStatus: KybStatus.APPROVED, isListed: true }) },
      select: {
        id: true, kind: true, displayName: true, logoUrl: true, photoUrl: true, bio: true, yearsExperience: true,
        specialties: true, serviceAreas: true, phone: true, whatsapp: true, email: true, officeAddress: true,
        socials: true, ratingAverage: true, ratingCount: true, dealsCompleted: true,
        siteTagline: true, siteAccent: true, siteHeroUrl: true, siteHandle: true, siteActivatedAt: true,
        siteCustomDomain: true, siteDomainStatus: true,
      },
    });
    if (!a) throw new NotFoundException('Agent not found');

    const [own, assigned] = await Promise.all([
      this.prisma.property.findMany({
        where: { listedByAgentId: a.id, status: { in: LIVE } },
        orderBy: { createdAt: 'desc' },
        select: CARD_SELECT,
      }),
      this.prisma.propertyAssignment.findMany({
        where: { isActive: true, partnership: { agentId: a.id, status: 'ACTIVE' }, property: { status: { in: LIVE } } },
        orderBy: { assignedAt: 'desc' },
        select: { property: { select: CARD_SELECT } },
      }),
    ]);
    const seen = new Set(own.map((p) => p.id));
    const partnered = assigned.map((x) => x.property).filter((p) => !seen.has(p.id) && seen.add(p.id));

    // Where each card opens: the development's own domain if it has one.
    const href = (p: (typeof own)[number]) =>
      p.customDomain && p.domainStatus === 'ACTIVE' ? `https://${p.customDomain}`
        : p.subdomain && p.subdomainActivatedAt ? `https://${p.subdomain}.e-resi.com`
          : `https://e-resi.com/${p.slug}`;
    const card = (p: (typeof own)[number], kind: 'OWN' | 'PARTNER') => ({
      id: p.id, slug: p.slug, name: p.name, tagline: p.tagline, heroImageUrl: p.heroImageUrl,
      city: p.city, neighborhood: p.neighborhood, category: p.category, status: p.status,
      priceFrom: p.priceFrom, priceTo: p.priceTo, currency: p.currency,
      has3DTour: p.has3DTour, hasVRTour: p.hasVRTour, hasCinematicTour: p.hasCinematicTour,
      developerName: p.developer?.companyName ?? p.developerName ?? null,
      // Partnered developments credit the agent through their referral link.
      units: p._count.units, kind, href: kind === 'PARTNER' ? `${href(p)}?ref=${a.id}` : href(p),
    });
    const { siteHandle, siteActivatedAt, siteCustomDomain, siteDomainStatus, ...profile } = a;
    return {
      agent: profile,
      url: this.publicUrl({ siteHandle, siteActivatedAt, siteCustomDomain, siteDomainStatus }),
      listings: [...own.map((p) => card(p, 'OWN')), ...partnered.map((p) => card(p, 'PARTNER'))],
    };
  }

  /** Owner preview (any verification state). */
  async previewMine(userId: string) {
    const a = await this.agentOf(userId);
    return this.site(a.id, true);
  }
}
