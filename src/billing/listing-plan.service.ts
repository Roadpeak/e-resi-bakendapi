import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { type Invoice, type ListingPlan, PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Per-development listing fees, for developer- and agent-owned listings.
 *
 * Each listing is paid before it goes live and is billed on its own cycle:
 * ONE_TIME (paid once, stays up) or MONTHLY (renews monthly from go-live, in
 * advance; unpaid → 7-day grace → paused, paying puts it back). The plan
 * follows the admin default for its owner type unless the listing has an
 * override. Changing a plan is announced 7 days ahead and applies at the
 * listing's next billing date. Every fee can be switched off ("free").
 */

export type OwnerType = 'DEVELOPER' | 'AGENT';

const LIVE: PropertyStatus[] = [PropertyStatus.ACTIVE, PropertyStatus.OFF_PLAN, PropertyStatus.SOLD_OUT];
const NOTICE_DAYS = 7;
const GRACE_DAYS = 7;
const DAY = 86_400_000;

/** Settings this feature owns, created if missing so admins can see and edit them. */
const SETTINGS = [
  { key: 'developer_listing_fee_enabled', value: 'true', valueType: 'boolean', label: 'Developer listing fee on', description: 'Off: developer listings go live free on approval.' },
  { key: 'developer_listing_plan', value: 'MONTHLY', valueType: 'string', label: 'Developer listing plan (default)', description: 'MONTHLY or ONE_TIME. Change it from Listing plans so owners get notice.' },
  { key: 'developer_listing_fee_one_time', value: '199', valueType: 'number', label: 'Developer listing fee — one-time', description: 'Charged once per development on the one-time plan.' },
  { key: 'agent_listing_fee_enabled', value: 'true', valueType: 'boolean', label: 'Agent listing fee on', description: 'Off: agent listings go live free on approval.' },
  { key: 'agent_listing_plan', value: 'MONTHLY', valueType: 'string', label: 'Agent listing plan (default)', description: 'MONTHLY or ONE_TIME. Change it from Listing plans so owners get notice.' },
  { key: 'agent_listing_fee_monthly_individual', value: '19', valueType: 'number', label: 'Agent listing fee — individual, monthly' },
  { key: 'agent_listing_fee_monthly_company', value: '39', valueType: 'number', label: 'Agent listing fee — agency, monthly' },
  { key: 'agent_listing_fee_one_time_individual', value: '99', valueType: 'number', label: 'Agent listing fee — individual, one-time' },
  { key: 'agent_listing_fee_one_time_company', value: '199', valueType: 'number', label: 'Agent listing fee — agency, one-time' },
  { key: 'agent_fee_enabled', value: 'true', valueType: 'boolean', label: 'Agent membership fee on', description: 'The monthly agent fee that keeps an agent listed. Separate from per-listing fees.' },
  { key: 'listing_honour_one_time', value: 'true', valueType: 'boolean', label: 'Honour one-time payments', description: 'When the plan switches to monthly, listings already paid one-time stay free.' },
];

interface Owner { type: OwnerType; userId: string; agentKind?: 'COMPANY' | 'INDIVIDUAL'; joinedAt: Date }

type PropertyRow = {
  id: string; slug: string; name: string; status: PropertyStatus;
  listingPlanOverride: ListingPlan | null; listingPlan: ListingPlan | null;
  listingPaidThrough: Date | null; listingOneTimePaidAt: Date | null; listingGraceEndsAt: Date | null;
  listingPendingPlan: ListingPlan | null; listingPendingPlanAt: Date | null; listingInvoiceId: string | null;
  developer: { userId: string; createdAt: Date } | null;
  listedByAgent: { userId: string; kind: 'COMPANY' | 'INDIVIDUAL'; createdAt: Date } | null;
};

const SELECT = {
  id: true, slug: true, name: true, status: true,
  listingPlanOverride: true, listingPlan: true, listingPaidThrough: true, listingOneTimePaidAt: true,
  listingGraceEndsAt: true, listingPendingPlan: true, listingPendingPlanAt: true, listingInvoiceId: true,
  developer: { select: { userId: true, createdAt: true } },
  listedByAgent: { select: { userId: true, kind: true, createdAt: true } },
} as const;

const addMonth = (d: Date) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; };
const fmt = (d: Date) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

@Injectable()
export class ListingPlanService implements OnModuleInit {
  private readonly logger = new Logger(ListingPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
    private readonly invoices: InvoicesService,
  ) {}

  async onModuleInit() {
    for (const s of SETTINGS) {
      await this.prisma.platformSetting.upsert({
        where: { key: s.key }, update: {}, create: { ...s, group: 'billing' },
      }).catch((e) => this.logger.warn(`Setting ${s.key}: ${(e as Error).message}`));
    }
    // Paying (or waiving) a listing invoice puts the listing live and moves its cycle on.
    this.invoices.onPaid('LISTING', (inv) => this.settle(inv));
  }

  // ─── Configuration ──────────────────────────────────────────────────────

  private async bool(key: string, fallback: boolean) {
    return (await this.pricing.getSetting(key, String(fallback))).trim().toLowerCase() === 'true';
  }
  private async num(key: string, fallback: number) {
    const n = Number(await this.pricing.getSetting(key, String(fallback)));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  async feeEnabled(type: OwnerType) {
    return this.bool(type === 'AGENT' ? 'agent_listing_fee_enabled' : 'developer_listing_fee_enabled', true);
  }

  async defaultPlan(type: OwnerType): Promise<ListingPlan> {
    const v = (await this.pricing.getSetting(type === 'AGENT' ? 'agent_listing_plan' : 'developer_listing_plan', 'MONTHLY')).trim().toUpperCase();
    return v === 'ONE_TIME' ? 'ONE_TIME' : 'MONTHLY';
  }

  /** Price before tax for this owner and plan. */
  async price(type: OwnerType, plan: ListingPlan, agentKind?: 'COMPANY' | 'INDIVIDUAL') {
    if (type === 'DEVELOPER') {
      return plan === 'ONE_TIME' ? this.num('developer_listing_fee_one_time', 199) : this.num('listing_fee_monthly', 49);
    }
    const k = agentKind === 'COMPANY' ? 'company' : 'individual';
    return plan === 'ONE_TIME'
      ? this.num(`agent_listing_fee_one_time_${k}`, k === 'company' ? 199 : 99)
      : this.num(`agent_listing_fee_monthly_${k}`, k === 'company' ? 39 : 19);
  }

  /** Everything the admin screen and the listing wizard show. */
  async config() {
    const [currency, devOn, devPlan, devMonthly, devOnce, agOn, agPlan, agMi, agMc, agOi, agOc, memberOn, honour] = await Promise.all([
      this.pricing.platformCurrency(),
      this.feeEnabled('DEVELOPER'), this.defaultPlan('DEVELOPER'),
      this.num('listing_fee_monthly', 49), this.num('developer_listing_fee_one_time', 199),
      this.feeEnabled('AGENT'), this.defaultPlan('AGENT'),
      this.num('agent_listing_fee_monthly_individual', 19), this.num('agent_listing_fee_monthly_company', 39),
      this.num('agent_listing_fee_one_time_individual', 99), this.num('agent_listing_fee_one_time_company', 199),
      this.bool('agent_fee_enabled', true), this.bool('listing_honour_one_time', true),
    ]);
    return {
      currency,
      developer: { enabled: devOn, plan: devPlan, monthly: devMonthly, oneTime: devOnce },
      agent: {
        enabled: agOn, plan: agPlan,
        monthly: { individual: agMi, company: agMc },
        oneTime: { individual: agOi, company: agOc },
        membershipEnabled: memberOn,
      },
      honourOneTime: honour,
      noticeDays: NOTICE_DAYS, graceDays: GRACE_DAYS,
    };
  }

  /** Listings waiting on payment, paused, or with an announced plan change. */
  async counts() {
    const [pendingPayment, paused, pendingChanges] = await Promise.all([
      this.prisma.property.count({ where: { status: PropertyStatus.PENDING_PAYMENT } }),
      this.prisma.property.count({ where: { status: PropertyStatus.PAUSED } }),
      this.prisma.property.count({ where: { listingPendingPlan: { not: null } } }),
    ]);
    return { pendingPayment, paused, pendingChanges };
  }

  private ownerOf(p: PropertyRow): Owner | null {
    if (p.developer) return { type: 'DEVELOPER', userId: p.developer.userId, joinedAt: p.developer.createdAt };
    if (p.listedByAgent) return { type: 'AGENT', userId: p.listedByAgent.userId, agentKind: p.listedByAgent.kind, joinedAt: p.listedByAgent.createdAt };
    return null;
  }

  private async planFor(p: PropertyRow, owner: Owner): Promise<ListingPlan> {
    return p.listingPlanOverride ?? (await this.defaultPlan(owner.type));
  }

  /** Developers keep their complimentary months on signup. */
  private async freeUntil(owner: Owner): Promise<Date | null> {
    if (owner.type !== 'DEVELOPER') return null;
    const months = await this.num('listing_fee_free_months', 0);
    if (months <= 0) return null;
    const d = new Date(owner.joinedAt); d.setMonth(d.getMonth() + months);
    return d > new Date() ? d : null;
  }

  private manageLink(p: { slug: string }, owner: Owner) {
    return owner.type === 'AGENT' ? `/agent/listings/${p.slug}` : `/dashboard/properties/${p.slug}`;
  }

  private notify(owner: Owner, p: PropertyRow, title: string, body: string) {
    return this.notifications.createNotification(owner.userId, 'GENERAL', title, body, p.id, 'ListingFee', this.manageLink(p, owner))
      .catch((e) => this.logger.warn(`Notify ${p.slug}: ${(e as Error).message}`));
  }

  // ─── Invoicing ──────────────────────────────────────────────────────────

  private async invoice(p: PropertyRow, owner: Owner, plan: ListingPlan): Promise<Invoice | null> {
    const amount = await this.price(owner.type, plan, owner.agentKind);
    if (amount <= 0) return null;
    const label = plan === 'ONE_TIME'
      ? `Listing fee (one-time) — ${p.name}`
      : `Listing fee (monthly) — ${p.name}`;
    const inv = await this.invoices.create({
      userId: owner.userId,
      kind: 'LISTING',
      propertyId: p.id,
      lines: [{ description: label, quantity: 1, unitAmount: amount, amount }],
      dueAt: new Date(),
      currency: await this.pricing.platformCurrency(),
      sendNow: true,
      // Read back by settle(): which plan this payment buys.
      notes: `LISTING_PLAN:${plan}`,
    });
    await this.prisma.property.update({ where: { id: p.id }, data: { listingInvoiceId: inv.id } });
    return inv;
  }

  /** Try the owner's saved card; leaves the invoice open for card/M-Pesa if it can't. */
  private async tryCharge(inv: Invoice) {
    try {
      const r = await this.invoices.startPayment(inv.id, inv.userId);
      return !!(r as { paid?: boolean }).paid;
    } catch {
      return false;
    }
  }

  // ─── Approval: pay before going live ────────────────────────────────────

  /**
   * Called when admin approves a listing. Free (fee off, free window, zero
   * price) → live now. Otherwise → PENDING_PAYMENT with an invoice for the
   * one-time fee or the first month; paying puts it live.
   */
  async onApproved(propertyId: string): Promise<PropertyStatus> {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId }, select: SELECT }) as PropertyRow | null;
    if (!p) return PropertyStatus.ACTIVE;
    const owner = this.ownerOf(p);
    if (!owner) return PropertyStatus.ACTIVE;
    const plan = await this.planFor(p, owner);

    // Already settled once before (re-approval after changes): just go live.
    if (p.listingOneTimePaidAt || (p.listingPaidThrough && p.listingPaidThrough > new Date())) {
      await this.prisma.property.update({ where: { id: p.id }, data: { status: PropertyStatus.ACTIVE } });
      return PropertyStatus.ACTIVE;
    }

    const freeTill = await this.freeUntil(owner);
    const enabled = await this.feeEnabled(owner.type);
    const amount = await this.price(owner.type, plan, owner.agentKind);
    if (!enabled || amount <= 0 || freeTill) {
      await this.prisma.property.update({
        where: { id: p.id },
        data: {
          status: PropertyStatus.ACTIVE,
          listingPlan: plan,
          // Monthly listings start their cycle when free time ends (or now, so
          // turning the fee on later bills from that moment).
          listingPaidThrough: plan === 'MONTHLY' ? (freeTill ?? new Date()) : null,
        },
      });
      return PropertyStatus.ACTIVE;
    }

    await this.prisma.property.update({
      where: { id: p.id },
      data: { status: PropertyStatus.PENDING_PAYMENT, listingPlan: plan },
    });
    const inv = await this.invoice(p, owner, plan);
    if (inv && (await this.tryCharge(inv))) return PropertyStatus.ACTIVE;
    await this.notify(owner, p, `Pay to publish ${p.name}`,
      `${p.name} is approved. Pay its ${plan === 'ONE_TIME' ? 'one-time' : 'first monthly'} listing fee to put it live.`);
    return PropertyStatus.PENDING_PAYMENT;
  }

  /** Paid (or waived) listing invoice: put the listing live, move its cycle on. */
  async settle(inv: Invoice) {
    if (!inv.propertyId) return;
    const p = await this.prisma.property.findUnique({ where: { id: inv.propertyId }, select: SELECT }) as PropertyRow | null;
    if (!p) return;
    const plan: ListingPlan = inv.notes?.includes('LISTING_PLAN:ONE_TIME') ? 'ONE_TIME' : 'MONTHLY';
    const now = new Date();
    const data: Record<string, unknown> = {
      listingInvoiceId: p.listingInvoiceId === inv.id ? null : p.listingInvoiceId,
      listingGraceEndsAt: null,
      ...(p.status === PropertyStatus.PENDING_PAYMENT || p.status === PropertyStatus.PAUSED ? { status: PropertyStatus.ACTIVE } : {}),
    };
    if (plan === 'ONE_TIME') {
      Object.assign(data, { listingPlan: 'ONE_TIME', listingOneTimePaidAt: now, listingPaidThrough: null });
    } else {
      const from = p.listingPaidThrough && p.listingPaidThrough > now ? p.listingPaidThrough : now;
      Object.assign(data, { listingPlan: 'MONTHLY', listingPaidThrough: addMonth(from) });
    }
    await this.prisma.property.update({ where: { id: p.id }, data });
  }

  // ─── Plan changes (with notice) ─────────────────────────────────────────

  /** When a change for this listing can take effect: after the notice, at its next billing date. */
  private effectiveDate(p: PropertyRow) {
    const notice = new Date(Date.now() + NOTICE_DAYS * DAY);
    if (p.listingPlan === 'MONTHLY' && p.listingPaidThrough && p.listingPaidThrough > notice) return p.listingPaidThrough;
    return notice;
  }

  /** Announce a change to one listing (or apply at once if it isn't live yet). */
  private async schedule(p: PropertyRow, target: ListingPlan) {
    const owner = this.ownerOf(p);
    if (!owner) return false;
    if (!LIVE.includes(p.status) && p.status !== PropertyStatus.PAUSED) {
      // Not live yet: the next approval simply uses the new plan.
      await this.prisma.property.update({ where: { id: p.id }, data: { listingPendingPlan: null, listingPendingPlanAt: null } });
      return false;
    }
    if (p.listingPlan === target) {
      if (p.listingPendingPlan) await this.prisma.property.update({ where: { id: p.id }, data: { listingPendingPlan: null, listingPendingPlanAt: null } });
      return false;
    }
    const at = this.effectiveDate(p);
    await this.prisma.property.update({ where: { id: p.id }, data: { listingPendingPlan: target, listingPendingPlanAt: at } });
    const price = await this.price(owner.type, target, owner.agentKind);
    const currency = await this.pricing.platformCurrency();
    await this.notify(owner, p, `Listing plan change for ${p.name}`,
      target === 'ONE_TIME'
        ? `From ${fmt(at)}, ${p.name} moves to a one-time listing fee of ${currency} ${price.toLocaleString()}. Once paid, it stays live with no further listing charges.`
        : `From ${fmt(at)}, ${p.name} moves to a monthly listing fee of ${currency} ${price.toLocaleString()} a month.`);
    return true;
  }

  /** Admin changes the default plan for developers or agents: every listing following the default gets notice. */
  async setDefaultPlan(type: OwnerType, plan: ListingPlan) {
    await this.prisma.platformSetting.upsert({
      where: { key: type === 'AGENT' ? 'agent_listing_plan' : 'developer_listing_plan' },
      update: { value: plan },
      create: { key: type === 'AGENT' ? 'agent_listing_plan' : 'developer_listing_plan', value: plan, valueType: 'string', label: `${type} listing plan`, group: 'billing' },
    });
    const rows = await this.prisma.property.findMany({
      where: {
        listingPlanOverride: null,
        ...(type === 'AGENT' ? { listedByAgentId: { not: null } } : { developerId: { not: null } }),
        status: { in: [...LIVE, PropertyStatus.PAUSED] },
      },
      select: SELECT,
    }) as PropertyRow[];
    let scheduled = 0;
    for (const p of rows) if (await this.schedule(p, plan)) scheduled++;
    return { plan, listingsNotified: scheduled };
  }

  /** Admin sets (or clears) one listing's override. */
  async setOverride(slug: string, override: ListingPlan | null) {
    const p = await this.prisma.property.update({ where: { slug }, data: { listingPlanOverride: override }, select: SELECT }) as PropertyRow;
    const owner = this.ownerOf(p);
    if (!owner) return { scheduled: false };
    const target = override ?? (await this.defaultPlan(owner.type));
    return { scheduled: await this.schedule(p, target), plan: target };
  }

  // ─── Daily run ──────────────────────────────────────────────────────────

  @Cron('0 5 * * *', { name: 'listing-plans', timeZone: 'Africa/Nairobi' })
  async daily() {
    try {
      const r = await this.runDaily();
      this.logger.log(`Listing plans: ${JSON.stringify(r)}`);
    } catch (e) {
      this.logger.error(`Listing plans run failed: ${(e as Error).message}`);
    }
  }

  async runDaily() {
    const now = new Date();
    const out = { freed: 0, switched: 0, invoiced: 0, charged: 0, paused: 0 };
    const honour = await this.bool('listing_honour_one_time', true);

    // 1. A fee switched off: anything waiting on it goes (back) live.
    for (const type of ['DEVELOPER', 'AGENT'] as const) {
      if (await this.feeEnabled(type)) continue;
      const waiting = await this.prisma.property.findMany({
        where: {
          status: { in: [PropertyStatus.PENDING_PAYMENT, PropertyStatus.PAUSED] },
          ...(type === 'AGENT' ? { listedByAgentId: { not: null } } : { developerId: { not: null } }),
        },
        select: { id: true, listingInvoiceId: true },
      });
      for (const w of waiting) {
        if (w.listingInvoiceId) await this.invoices.cancel(w.listingInvoiceId).catch(() => undefined);
        await this.prisma.property.update({
          where: { id: w.id },
          data: { status: PropertyStatus.ACTIVE, listingInvoiceId: null, listingGraceEndsAt: null },
        });
        out.freed++;
      }
    }

    // 2. Announced plan changes that are now due.
    const due = await this.prisma.property.findMany({
      where: { listingPendingPlanAt: { lte: now }, listingPendingPlan: { not: null } },
      select: SELECT,
    }) as PropertyRow[];
    for (const p of due) {
      const owner = this.ownerOf(p); if (!owner) continue;
      const target = p.listingPendingPlan!;
      const clear = { listingPendingPlan: null, listingPendingPlanAt: null };
      if (target === 'MONTHLY') {
        if (honour && p.listingOneTimePaidAt) {
          await this.prisma.property.update({ where: { id: p.id }, data: clear });
          continue;
        }
        // Starts its monthly cycle now; step 3 bills it.
        await this.prisma.property.update({ where: { id: p.id }, data: { ...clear, listingPlan: 'MONTHLY', listingPaidThrough: now } });
      } else {
        // Monthly → one-time: bill the one-time fee once; settle() switches the plan.
        await this.prisma.property.update({ where: { id: p.id }, data: clear });
        if (!(await this.feeEnabled(owner.type)) || p.listingInvoiceId) {
          await this.prisma.property.update({ where: { id: p.id }, data: { listingPlan: 'ONE_TIME', listingPaidThrough: null } });
        } else {
          const inv = await this.invoice(p, owner, 'ONE_TIME');
          if (inv) {
            out.invoiced++;
            if (await this.tryCharge(inv)) out.charged++;
            else await this.prisma.property.update({ where: { id: p.id }, data: { listingGraceEndsAt: new Date(now.getTime() + GRACE_DAYS * DAY) } });
          }
        }
      }
      out.switched++;
    }

    // 3. Monthly renewals that have fallen due.
    const renewals = await this.prisma.property.findMany({
      where: {
        status: { in: LIVE }, listingPlan: 'MONTHLY', listingPaidThrough: { lte: now }, listingInvoiceId: null,
      },
      select: SELECT,
    }) as PropertyRow[];
    for (const p of renewals) {
      const owner = this.ownerOf(p); if (!owner) continue;
      if (!(await this.feeEnabled(owner.type))) {
        // Free: keep the cycle moving without charging.
        await this.prisma.property.update({ where: { id: p.id }, data: { listingPaidThrough: addMonth(now) } });
        continue;
      }
      const inv = await this.invoice(p, owner, 'MONTHLY');
      if (!inv) { await this.prisma.property.update({ where: { id: p.id }, data: { listingPaidThrough: addMonth(now) } }); continue; }
      out.invoiced++;
      if (await this.tryCharge(inv)) { out.charged++; continue; }
      await this.prisma.property.update({ where: { id: p.id }, data: { listingGraceEndsAt: new Date(now.getTime() + GRACE_DAYS * DAY) } });
      await this.notify(owner, p, `Listing fee due — ${p.name}`,
        `We couldn't charge the monthly listing fee for ${p.name}. Pay it within ${GRACE_DAYS} days to keep it live.`);
    }

    // 4. Grace over and still unpaid: pause (offline, not deleted).
    const lapsed = await this.prisma.property.findMany({
      where: { status: { in: LIVE }, listingGraceEndsAt: { lte: now }, listingInvoiceId: { not: null } },
      select: SELECT,
    }) as PropertyRow[];
    for (const p of lapsed) {
      const owner = this.ownerOf(p); if (!owner) continue;
      await this.prisma.property.update({ where: { id: p.id }, data: { status: PropertyStatus.PAUSED } });
      await this.notify(owner, p, `${p.name} is paused`,
        `${p.name} was taken offline because its listing fee is unpaid. Pay the open invoice to put it straight back live.`);
      out.paused++;
    }
    return out;
  }
}
