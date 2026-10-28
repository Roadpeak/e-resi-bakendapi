import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Invoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { DomainsService } from '../domains/domains.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { InvoicesService } from './invoices.service.js';

export type DomainFeeMode = 'ONE_TIME' | 'MONTHLY';

/** Admin-editable domain prices, created on boot if missing so they show up in Admin → Pricing. */
const DOMAIN_SETTINGS = [
  {
    key: 'domain_custom_fee_mode', value: 'ONE_TIME', valueType: 'choice:ONE_TIME|MONTHLY',
    label: 'Custom domain — billing', group: 'billing',
    description: 'ONE_TIME charges once per development; MONTHLY invoices it every month. Applies to domains connected from now on.',
  },
  {
    key: 'domain_custom_fee_amount', value: '0', valueType: 'number',
    label: 'Custom domain — fee', group: 'billing',
    description: 'Charged for a development on its own domain (e.g. herisresidence.co.ke). 0 makes it free.',
  },
  {
    key: 'domain_subdomain_fee', value: '0', valueType: 'number',
    label: 'e-resi address — one-time fee', group: 'billing',
    description: 'Charged once to activate <name>.e-resi.com for a development. 0 makes it free.',
  },
  {
    key: 'domain_fee_grace_days', value: '7', valueType: 'number',
    label: 'Custom domain — grace days', group: 'billing',
    description: 'How long a monthly domain keeps working after its paid month ends unpaid.',
  },
];

const PAYMENT_TERMS_DAYS = 7;
const RENEW_LEAD_DAYS = 3;
const day = (n: number) => n * 24 * 60 * 60 * 1000;

function addMonth(d: Date) {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Charging for custom domains and e-resi addresses.
 *
 * Nothing is connected or routed until it is paid for (or the fee is 0, or an
 * admin grants it). Paying the invoice — card or M-Pesa, through the normal
 * invoice flow — unlocks it via InvoicesService.onPaid.
 */
@Injectable()
export class DomainBillingService implements OnModuleInit {
  private readonly logger = new Logger(DomainBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly invoices: InvoicesService,
    private readonly domains: DomainsService,
    private readonly events: PlatformEventsService,
  ) {}

  async onModuleInit() {
    this.invoices.onPaid('DOMAIN', (inv) => this.fulfil(inv));
    for (const s of DOMAIN_SETTINGS) {
      try {
        const exists = await this.prisma.platformSetting.findUnique({ where: { key: s.key } });
        if (!exists) await this.prisma.platformSetting.create({ data: s });
      } catch (e) {
        this.logger.warn(`Setting ${s.key} not ensured: ${(e as Error).message}`);
      }
    }
  }

  /** Current prices, as the developer will be charged for anything new. */
  async prices() {
    const [mode, amount, sub, currency] = await Promise.all([
      this.pricing.getSetting('domain_custom_fee_mode', 'ONE_TIME'),
      this.pricing.getSetting('domain_custom_fee_amount', '0'),
      this.pricing.getSetting('domain_subdomain_fee', '0'),
      this.pricing.platformCurrency(),
    ]);
    return {
      currency,
      custom: { mode: (mode === 'MONTHLY' ? 'MONTHLY' : 'ONE_TIME') as DomainFeeMode, amount: Math.max(0, Number(amount) || 0) },
      subdomain: { amount: Math.max(0, Number(sub) || 0) },
    };
  }

  private async graceDays() {
    return Math.max(0, Number(await this.pricing.getSetting('domain_fee_grace_days', '7')) || 0);
  }

  // ── Custom domain ──────────────────────────────────────────────────────────

  /**
   * A domain was just saved on a development. Connect it if already paid for
   * (or free, or granted by an admin); otherwise invoice it and wait.
   */
  async requestCustomDomain(propertyId: string, domain: string, opts: { grant?: boolean } = {}) {
    const p = await this.prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: {
        id: true, name: true, domainBillingMode: true, domainInvoiceId: true,
        domainPaidAt: true, domainPaidThrough: true, developer: { select: { userId: true } },
      },
    });
    if (p.domainInvoiceId) await this.invoices.cancel(p.domainInvoiceId);

    const entitled = (p.domainBillingMode === 'ONE_TIME' && !!p.domainPaidAt)
      || (p.domainBillingMode === 'MONTHLY' && !!p.domainPaidThrough && p.domainPaidThrough > new Date());

    if (opts.grant || entitled) {
      if (opts.grant && !entitled) {
        await this.prisma.property.update({
          where: { id: p.id },
          data: { domainBillingMode: 'ONE_TIME', domainFee: 0, domainPaidAt: new Date(), domainInvoiceId: null },
        });
      }
      await this.domains.connect(p.id, domain);
      return;
    }

    const { custom, currency } = await this.prices();
    if (custom.amount <= 0) {
      await this.prisma.property.update({
        where: { id: p.id },
        data: { domainBillingMode: 'ONE_TIME', domainFee: 0, domainPaidAt: new Date(), domainInvoiceId: null },
      });
      await this.domains.connect(p.id, domain);
      return;
    }

    const invoice = await this.invoices.create({
      userId: p.developer.userId,
      kind: 'DOMAIN',
      domainItem: 'CUSTOM_DOMAIN',
      propertyId: p.id,
      currency,
      lines: [{
        description: custom.mode === 'MONTHLY'
          ? `Custom domain ${domain} for ${p.name} — first month`
          : `Custom domain ${domain} for ${p.name} — one-time`,
        quantity: 1, unitAmount: custom.amount, amount: custom.amount,
      }],
      dueAt: new Date(Date.now() + day(PAYMENT_TERMS_DAYS)),
      notes: `Your domain connects as soon as this is paid.`,
      sendNow: true,
    });
    await this.prisma.property.update({
      where: { id: p.id },
      data: {
        domainBillingMode: custom.mode, domainFee: custom.amount, domainInvoiceId: invoice.id,
        domainStatus: 'AWAITING_PAYMENT', domainError: null,
      },
    });
  }

  /** The domain was removed: withdraw anything unpaid. Paid time is kept. */
  async releaseCustomDomain(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { domainInvoiceId: true } });
    if (p?.domainInvoiceId) {
      await this.invoices.cancel(p.domainInvoiceId);
      await this.prisma.property.update({ where: { id: propertyId }, data: { domainInvoiceId: null } });
    }
  }

  // ── e-resi address ─────────────────────────────────────────────────────────

  /**
   * Activate <subdomain>.e-resi.com: at once when free or granted, otherwise
   * by invoice (reusing an open one rather than raising duplicates).
   */
  async requestSubdomain(propertyId: string, opts: { grant?: boolean } = {}) {
    const p = await this.prisma.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: {
        id: true, name: true, subdomain: true, subdomainActivatedAt: true, subdomainInvoiceId: true,
        developer: { select: { userId: true } },
      },
    });
    if (!p.subdomain) throw new BadRequestException('Choose an address first');
    if (p.subdomainActivatedAt) return { activated: true as const };

    const { subdomain, currency } = await this.prices();
    if (opts.grant || subdomain.amount <= 0) {
      if (p.subdomainInvoiceId) await this.invoices.cancel(p.subdomainInvoiceId);
      await this.prisma.property.update({
        where: { id: p.id }, data: { subdomainActivatedAt: new Date(), subdomainInvoiceId: null },
      });
      return { activated: true as const };
    }

    if (p.subdomainInvoiceId) {
      const open = await this.prisma.invoice.findUnique({ where: { id: p.subdomainInvoiceId } });
      if (open && open.status !== 'CANCELLED' && open.status !== 'PAID') {
        return { activated: false as const, invoice: { id: open.id, number: open.number, total: open.total, currency: open.currency } };
      }
    }

    const invoice = await this.invoices.create({
      userId: p.developer.userId,
      kind: 'DOMAIN',
      domainItem: 'SUBDOMAIN',
      propertyId: p.id,
      currency,
      lines: [{
        description: `e-resi address for ${p.name} — one-time`,
        quantity: 1, unitAmount: subdomain.amount, amount: subdomain.amount,
      }],
      dueAt: new Date(Date.now() + day(PAYMENT_TERMS_DAYS)),
      notes: `Your address activates as soon as this is paid.`,
      sendNow: true,
    });
    await this.prisma.property.update({ where: { id: p.id }, data: { subdomainInvoiceId: invoice.id } });
    return { activated: false as const, invoice: { id: invoice.id, number: invoice.number, total: invoice.total, currency: invoice.currency } };
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  /** A DOMAIN invoice was paid: unlock what it bought. */
  private async fulfil(invoice: Invoice) {
    if (!invoice.propertyId) return;
    const p = await this.prisma.property.findUnique({
      where: { id: invoice.propertyId },
      select: {
        id: true, customDomain: true, domainBillingMode: true, domainPaidThrough: true,
        domainStatus: true, domainExternalId: true, domainInvoiceId: true, subdomainInvoiceId: true,
      },
    });
    if (!p) return;

    if (invoice.domainItem === 'SUBDOMAIN') {
      await this.prisma.property.update({
        where: { id: p.id },
        data: { subdomainActivatedAt: new Date(), ...(p.subdomainInvoiceId === invoice.id && { subdomainInvoiceId: null }) },
      });
      return;
    }

    // Custom domain. Monthly time runs on from the end of the paid period, so
    // paying early never loses days and paying late does not back-date.
    const now = new Date();
    const from = p.domainPaidThrough && p.domainPaidThrough > now ? p.domainPaidThrough : now;
    await this.prisma.property.update({
      where: { id: p.id },
      data: {
        domainPaidAt: now,
        ...(p.domainBillingMode === 'MONTHLY' && { domainPaidThrough: addMonth(from) }),
        ...(p.domainInvoiceId === invoice.id && { domainInvoiceId: null }),
      },
    });

    if (!p.customDomain) return;
    if (p.domainStatus === 'SUSPENDED' && p.domainExternalId) {
      // Still on Cloudflare — just let it route again and re-confirm.
      await this.prisma.property.update({ where: { id: p.id }, data: { domainStatus: 'PENDING' } });
      await this.domains.refresh(p.id, true);
    } else if (p.domainStatus === 'AWAITING_PAYMENT' || !p.domainExternalId) {
      await this.domains.connect(p.id, p.customDomain);
    }
  }

  // ── Monthly renewals ───────────────────────────────────────────────────────

  @Cron('0 5 * * *', { name: 'custom-domain-renewals', timeZone: 'Africa/Nairobi' })
  async renewals() {
    const now = new Date();
    const { currency } = await this.prices();

    // 1. Invoice the next month a few days before the paid one ends.
    const due = await this.prisma.property.findMany({
      where: {
        domainBillingMode: 'MONTHLY', customDomain: { not: null }, domainInvoiceId: null,
        domainPaidThrough: { lte: new Date(now.getTime() + day(RENEW_LEAD_DAYS)) },
      },
      select: {
        id: true, name: true, customDomain: true, domainFee: true, domainPaidThrough: true,
        developer: { select: { userId: true } },
      },
      take: 200,
    });
    for (const p of due) {
      try {
        const amount = p.domainFee ?? 0;
        if (amount <= 0) {
          await this.prisma.property.update({ where: { id: p.id }, data: { domainPaidThrough: addMonth(p.domainPaidThrough ?? now) } });
          continue;
        }
        const invoice = await this.invoices.create({
          userId: p.developer.userId,
          kind: 'DOMAIN',
          domainItem: 'CUSTOM_DOMAIN',
          propertyId: p.id,
          currency,
          lines: [{
            description: `Custom domain ${p.customDomain} for ${p.name} — monthly renewal`,
            quantity: 1, unitAmount: amount, amount,
          }],
          dueAt: p.domainPaidThrough && p.domainPaidThrough > now ? p.domainPaidThrough : new Date(now.getTime() + day(PAYMENT_TERMS_DAYS)),
          notes: 'Keeps your domain connected for another month.',
          sendNow: true,
        });
        await this.prisma.property.update({ where: { id: p.id }, data: { domainInvoiceId: invoice.id } });
      } catch (e) {
        this.logger.error(`Renewal for ${p.customDomain} failed: ${(e as Error).message}`);
      }
    }

    // 2. Stop routing domains left unpaid past the grace period. Cloudflare
    //    keeps the zone, so paying later brings the domain straight back.
    const grace = await this.graceDays();
    const lapsed = await this.prisma.property.findMany({
      where: {
        domainBillingMode: 'MONTHLY', customDomain: { not: null },
        domainStatus: { in: ['ACTIVE', 'PENDING'] },
        domainPaidThrough: { lt: new Date(now.getTime() - day(grace)) },
      },
      select: { id: true, name: true, customDomain: true, developer: { select: { userId: true } } },
      take: 200,
    });
    for (const p of lapsed) {
      await this.prisma.property.update({ where: { id: p.id }, data: { domainStatus: 'SUSPENDED' } });
      void this.events.customDomainSuspended(p.developer.userId, p.name, p.customDomain!, p.id);
    }
  }
}
