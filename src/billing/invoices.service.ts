import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Invoice, InvoiceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { PaystackService } from './paystack.service.js';
import { resolveAppUrl } from '../common/app-url.js';
import { ConfigService } from '@nestjs/config';
import type { DocumentLine } from '../mail/templates/document.js';

/** Subscription invoices go out this many days before the due date. */
const SUBSCRIPTION_LEAD_DAYS = 3;
/** Grace period granted by a reminder before the account is suspended. */
const TERMINATION_NOTICE_DAYS = 5;
/** Production work is due this long after it is ordered. */
const PRODUCTION_TERMS_DAYS = 7;

const day = (n: number) => n * 24 * 60 * 60 * 1000;

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly pricing: PricingService,
    private readonly paystack: PaystackService,
    config: ConfigService,
  ) {
    this.appUrl = resolveAppUrl(config);
  }

  // ─── Numbering ───────────────────────────────────────────────────────────

  /**
   * Sequential per-year reference. Counting existing rows would reuse a number
   * after a deletion, so this reads the highest issued number instead.
   */
  private async nextNumber(prefix: 'INV' | 'RCT'): Promise<string> {
    const year = new Date().getFullYear();
    const table = prefix === 'INV' ? this.prisma.invoice : this.prisma.receipt;
    const last = await (table as { findFirst: Function }).findFirst({
      where: { number: { startsWith: `${prefix}-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? Number.parseInt(String(last.number).split('-')[2], 10) + 1 : 1;
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }

  private async taxPercent(): Promise<number> {
    return Number(await this.pricing.getSetting('tax_rate_percent', '0'));
  }

  // ─── Creating invoices ───────────────────────────────────────────────────

  /**
   * Create and send an invoice. `issueAt` controls whether it goes out now or
   * is held as a draft until the scheduler releases it.
   */
  async create(params: {
    userId: string;
    kind: InvoiceKind;
    lines: DocumentLine[];
    dueAt: Date;
    listingFeeRunId?: string;
    propertyId?: string;
    notes?: string;
    currency?: string;
    /** Send immediately. Subscriptions pass false and are released by the cron. */
    sendNow?: boolean;
    /**
     * Line amounts already include tax, so back it out instead of adding it.
     * Listing-fee runs store the gross figure they charge, and taxing that
     * again would bill the customer twice for the same VAT.
     */
    linesIncludeTax?: boolean;
  }): Promise<Invoice> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      include: { developerProfile: { select: { companyName: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const taxPercent = await this.taxPercent();
    const lineTotal = params.lines.reduce((n, l) => n + l.amount, 0);

    const subtotal = params.linesIncludeTax
      ? Math.round((lineTotal / (1 + taxPercent / 100)) * 100) / 100
      : lineTotal;
    const taxAmount = Math.round((params.linesIncludeTax ? lineTotal - subtotal : subtotal * (taxPercent / 100)) * 100) / 100;

    const invoice = await this.prisma.invoice.create({
      data: {
        number: await this.nextNumber('INV'),
        kind: params.kind,
        status: params.sendNow ? 'ISSUED' : 'DRAFT',
        userId: user.id,
        listingFeeRunId: params.listingFeeRunId,
        propertyId: params.propertyId,
        billedToName: user.developerProfile?.companyName
          ?? `${user.firstName} ${user.lastName}`.trim(),
        billedToEmail: user.email,
        lineItems: params.lines as unknown as object,
        subtotal,
        taxPercent,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        currency: params.currency ?? await this.pricing.platformCurrency(),
        dueAt: params.dueAt,
        issuedAt: params.sendNow ? new Date() : null,
        notes: params.notes,
      },
    });

    if (params.sendNow) await this.deliver(invoice.id);
    return invoice;
  }

  /**
   * Invoice a production order as soon as it is placed — the work is scheduled
   * against it, so the developer needs the bill immediately rather than at
   * month end.
   */
  async invoiceProduction(params: {
    userId: string;
    propertyId: string;
    propertyName: string;
    lines: DocumentLine[];
    currency?: string;
  }): Promise<Invoice> {
    return this.create({
      userId: params.userId,
      kind: 'PRODUCTION',
      propertyId: params.propertyId,
      lines: params.lines,
      currency: params.currency,
      dueAt: new Date(Date.now() + day(PRODUCTION_TERMS_DAYS)),
      notes: `Production for ${params.propertyName}`,
      sendNow: true,
    });
  }

  /**
   * Raise the invoice for a monthly listing-fee run, dated so it lands
   * SUBSCRIPTION_LEAD_DAYS before the charge. Returns null if one already
   * exists — the billing run can be re-run safely.
   */
  async invoiceListingFeeRun(runId: string): Promise<Invoice | null> {
    const run = await this.prisma.listingFeeRun.findUnique({
      where: { id: runId },
      include: {
        invoice: true,
        developer: { include: { user: { select: { id: true } } } },
      },
    });
    if (!run || run.invoice) return null;

    const [y, m] = run.period.split('-').map(Number);
    const periodLabel = new Date(y, m - 1, 1)
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // Charged on the 1st of the following month; the invoice precedes it.
    const chargeDate = new Date(y, m, 1);

    return this.create({
      userId: run.developer.user.id,
      kind: 'SUBSCRIPTION',
      listingFeeRunId: run.id,
      lines: [{
        description: `Listing fee — ${periodLabel}`,
        quantity: run.listingCount,
        unitAmount: run.listingCount > 0
          ? Math.round((run.amount / run.listingCount) * 100) / 100
          : 0,
        amount: run.amount,
      }],
      currency: run.currency,
      dueAt: chargeDate,
      sendNow: false,
      linesIncludeTax: true,
    });
  }

  // ─── Sending ─────────────────────────────────────────────────────────────

  /** Email the invoice and raise the in-app notification. */
  async deliver(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const isSubscription = invoice.kind === 'SUBSCRIPTION';
    const intro = isSubscription
      ? `Your listing fee for the coming period is due on ${fmtDate(invoice.dueAt)}. `
        + 'It will be charged automatically to your default payment method.'
      : `Payment for your production order is due by ${fmtDate(invoice.dueAt)}.`;

    await this.mail.sendDocument(
      invoice.billedToEmail,
      `Invoice ${invoice.number} from e-resi`,
      {
        heading: 'Invoice',
        number: invoice.number,
        billedToName: invoice.billedToName,
        billedToEmail: invoice.billedToEmail,
        lines: invoice.lineItems as unknown as DocumentLine[],
        subtotal: invoice.subtotal,
        taxPercent: invoice.taxPercent,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        currency: invoice.currency,
        meta: [
          { label: 'Issued', value: fmtDate(invoice.issuedAt ?? new Date()) },
          { label: 'Due', value: fmtDate(invoice.dueAt) },
        ],
        intro,
        cta: { label: 'View invoice', url: `${this.appUrl}/dashboard/billing` },
        footnote: isSubscription
          ? 'No action is needed if your card is up to date. Listing fees stop as soon as a development is taken down.'
          : 'Production is scheduled once payment is received.',
      },
    );

    await this.notifications.createNotification(
      invoice.userId,
      'INVOICE_ISSUED',
      `Invoice ${invoice.number}`,
      `${invoice.currency} ${invoice.total.toLocaleString()} is due on ${fmtDate(invoice.dueAt)}.`,
      invoice.id,
      'Invoice',
    );

    if (invoice.status === 'DRAFT') {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'ISSUED', issuedAt: new Date() },
      });
    }
  }

  /**
   * Chase an unpaid invoice, warning that access ends in
   * TERMINATION_NOTICE_DAYS. Admin-triggered — the decision to threaten
   * suspension belongs to a person, not a schedule.
   */
  async sendReminder(invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') {
      throw new BadRequestException(`${invoice.number} is already paid`);
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException(`${invoice.number} was cancelled`);
    }
    // Chasing a bill the customer was never sent — and threatening to suspend
    // them over it — is worse than not chasing at all.
    if (invoice.status === 'DRAFT') {
      throw new BadRequestException(
        `${invoice.number} has not been issued yet, so there is nothing to chase.`,
      );
    }

    const terminatesAt = new Date(Date.now() + day(TERMINATION_NOTICE_DAYS));
    const overdue = invoice.dueAt < new Date();
    const isSubscription = invoice.kind === 'SUBSCRIPTION';

    const warning = isSubscription
      ? `If payment is not received by ${fmtDate(terminatesAt)}, your developments will be `
        + 'taken offline and your account suspended.'
      : `If payment is not received by ${fmtDate(terminatesAt)}, this production order will be `
        + 'cancelled and any scheduled shoot released.';

    await this.mail.sendDocument(
      invoice.billedToEmail,
      `Reminder: invoice ${invoice.number} is ${overdue ? 'overdue' : 'due'}`,
      {
        heading: 'Payment reminder',
        number: invoice.number,
        numberLabel: 'Invoice',
        billedToName: invoice.billedToName,
        billedToEmail: invoice.billedToEmail,
        lines: invoice.lineItems as unknown as DocumentLine[],
        subtotal: invoice.subtotal,
        taxPercent: invoice.taxPercent,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        currency: invoice.currency,
        meta: [
          { label: 'Due', value: fmtDate(invoice.dueAt) },
          { label: 'Status', value: overdue ? 'Overdue' : 'Due' },
        ],
        callout: { tone: 'danger', text: warning },
        intro: overdue
          ? `This invoice was due on ${fmtDate(invoice.dueAt)} and remains unpaid.`
          : `This invoice falls due on ${fmtDate(invoice.dueAt)}.`,
        cta: { label: 'Pay now', url: `${this.appUrl}/dashboard/billing` },
        footnote: 'If you have already paid, please ignore this message.',
      },
    );

    await this.notifications.createNotification(
      invoice.userId,
      'INVOICE_REMINDER',
      `Invoice ${invoice.number} is ${overdue ? 'overdue' : 'due soon'}`,
      `${invoice.currency} ${invoice.total.toLocaleString()} — ${warning}`,
      invoice.id,
      'Invoice',
    );

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        terminatesAt,
        remindersSent: { increment: 1 },
        lastReminderAt: new Date(),
        ...(overdue && invoice.status === 'ISSUED' && { status: 'OVERDUE' as const }),
      },
    });
  }

  // ─── Settlement ──────────────────────────────────────────────────────────

  /**
   * Mark an invoice paid and issue its receipt. Idempotent: a second call
   * returns the existing receipt rather than allocating another number.
   */
  async markPaid(params: {
    invoiceId: string;
    method: string;
    reference?: string;
    paymentId?: string;
    paidAt?: Date;
  }) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: params.invoiceId },
      include: { receipt: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.receipt) return invoice.receipt;

    const paidAt = params.paidAt ?? new Date();

    const [, receipt] = await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt, paymentId: params.paymentId, terminatesAt: null },
      }),
      this.prisma.receipt.create({
        data: {
          number: await this.nextNumber('RCT'),
          invoiceId: invoice.id,
          userId: invoice.userId,
          amount: invoice.total,
          currency: invoice.currency,
          method: params.method,
          reference: params.reference,
          paidAt,
        },
      }),
    ]);

    await this.mail.sendDocument(
      invoice.billedToEmail,
      `Receipt ${receipt.number} from e-resi`,
      {
        heading: 'Receipt',
        number: receipt.number,
        billedToName: invoice.billedToName,
        billedToEmail: invoice.billedToEmail,
        lines: invoice.lineItems as unknown as DocumentLine[],
        subtotal: invoice.subtotal,
        taxPercent: invoice.taxPercent,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        currency: invoice.currency,
        meta: [
          { label: 'Paid', value: fmtDate(paidAt) },
          { label: 'Method', value: params.method },
          { label: 'Invoice', value: invoice.number },
        ],
        callout: { tone: 'info', text: 'Paid in full — thank you.' },
        intro: 'This is your receipt. No further action is needed.',
        footnote: 'Keep this for your records.',
      },
    );

    await this.notifications.createNotification(
      invoice.userId,
      'RECEIPT_ISSUED',
      `Receipt ${receipt.number}`,
      `Payment of ${invoice.currency} ${invoice.total.toLocaleString()} received. Thank you.`,
      receipt.id,
      'Receipt',
    );

    return receipt;
  }

  // ─── Paying an invoice ───────────────────────────────────────────────────

  /**
   * Begin payment for an unpaid invoice on Paystack's hosted checkout.
   *
   * Card details never reach this API. The reference embeds the invoice id so
   * the webhook can settle it without trusting anything the browser sends back.
   */
  async startPayment(invoiceId: string, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { receipt: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.userId !== userId) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID' || invoice.receipt) {
      throw new BadRequestException(`${invoice.number} is already paid`);
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException(`${invoice.number} was cancelled`);
    }
    if (invoice.status === 'DRAFT') {
      throw new BadRequestException(`${invoice.number} has not been issued yet`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.paystack.startPayment({
      email: user.email,
      amountMinor: Math.round(invoice.total * 100),
      currency: invoice.currency,
      reference: `inv_${invoice.id}_${Date.now()}`,
      callbackPath: '/dashboard/billing',
      metadata: { userId, invoiceId: invoice.id, purpose: 'invoice_payment' },
    });
  }

  /**
   * Settle an invoice from a confirmed Paystack transaction. Called by the
   * webhook, and by the browser return leg — both are idempotent because
   * markPaid returns the existing receipt rather than issuing a second one.
   */
  async settleFromPaystack(invoiceId: string, reference: string, userId?: string) {
    const result = await this.paystack.verifyTransaction(reference);
    if (!result.successful) {
      throw new BadRequestException('That payment has not completed');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // The webhook passes no userId; the browser leg does, and must not be able
    // to settle somebody else's invoice.
    if (userId && invoice.userId !== userId) throw new NotFoundException('Invoice not found');

    // Record the money before the receipt, so a payment is never invisible.
    const existing = await this.prisma.payment.findFirst({ where: { reference } });
    const payment = existing ?? await this.prisma.payment.create({
      data: {
        userId: invoice.userId,
        amount: result.amount / 100,
        currency: result.currency,
        method: 'PAYSTACK_CARD',
        status: 'COMPLETED',
        reference,
        metadata: { purpose: 'invoice_payment', invoiceId },
      },
    });

    return this.markPaid({
      invoiceId,
      method: 'Card',
      reference,
      paymentId: payment.id,
    });
  }

  // ─── Scheduled work ──────────────────────────────────────────────────────

  /**
   * Release subscription invoices SUBSCRIPTION_LEAD_DAYS before they fall due,
   * and flag anything past its due date as overdue.
   */
  @Cron(CronExpression.EVERY_DAY_AT_7AM, { name: 'invoice-dispatch', timeZone: 'Africa/Nairobi' })
  async dispatchDue(): Promise<{ issued: number; markedOverdue: number }> {
    const horizon = new Date(Date.now() + day(SUBSCRIPTION_LEAD_DAYS));

    const pending = await this.prisma.invoice.findMany({
      where: { status: 'DRAFT', dueAt: { lte: horizon } },
      select: { id: true },
      take: 500,
    });
    for (const { id } of pending) {
      try {
        await this.deliver(id);
      } catch (err) {
        // One bad address must not stop the rest of the run.
        this.logger.error(`Could not deliver invoice ${id}: ${(err as Error).message}`);
      }
    }

    const { count } = await this.prisma.invoice.updateMany({
      where: { status: 'ISSUED', dueAt: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });

    if (pending.length || count) {
      this.logger.log(`Invoices: ${pending.length} issued, ${count} marked overdue`);
    }
    return { issued: pending.length, markedOverdue: count };
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  async listMine(userId: string) {
    return this.prisma.invoice.findMany({
      where: { userId, status: { not: 'DRAFT' } },
      include: { receipt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listAll(filters: { status?: string; kind?: string; q?: string } = {}) {
    return this.prisma.invoice.findMany({
      where: {
        ...(filters.status && { status: filters.status as never }),
        ...(filters.kind && { kind: filters.kind as never }),
        ...(filters.q && {
          OR: [
            { number: { contains: filters.q, mode: 'insensitive' as const } },
            { billedToName: { contains: filters.q, mode: 'insensitive' as const } },
            { billedToEmail: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }),
      },
      include: { receipt: true, user: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getOne(id: string, userId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { receipt: true, property: { select: { name: true, slug: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // A developer may only read their own; admins pass no userId.
    if (userId && invoice.userId !== userId) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
