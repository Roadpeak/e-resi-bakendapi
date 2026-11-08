import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, SiteTemplateTier, type Invoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Agent-website templates. The designs live in the web app, keyed by the same
 * string; this service owns the catalogue (admin decides free vs premium and
 * the one-time unlock price), each agent's unlocks, the chosen template, and
 * section order/visibility.
 */

/** Designs the web app ships. New ones are added here and appear in admin. */
const CATALOGUE: { key: string; name: string; description: string; tier: SiteTemplateTier; sortOrder: number }[] = [
  { key: 'CLASSIC', name: 'Classic', description: 'Clean and simple: cover photo, listings, about and contact.', tier: 'FREE', sortOrder: 0 },
  { key: 'HAVEN', name: 'Haven', description: 'A warm personal-brand site for an individual agent: framed hero, your story, why clients choose you.', tier: 'FREE', sortOrder: 1 },
  { key: 'ATELIER', name: 'Atelier', description: 'Editorial and cinematic for agencies: oversized type, scroll-revealed statements, live numbers, featured-listing spotlight.', tier: 'PREMIUM', sortOrder: 2 },
  { key: 'MERIDIAN', name: 'Meridian', description: 'Quiet luxury: serif type, centre-focus listing carousel, ornament details and a private-consultation call to action.', tier: 'PREMIUM', sortOrder: 3 },
  { key: 'TERRACE', name: 'Terrace', description: 'Warm agency site: full-bleed hero with feature chips, scroll-filled statement, bento numbers, photo listing cards, step tabs over a big image.', tier: 'PREMIUM', sortOrder: 4 },
  { key: 'PORTAL', name: 'Portal', description: 'Your site as a property app: sidebar navigation, featured carousel with thumbnails, search panel with category tiles and budget filters.', tier: 'PREMIUM', sortOrder: 5 },
  { key: 'ARCADIA', name: 'Arcadia', description: 'Warm one-pager for individual agents: arch photos with drifting shapes, buyer and seller paths, one story at a time, contact form on the page.', tier: 'PREMIUM', sortOrder: 6 },
  { key: 'CREST', name: 'Crest', description: 'Crisp brokerage site: slide-in menu, featured-development hero with key facts, numbered category cards, tagged listings.', tier: 'PREMIUM', sortOrder: 7 },
  { key: 'NEST', name: 'Nest', description: 'App-like and friendly: bento hero with reviews scrolling upward, booking-style listing cards, floating tab bar.', tier: 'PREMIUM', sortOrder: 8 },
  { key: 'LINEA', name: 'Linea', description: 'Minimal, link-in-bio style: live listing search, a one-sentence hero with your photo inline, live clock, badges, load-more grid.', tier: 'PREMIUM', sortOrder: 9 },
  { key: 'ROAM', name: 'Roam', description: 'Bold and friendly: giant headline over a rising photo, appraisal call to action, tilted client cards drifting past, bright area strip.', tier: 'PREMIUM', sortOrder: 10 },
  { key: 'SUMMIT', name: 'Summit', description: 'Quiet luxury: inset rounded hero with huge thin type, cycling featured-home card, full-screen menu, buying/selling mini form.', tier: 'PREMIUM', sortOrder: 11 },
  { key: 'METRO', name: 'Metro', description: 'Full-service agency: Properties dropdown (buy, sell, let), rolling odometer numbers, fact-rich listings, four-step process.', tier: 'PREMIUM', sortOrder: 12 },
  { key: 'RESIDENCE', name: 'Residence', description: 'Complete estate agency: search panel over the hero with popular searches, KPI strip, neighbourhood list with preview, owner cards.', tier: 'PREMIUM', sortOrder: 13 },
];

/** Sections every template understands, in the default order. */
export const SITE_SECTIONS = [
  'stats', 'listings', 'services', 'packages', 'process', 'valuation', 'calculator', 'about', 'team', 'sold', 'cases', 'testimonials',
  'areas', 'guides', 'awards', 'journal', 'careers', 'faq', 'newsletter', 'contact',
] as const;
export type SiteSectionId = (typeof SITE_SECTIONS)[number];
export type SiteSection = { id: SiteSectionId; visible: boolean };

const NOTE = 'AGENT_TEMPLATE:';

export function normaliseSections(raw: unknown): SiteSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SiteSection[] = [];
  for (const item of list) {
    const id = (item as { id?: string })?.id as SiteSectionId;
    if (SITE_SECTIONS.includes(id) && !out.some((s) => s.id === id)) {
      out.push({ id, visible: (item as { visible?: boolean }).visible !== false });
    }
  }
  // Sections added after the agent last saved slot in after the section that
  // precedes them by default (contact stays last), switched on.
  SITE_SECTIONS.forEach((id, i) => {
    if (out.some((s) => s.id === id)) return;
    let at = out.length;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((s) => s.id === SITE_SECTIONS[j]);
      if (k >= 0) { at = k + 1; break; }
    }
    if (i === 0) at = 0;
    out.splice(at, 0, { id, visible: true });
  });
  return out;
}

@Injectable()
export class AgentTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(AgentTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly invoices: InvoicesService,
  ) {}

  async onModuleInit() {
    // Create missing catalogue rows; never overwrite what admin has set.
    for (const t of CATALOGUE) {
      await this.prisma.agentSiteTemplate.upsert({ where: { key: t.key }, update: {}, create: t })
        .catch((e) => this.logger.warn(`Template ${t.key}: ${(e as Error).message}`));
    }
    this.invoices.onPaid('AGENT_TEMPLATE', (inv) => this.fulfil(inv));
  }

  private async agentOf(userId: string) {
    const a = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!a) throw new ForbiddenException('Agent profile required');
    return a;
  }

  private isFree(t: { tier: SiteTemplateTier; unlockPrice: number }) {
    return t.tier === 'FREE' || t.unlockPrice <= 0;
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminList() {
    const [rows, currency, counts] = await Promise.all([
      this.prisma.agentSiteTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.pricing.platformCurrency(),
      this.prisma.agentTemplateUnlock.groupBy({ by: ['templateKey'], where: { paidAt: { not: null } }, _count: { _all: true } }),
    ]);
    const using = await this.prisma.agentProfile.groupBy({ by: ['siteTemplate'], _count: { _all: true } });
    return {
      currency,
      templates: rows.map((t) => ({
        ...t,
        unlocked: counts.find((c) => c.templateKey === t.key)?._count._all ?? 0,
        inUse: using.find((u) => u.siteTemplate === t.key)?._count._all ?? 0,
      })),
    };
  }

  async adminUpdate(key: string, dto: { tier?: SiteTemplateTier; unlockPrice?: number; isActive?: boolean; name?: string; description?: string | null }) {
    const t = await this.prisma.agentSiteTemplate.findUnique({ where: { key } });
    if (!t) throw new NotFoundException('Template not found');
    if (key === 'CLASSIC' && (dto.tier === 'PREMIUM' || dto.isActive === false)) {
      throw new BadRequestException('Classic is the fallback every site can use — it stays free and active.');
    }
    if (dto.unlockPrice !== undefined && (!Number.isFinite(dto.unlockPrice) || dto.unlockPrice < 0)) {
      throw new BadRequestException('Price must be zero or more');
    }
    await this.prisma.agentSiteTemplate.update({
      where: { key },
      data: {
        ...(dto.tier && { tier: dto.tier }),
        ...(dto.unlockPrice !== undefined && { unlockPrice: Math.round(dto.unlockPrice * 100) / 100 }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.name?.trim() && { name: dto.name.trim().slice(0, 60) }),
        ...(dto.description !== undefined && { description: dto.description?.trim().slice(0, 300) || null }),
      },
    });
    return this.adminList();
  }

  // ─── Agent ────────────────────────────────────────────────────────────────

  /** The gallery: every active template with this agent's access to it. */
  async mine(userId: string) {
    const a = await this.agentOf(userId);
    const [rows, unlocks, currency] = await Promise.all([
      this.prisma.agentSiteTemplate.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.agentTemplateUnlock.findMany({ where: { agentId: a.id } }),
      this.pricing.platformCurrency(),
    ]);
    const invoiceIds = unlocks.filter((u) => !u.paidAt && u.invoiceId).map((u) => u.invoiceId!);
    const invoices = invoiceIds.length
      ? await this.prisma.invoice.findMany({
        where: { id: { in: invoiceIds }, status: { in: ['ISSUED', 'OVERDUE'] } },
        select: { id: true, number: true, total: true, currency: true, status: true },
      })
      : [];
    return {
      currency,
      current: await this.effectiveTemplate(a.id, a.siteTemplate),
      sections: normaliseSections(a.siteSections),
      templates: rows.map((t) => {
        const u = unlocks.find((x) => x.templateKey === t.key);
        return {
          key: t.key, name: t.name, description: t.description, tier: t.tier, unlockPrice: t.unlockPrice,
          free: this.isFree(t),
          unlocked: this.isFree(t) || !!u?.paidAt,
          invoice: u?.invoiceId ? invoices.find((i) => i.id === u.invoiceId) ?? null : null,
        };
      }),
    };
  }

  /**
   * Unlock a premium template: at once when it costs nothing, otherwise by a
   * one-time invoice (reusing an open one). Paying it unlocks and applies it.
   */
  async unlock(userId: string, key: string) {
    const a = await this.agentOf(userId);
    const t = await this.prisma.agentSiteTemplate.findUnique({ where: { key } });
    if (!t || !t.isActive) throw new NotFoundException('Template not found');
    const existing = await this.prisma.agentTemplateUnlock.findUnique({ where: { agentId_templateKey: { agentId: a.id, templateKey: key } } });
    if (this.isFree(t) || existing?.paidAt) {
      await this.prisma.agentTemplateUnlock.upsert({
        where: { agentId_templateKey: { agentId: a.id, templateKey: key } },
        update: { paidAt: existing?.paidAt ?? new Date() },
        create: { agentId: a.id, templateKey: key, paidAt: new Date() },
      });
      await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteTemplate: key } });
      return this.mine(userId);
    }
    if (existing?.invoiceId) {
      const open = await this.prisma.invoice.findUnique({ where: { id: existing.invoiceId }, select: { status: true, total: true } });
      if (open && (open.status === 'ISSUED' || open.status === 'OVERDUE')) return this.mine(userId);
    }
    const currency = await this.pricing.platformCurrency();
    const inv = await this.invoices.create({
      userId, kind: 'AGENT_TEMPLATE', currency, sendNow: true,
      lines: [{ description: `Website template — ${t.name} (one-time unlock)`, quantity: 1, unitAmount: t.unlockPrice, amount: t.unlockPrice }],
      dueAt: new Date(Date.now() + 7 * 86_400_000),
      notes: `${NOTE}${key}`,
    });
    await this.prisma.agentTemplateUnlock.upsert({
      where: { agentId_templateKey: { agentId: a.id, templateKey: key } },
      update: { invoiceId: inv.id },
      create: { agentId: a.id, templateKey: key, invoiceId: inv.id },
    });
    return this.mine(userId);
  }

  /** Switch to a template the agent can use. */
  async select(userId: string, key: string) {
    const a = await this.agentOf(userId);
    const t = await this.prisma.agentSiteTemplate.findUnique({ where: { key } });
    if (!t || !t.isActive) throw new NotFoundException('Template not found');
    if (!this.isFree(t)) {
      const u = await this.prisma.agentTemplateUnlock.findUnique({ where: { agentId_templateKey: { agentId: a.id, templateKey: key } } });
      if (!u?.paidAt) throw new BadRequestException(`Unlock ${t.name} first`);
    }
    await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteTemplate: key } });
    return this.mine(userId);
  }

  async saveSections(userId: string, sections: unknown) {
    const a = await this.agentOf(userId);
    const clean = normaliseSections(sections);
    await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteSections: clean as unknown as Prisma.InputJsonValue } });
    return this.mine(userId);
  }

  /**
   * What the public site actually renders. A template that admin switched
   * off, or a premium one that is no longer unlocked (made premium after the
   * agent picked it free, say), falls back to Classic rather than breaking.
   */
  async effectiveTemplate(agentId: string, chosen: string) {
    if (chosen === 'CLASSIC') return 'CLASSIC';
    const t = await this.prisma.agentSiteTemplate.findUnique({ where: { key: chosen } });
    if (!t || !t.isActive) return 'CLASSIC';
    if (this.isFree(t)) return t.key;
    const u = await this.prisma.agentTemplateUnlock.findUnique({ where: { agentId_templateKey: { agentId, templateKey: chosen } } });
    return u?.paidAt ? t.key : 'CLASSIC';
  }

  /** For owner previews: any active template, bought or not. */
  async previewable(key: string | undefined) {
    if (!key) return null;
    const t = await this.prisma.agentSiteTemplate.findUnique({ where: { key } });
    return t?.isActive ? t.key : null;
  }

  /** Paid (or waived) unlock invoice: record it and apply the template. */
  private async fulfil(inv: Invoice) {
    const key = inv.notes?.split(NOTE)[1]?.trim().split(/\s/)[0];
    if (!key) return;
    const a = await this.prisma.agentProfile.findUnique({ where: { userId: inv.userId }, select: { id: true } });
    if (!a) return;
    await this.prisma.agentTemplateUnlock.upsert({
      where: { agentId_templateKey: { agentId: a.id, templateKey: key } },
      update: { paidAt: new Date(), invoiceId: inv.id },
      create: { agentId: a.id, templateKey: key, invoiceId: inv.id, paidAt: new Date() },
    });
    await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteTemplate: key } });
  }
}
