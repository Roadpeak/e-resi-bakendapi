import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { PaystackService } from './paystack.service.js';
import { InvoicesService } from './invoices.service.js';

export interface ListingFeeRunSummary {
  period: string;
  developersConsidered: number;
  charged: number;
  failed: number;
  skipped: number;
  alreadyDone: number;
  totalCollected: number;
  currency: string;
}

/**
 * Monthly listing-fee collection.
 *
 * A developer is charged for the developments that were live during the period,
 * against the card they linked through Paystack. Every charge is recorded as a
 * ListingFeeRun keyed by (developerId, period) — that unique constraint, not
 * bookkeeping in this class, is what guarantees nobody is billed twice for the
 * same month however often the job runs.
 */
@Injectable()
export class ListingFeeService {
  private readonly logger = new Logger(ListingFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly paystack: PaystackService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Periods are used as identifiers, so reject anything that is not YYYY-MM. */
  private assertPeriod(period: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format, e.g. 2026-08');
    }
  }

  /** Billing period key for a date, e.g. "2026-08". Local time — the business day is Nairobi's. */
  private periodKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** The month that just ended — fees are charged in arrears. */
  private previousPeriod(now: Date): string {
    return this.periodKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  }

  /**
   * Runs at 03:00 on the 1st of each month, billing the month just ended.
   * Deliberately in arrears: we only charge for listings that were actually
   * live, rather than refunding when one is taken down mid-month.
   */
  @Cron('0 3 1 * *', { name: 'listing-fees', timeZone: 'Africa/Nairobi' })
  async scheduledRun(): Promise<void> {
    const summary = await this.runForPeriod(this.previousPeriod(new Date()));
    this.logger.log(
      `Listing fees ${summary.period}: ${summary.charged} charged, ${summary.failed} failed, `
      + `${summary.skipped} skipped, ${summary.alreadyDone} already done `
      + `(${summary.currency} ${summary.totalCollected.toLocaleString()})`,
    );
  }

  /**
   * Retry failed charges nightly. Cards get declined for temporary reasons —
   * insufficient funds clears, expired cards get replaced — so a single attempt
   * on the 1st would write off revenue that a retry a day later collects.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'listing-fee-retries', timeZone: 'Africa/Nairobi' })
  async retryFailed(): Promise<void> {
    const MAX_ATTEMPTS = 4;
    const failed = await this.prisma.listingFeeRun.findMany({
      where: { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
      include: { developer: { include: { user: true } } },
      take: 100,
    });
    if (!failed.length) return;

    let recovered = 0;
    for (const run of failed) {
      const ok = await this.chargeRun(run.id, run.developer.userId, run.developer.user.email, run.amount, run.currency);
      if (ok) recovered++;
    }
    this.logger.log(`Listing-fee retries: ${recovered}/${failed.length} recovered`);
  }

  /** Fee configuration, as set by admins in platform settings. */
  private async feeConfig(): Promise<{ monthly: number; currency: string; freeMonths: number; taxPercent: number }> {
    const [monthly, currency, freeMonths, tax] = await Promise.all([
      this.pricing.getSetting('listing_fee_monthly', '49'),
      this.pricing.getSetting('listing_fee_currency', 'KES'),
      this.pricing.getSetting('listing_fee_free_months', '0'),
      this.pricing.getSetting('tax_rate_percent', '0'),
    ]);
    return {
      monthly: Number(monthly),
      currency: String(currency).toUpperCase(),
      freeMonths: Number(freeMonths),
      taxPercent: Number(tax),
    };
  }

  /**
   * Build (or reuse) a ListingFeeRun for every developer and charge it.
   * Safe to call repeatedly for the same period.
   */
  async runForPeriod(period: string): Promise<ListingFeeRunSummary> {
    this.assertPeriod(period);
    const cfg = await this.feeConfig();
    const summary: ListingFeeRunSummary = {
      period,
      developersConsidered: 0,
      charged: 0,
      failed: 0,
      skipped: 0,
      alreadyDone: 0,
      totalCollected: 0,
      currency: cfg.currency,
    };

    // Only developers with at least one live development can owe anything.
    const developers = await this.prisma.developerProfile.findMany({
      where: { properties: { some: { status: 'ACTIVE' } } },
      include: {
        user: { select: { id: true, email: true } },
        _count: { select: { properties: { where: { status: 'ACTIVE' } } } },
      },
    });
    summary.developersConsidered = developers.length;

    for (const dev of developers) {
      const existing = await this.prisma.listingFeeRun.findUnique({
        where: { developerId_period: { developerId: dev.id, period } },
      });
      if (existing?.status === 'PAID' || existing?.status === 'SKIPPED') {
        summary.alreadyDone++;
        continue;
      }

      const listingCount = dev._count.properties;
      const net = cfg.monthly * listingCount;
      const amount = Math.round(net * (1 + cfg.taxPercent / 100) * 100) / 100;

      // Inside the free window, or nothing live: record it and move on, so the
      // period still shows as settled rather than perpetually pending.
      if (amount <= 0 || (await this.withinFreeWindow(dev.createdAt, period, cfg.freeMonths))) {
        await this.upsertRun(dev.id, period, listingCount, 0, cfg.currency, 'SKIPPED');
        summary.skipped++;
        continue;
      }

      const run = await this.upsertRun(dev.id, period, listingCount, amount, cfg.currency, 'PENDING');

      // Raise the invoice before charging. It is created as a draft and the
      // dispatch cron releases it three days before the due date, so the
      // developer always sees the bill before the money moves.
      await this.invoices.invoiceListingFeeRun(run.id).catch((err) => {
        this.logger.error(`Could not invoice run ${run.id}: ${(err as Error).message}`);
      });

      const ok = await this.chargeRun(run.id, dev.user.id, dev.user.email, amount, cfg.currency);

      if (ok) {
        summary.charged++;
        summary.totalCollected += amount;
      } else {
        summary.failed++;
      }
    }

    return summary;
  }

  /** True while the developer is still inside their complimentary months. */
  private async withinFreeWindow(joined: Date, period: string, freeMonths: number): Promise<boolean> {
    if (freeMonths <= 0) return false;
    const [y, m] = period.split('-').map(Number);
    const periodStart = new Date(y, m - 1, 1);
    const freeUntil = new Date(joined.getFullYear(), joined.getMonth() + freeMonths, 1);
    return periodStart < freeUntil;
  }

  private upsertRun(
    developerId: string,
    period: string,
    listingCount: number,
    amount: number,
    currency: string,
    status: 'PENDING' | 'SKIPPED',
  ) {
    return this.prisma.listingFeeRun.upsert({
      where: { developerId_period: { developerId, period } },
      create: { developerId, period, listingCount, amount, currency, status },
      update: { listingCount, amount, currency, status },
    });
  }

  /**
   * Charge one run against the developer's default card. Returns whether the
   * money was actually collected; the run row carries the detail either way.
   */
  private async chargeRun(
    runId: string,
    userId: string,
    email: string,
    amount: number,
    currency: string,
  ): Promise<boolean> {
    const card = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, type: 'CARD', verification: 'VERIFIED', processorRef: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    if (!card?.processorRef) {
      await this.markFailed(runId, userId, 'No verified card on file', amount, currency);
      return false;
    }

    // A Paystack account settles in a fixed set of currencies (KES for a Kenyan
    // account). Charging one it does not support fails at the gateway with an
    // opaque error, so refuse here where the reason is actionable.
    const supported = ['KES', 'NGN', 'GHS', 'ZAR', 'USD'];
    if (!supported.includes(currency)) {
      await this.markFailed(
        runId, userId,
        `Listing fee currency ${currency} is not supported by Paystack — `
        + 'update it in Admin → Pricing → Billing settings',
        amount, currency,
      );
      return false;
    }

    // Reference is derived from the run, so a retry of the same period reuses it
    // and Paystack itself rejects a duplicate charge.
    const run = await this.prisma.listingFeeRun.findUnique({ where: { id: runId } });
    const reference = run?.reference ?? `fee_${runId}`;

    try {
      const result = await this.paystack.chargeAuthorization({
        email,
        authorizationCode: card.processorRef,
        amountMinor: Math.round(amount * 100),
        currency,
        reference,
      });

      if (!result.successful) {
        await this.markFailed(runId, userId, 'The card was declined', amount, currency);
        return false;
      }

      const payment = await this.prisma.payment.create({
        data: {
          userId,
          amount,
          currency,
          method: 'PAYSTACK_CARD',
          status: 'COMPLETED',
          reference: result.reference,
          metadata: { purpose: 'listing_fee', runId },
        },
      });

      await this.prisma.listingFeeRun.update({
        where: { id: runId },
        data: {
          status: 'PAID',
          reference: result.reference,
          paymentId: payment.id,
          chargedAt: new Date(),
          failureText: null,
          attempts: { increment: 1 },
        },
      });

      // Settle the invoice this run raised, which issues the receipt.
      const invoice = await this.prisma.invoice.findUnique({
        where: { listingFeeRunId: runId },
        select: { id: true },
      });
      if (invoice) {
        await this.invoices.markPaid({
          invoiceId: invoice.id,
          method: 'Card',
          reference: result.reference,
          paymentId: payment.id,
        }).catch((err) => {
          // The money is collected; a failed receipt must not undo that.
          this.logger.error(`Could not receipt invoice ${invoice.id}: ${(err as Error).message}`);
        });
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markFailed(runId, userId, message, amount, currency);
      return false;
    }
  }

  private async markFailed(
    runId: string,
    userId: string,
    reason: string,
    amount: number,
    currency: string,
  ): Promise<void> {
    const run = await this.prisma.listingFeeRun.update({
      where: { id: runId },
      data: { status: 'FAILED', failureText: reason, attempts: { increment: 1 } },
    });

    // Tell them once, on the first failure — retries run nightly and repeating
    // the same notification daily would train them to ignore it.
    if (run.attempts <= 1) {
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'PAYMENT_RECEIVED',
          title: 'Listing fee could not be collected',
          body: `We could not charge ${currency} ${amount.toLocaleString()} for your listings: ${reason}. `
            + 'We will try again over the next few days — please check your payment method.',
        },
      });
    }
    this.logger.warn(`Listing fee run ${runId} failed: ${reason}`);
  }

  /** Admin view: what a period collected, and what still needs attention. */
  async periodReport(period: string) {
    this.assertPeriod(period);
    const runs = await this.prisma.listingFeeRun.findMany({
      where: { period },
      include: { developer: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!runs.length) throw new NotFoundException(`No billing run for ${period}`);

    const collected = runs.filter((r) => r.status === 'PAID');
    return {
      period,
      totals: {
        collected: collected.reduce((n, r) => n + r.amount, 0),
        currency: runs[0].currency,
        paid: collected.length,
        failed: runs.filter((r) => r.status === 'FAILED').length,
        pending: runs.filter((r) => r.status === 'PENDING').length,
        skipped: runs.filter((r) => r.status === 'SKIPPED').length,
      },
      runs,
    };
  }
}
