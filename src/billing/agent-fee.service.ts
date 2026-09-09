import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentKind, KybStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { PaystackService } from './paystack.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { InvoicesService } from './invoices.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';

export interface AgentFeeRunSummary {
  period: string;
  agentsConsidered: number;
  charged: number;
  failed: number;
  skipped: number;
  alreadyDone: number;
  totalCollected: number;
  currency: string;
}

/**
 * Monthly listing fee for agents.
 *
 * Deliberately parallel to ListingFeeService rather than folded into it: an
 * agent pays a flat rate that differs by kind, a developer pays per live
 * development. The shapes only look alike until you try to share them.
 *
 * Non-payment hides the profile rather than closing the account, and only
 * after a grace period — a single failed card should not silently remove a
 * paying agent from the directory.
 */
@Injectable()
export class AgentFeeService {
  private readonly logger = new Logger(AgentFeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly paystack: PaystackService,
    private readonly providers: PaymentProvidersService,
    private readonly invoices: InvoicesService,
    private readonly events: PlatformEventsService,
  ) {}

  /** "2026-09" → "September 2026" for receipt lines. */
  private periodLabel(period: string) {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  /** Receipt for a settled fee run — email with PDF attached, never throws. */
  private async receiptForRun(
    runId: string,
    userId: string,
    method: string,
    reference?: string,
    paymentId?: string,
  ) {
    try {
      const run = await this.prisma.agentFeeRun.findUnique({
        where: { id: runId },
        select: { period: true, amount: true, currency: true, invoice: { select: { id: true } } },
      });
      if (!run) return;
      // Settling the run's invoice marks it PAID and issues the linked
      // receipt; a run billed before invoices existed still gets a
      // standalone one.
      if (run.invoice) {
        await this.invoices.markPaid({
          invoiceId: run.invoice.id,
          method,
          reference,
          paymentId,
        });
        return;
      }
      await this.invoices.issueStandaloneReceipt({
        userId,
        amount: run.amount,
        currency: run.currency,
        method,
        reference,
        description: `Agent listing fee — ${this.periodLabel(run.period)}`,
      });
    } catch (err) {
      // A receipt that fails to issue must never unwind a recorded payment.
      this.logger.error(`Receipt for run ${runId} failed: ${(err as Error).message}`);
    }
  }

  private assertPeriod(period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('Period must be YYYY-MM');
    }
  }

  /** Bill on the 1st, an hour after the developer sweep to spread gateway load. */
  @Cron('0 4 1 * *', { name: 'agent-fees', timeZone: 'Africa/Nairobi' })
  async monthlySweep() {
    const period = new Date().toISOString().slice(0, 7);
    try {
      await this.runForPeriod(period);
    } catch (err) {
      this.logger.error(`Agent fee sweep failed: ${(err as Error).message}`);
    }
  }

  /**
   * Daily: retry failures still inside their grace window, then hide anyone
   * whose window has closed. Retrying first means an agent whose card starts
   * working again is never delisted on the same pass.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM, { name: 'agent-fee-grace', timeZone: 'Africa/Nairobi' })
  async dailyGraceSweep() {
    try {
      await this.retryFailed();
      await this.enforceGracePeriod();
    } catch (err) {
      this.logger.error(`Agent grace sweep failed: ${(err as Error).message}`);
    }
  }

  /** Retry failed runs that are still within grace. */
  async retryFailed(): Promise<{ recovered: number }> {
    const failed = await this.prisma.agentFeeRun.findMany({
      where: {
        status: 'FAILED',
        OR: [{ graceEndsAt: null }, { graceEndsAt: { gte: new Date() } }],
        // Repeated declines usually mean a dead card, not a transient fault;
        // hammering the gateway will not change that.
        attempts: { lt: 5 },
      },
      include: {
        agent: {
          select: { displayName: true, user: { select: { id: true, email: true } } },
        },
      },
    });

    let recovered = 0;
    for (const run of failed) {
      const ok = await this.chargeRun(
        run.id,
        run.agent.user.id,
        run.agent.user.email,
        run.amount,
        run.currency,
        run.agent.displayName,
      );
      if (ok) recovered++;
    }
    if (failed.length) {
      this.logger.log(`Agent fee retries: ${recovered}/${failed.length} recovered`);
    }
    return { recovered };
  }

  /** Fee configuration, as set by admins in platform settings. */
  private async feeConfig() {
    const [company, individual, currency, freeMonths, graceDays, tax] = await Promise.all([
      this.pricing.getSetting('agent_fee_monthly_company', '99'),
      this.pricing.getSetting('agent_fee_monthly_individual', '29'),
      this.pricing.platformCurrency(),
      this.pricing.getSetting('agent_fee_free_months', '1'),
      this.pricing.getSetting('agent_fee_grace_days', '7'),
      this.pricing.getSetting('tax_rate_percent', '0'),
    ]);
    return {
      company: Number(company),
      individual: Number(individual),
      currency,
      freeMonths: Number(freeMonths),
      graceDays: Number(graceDays),
      taxPercent: Number(tax),
    };
  }

  /** Whether this period still falls inside the agent's free window. */
  private withinFreeWindow(joined: Date, period: string, freeMonths: number): boolean {
    if (freeMonths <= 0) return false;
    const [y, m] = period.split('-').map(Number);
    const periodStart = new Date(y, m - 1, 1);
    const freeUntil = new Date(
      joined.getFullYear(), joined.getMonth() + freeMonths, 1,
    );
    return periodStart < freeUntil;
  }

  private async upsertRun(
    agentId: string,
    period: string,
    amount: number,
    currency: string,
    status: 'PENDING' | 'PAID' | 'FAILED' | 'SKIPPED',
    graceEndsAt?: Date | null,
  ) {
    return this.prisma.agentFeeRun.upsert({
      where: { agentId_period: { agentId, period } },
      create: { agentId, period, amount, currency, status, graceEndsAt },
      update: { amount, currency, status, ...(graceEndsAt !== undefined && { graceEndsAt }) },
    });
  }

  /**
   * Bill every listable agent for a period. Safe to call repeatedly — a run
   * already PAID or SKIPPED is left alone.
   */
  async runForPeriod(period: string): Promise<AgentFeeRunSummary> {
    this.assertPeriod(period);
    const cfg = await this.feeConfig();
    const summary: AgentFeeRunSummary = {
      period,
      agentsConsidered: 0,
      charged: 0,
      failed: 0,
      skipped: 0,
      alreadyDone: 0,
      totalCollected: 0,
      currency: cfg.currency,
    };

    // Only verified agents can be listed, so only they can owe anything. An
    // agent still awaiting review is not yet receiving the service.
    const agents = await this.prisma.agentProfile.findMany({
      where: { kybStatus: KybStatus.APPROVED },
      include: { user: { select: { id: true, email: true } } },
    });
    summary.agentsConsidered = agents.length;

    for (const agent of agents) {
      const existing = await this.prisma.agentFeeRun.findUnique({
        where: { agentId_period: { agentId: agent.id, period } },
      });
      if (existing?.status === 'PAID' || existing?.status === 'SKIPPED') {
        summary.alreadyDone++;
        continue;
      }

      const net = agent.kind === AgentKind.COMPANY ? cfg.company : cfg.individual;
      const amount = Math.round(net * (1 + cfg.taxPercent / 100) * 100) / 100;

      // First month free by default. Recorded as SKIPPED so the period reads
      // as settled rather than perpetually pending.
      if (amount <= 0 || this.withinFreeWindow(agent.createdAt, period, cfg.freeMonths)) {
        await this.upsertRun(agent.id, period, 0, cfg.currency, 'SKIPPED', null);
        summary.skipped++;
        continue;
      }

      const graceEndsAt = new Date(Date.now() + cfg.graceDays * 86_400_000);
      const run = await this.upsertRun(
        agent.id, period, amount, cfg.currency, 'PENDING', graceEndsAt,
      );

      // The invoice precedes the charge — the agent hears what they owe
      // before the card is touched, and the receipt settles this invoice.
      await this.invoices.invoiceAgentFeeRun(run.id).catch((err) => {
        this.logger.error(`Could not invoice agent run ${run.id}: ${(err as Error).message}`);
      });

      const ok = await this.chargeRun(
        run.id, agent.user.id, agent.user.email, amount, cfg.currency, agent.displayName,
      );
      if (ok) {
        summary.charged++;
        summary.totalCollected += amount;
      } else {
        summary.failed++;
      }
    }

    this.logger.log(
      `Agent fees ${period}: ${summary.charged} charged, ${summary.failed} failed, `
      + `${summary.skipped} skipped, ${summary.alreadyDone} already done`,
    );
    return summary;
  }

  /** Charge one run against the agent's saved card. */
  private async chargeRun(
    runId: string,
    userId: string,
    email: string,
    amount: number,
    currency: string,
    displayName: string,
  ): Promise<boolean> {
    const card = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, type: 'CARD', verification: 'VERIFIED', processorRef: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    if (!card?.processorRef) {
      await this.markFailed(runId, userId, 'No verified card on file', displayName);
      return false;
    }

    try {
      const reference = `agentfee_${runId}_${Date.now()}`;
      const result = await this.paystack.chargeAuthorization({
        email,
        authorizationCode: card.processorRef,
        amountMinor: Math.round(amount * 100),
        currency,
        reference,
      });

      if (!result.successful) {
        await this.markFailed(runId, userId, 'The card was declined', displayName);
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
          metadata: { purpose: 'agent_listing_fee', runId },
        },
      });

      await this.prisma.agentFeeRun.update({
        where: { id: runId },
        data: {
          status: 'PAID',
          reference: result.reference,
          paymentId: payment.id,
          chargedAt: new Date(),
          failureText: null,
          graceEndsAt: null,
          attempts: { increment: 1 },
        },
      });

      // Paying clears any earlier suspension straight away, rather than
      // waiting for the next sweep to notice.
      const run = await this.prisma.agentFeeRun.findUnique({
        where: { id: runId },
        select: { agentId: true },
      });
      if (run) {
        await this.prisma.agentProfile.update({
          where: { id: run.agentId },
          data: { isListed: true, suspendedAt: null },
        });
      }

      await this.receiptForRun(runId, userId, 'Card', result.reference, payment.id);

      return true;
    } catch (err) {
      await this.markFailed(runId, userId, (err as Error).message, displayName);
      return false;
    }
  }

  private async markFailed(runId: string, userId: string, reason: string, displayName: string) {
    await this.prisma.agentFeeRun.update({
      where: { id: runId },
      data: { status: 'FAILED', failureText: reason, attempts: { increment: 1 } },
    });
    this.logger.warn(`Agent fee ${runId} failed: ${reason}`);

    const run = await this.prisma.agentFeeRun.findUnique({
      where: { id: runId },
      select: { graceEndsAt: true, amount: true, currency: true },
    });
    try {
      await this.events.agentFeeFailed(
        userId,
        displayName,
        reason,
        run?.graceEndsAt ?? null,
        run?.amount ?? 0,
        run?.currency ?? 'KES',
      );
    } catch (err) {
      this.logger.error(`Agent fee notify failed: ${(err as Error).message}`);
    }
  }

  /**
   * Hide agents whose grace period has run out.
   *
   * Separate from the charge sweep on purpose: an agent who fails today keeps
   * their listing for the grace window and only disappears if it is still
   * unpaid when that expires. Their account and data are untouched, so paying
   * restores them.
   */
  async enforceGracePeriod(): Promise<{ delisted: number }> {
    const overdue = await this.prisma.agentFeeRun.findMany({
      where: {
        status: 'FAILED',
        graceEndsAt: { lt: new Date() },
        agent: { isListed: true },
      },
      include: { agent: { select: { id: true, displayName: true, userId: true } } },
    });

    let delisted = 0;
    for (const run of overdue) {
      await this.prisma.agentProfile.update({
        where: { id: run.agent.id },
        data: { isListed: false, suspendedAt: new Date() },
      });
      delisted++;
      try {
        await this.events.agentDelisted(run.agent.userId, run.agent.displayName);
      } catch (err) {
        this.logger.error(`Delist notify failed: ${(err as Error).message}`);
      }
    }

    if (delisted > 0) this.logger.warn(`Delisted ${delisted} agent(s) for non-payment`);
    return { delisted };
  }

  /**
   * Self-serve retry of a failed card charge — the "my card works now"
   * button. Uses the same chargeRun as the sweeps, so success restores the
   * listing and failure updates the reason the agent sees.
   */
  async retryMyFee(userId: string, period: string) {
    this.assertPeriod(period);
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true, user: { select: { email: true } } },
    });
    if (!agent) throw new BadRequestException('Agent profile required');

    const run = await this.prisma.agentFeeRun.findFirst({
      where: { agentId: agent.id, period, status: { in: ['PENDING', 'FAILED'] } },
    });
    if (!run) {
      throw new BadRequestException(
        `No unpaid listing fee for ${period} — it may already be settled.`,
      );
    }

    await this.invoices.invoiceAgentFeeRun(run.id).catch(() => undefined);

    const ok = await this.chargeRun(
      run.id,
      userId,
      agent.user.email,
      run.amount,
      run.currency,
      agent.displayName,
    );
    if (!ok) {
      const fresh = await this.prisma.agentFeeRun.findUnique({
        where: { id: run.id },
        select: { failureText: true },
      });
      throw new BadRequestException(
        fresh?.failureText ?? 'The charge failed — check your card and try again.',
      );
    }
    return { paid: true, period, amount: run.amount, currency: run.currency };
  }

  /** Mark one run paid and restore the agent's listing immediately. */
  private async markRunPaid(runId: string, paymentId: string, reference?: string) {
    const run = await this.prisma.agentFeeRun.update({
      where: { id: runId },
      data: {
        status: 'PAID',
        paymentId,
        ...(reference && { reference }),
        chargedAt: new Date(),
        failureText: null,
        graceEndsAt: null,
      },
      select: { agentId: true },
    });
    // Paying clears any earlier suspension straight away, rather than
    // waiting for the next sweep to notice.
    await this.prisma.agentProfile.update({
      where: { id: run.agentId },
      data: { isListed: true, suspendedAt: null },
    });
  }

  /**
   * Self-serve M-Pesa STK push for one of the agent's own fee runs.
   *
   * The card sweep is how fees are normally collected, but a Kenyan agent
   * without a card — or with a failed run eating into their grace period —
   * needs a way to pay right now from their phone. Fees are already KES, so
   * no conversion is involved.
   */
  async payFeeMpesa(userId: string, period: string, phone: string) {
    this.assertPeriod(period);
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true },
    });
    if (!agent) throw new BadRequestException('Agent profile required');

    const run = await this.prisma.agentFeeRun.findFirst({
      where: { agentId: agent.id, period, status: { in: ['PENDING', 'FAILED'] } },
    });
    if (!run) {
      throw new BadRequestException(
        `No unpaid listing fee for ${period} — it may already be settled.`,
      );
    }

    // A run created before invoicing existed gets its invoice on first
    // payment attempt, so the receipt always has an invoice to settle.
    await this.invoices.invoiceAgentFeeRun(run.id).catch(() => undefined);

    const { checkoutRequestId, completed, sandbox } = await this.providers.mpesaStkPush(
      phone,
      Math.ceil(run.amount),
      `e-resi listing fee ${period}`,
    );

    // Recorded before the callback can arrive: Daraja only echoes the
    // checkoutRequestId back, so the Payment row is the correlation.
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: run.amount,
        currency: run.currency,
        method: 'MPESA',
        status: completed ? 'COMPLETED' : 'PENDING',
        reference: `MPESA-AGENTFEE-${period}-${Date.now()}`,
        ...(sandbox && { mpesaCode: `SIM${Date.now()}` }),
        metadata: { checkoutRequestId, agentFeeRunId: run.id, purpose: 'agent_listing_fee' },
      },
    });

    // Sandbox resolves instantly — there is no callback coming.
    if (completed) {
      await this.markRunPaid(run.id, payment.id, payment.reference ?? undefined);
      await this.receiptForRun(run.id, userId, 'M-Pesa', payment.mpesaCode ?? undefined, payment.id);
    }

    return {
      paymentId: payment.id,
      status: completed ? 'COMPLETED' : 'PENDING',
      amountKes: run.amount,
      period,
      checkoutRequestId,
      sandbox,
    };
  }

  /**
   * Settle an agent-fee STK push from the Daraja callback. Returns whether
   * the checkoutRequestId belonged to this flow, so the shared callback can
   * try the next one.
   */
  async settleFromMpesa(checkoutRequestId: string, succeeded: boolean, mpesaCode?: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        method: 'MPESA',
        metadata: { path: ['checkoutRequestId'], equals: checkoutRequestId },
      },
    });
    const runId = (payment?.metadata as { agentFeeRunId?: string } | null)?.agentFeeRunId;
    if (!payment || !runId) return { settled: false };

    if (!succeeded) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      return { settled: true };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'COMPLETED', ...(mpesaCode && { mpesaCode }) },
    });
    await this.markRunPaid(runId, payment.id, mpesaCode);
    await this.receiptForRun(runId, payment.userId, 'M-Pesa', mpesaCode, payment.id);
    return { settled: true };
  }

  /** Admin: what a period's agent-fee collection looks like, run by run. */
  async periodReport(period: string) {
    this.assertPeriod(period);
    const runs = await this.prisma.agentFeeRun.findMany({
      where: { period },
      include: {
        agent: { select: { id: true, displayName: true, kind: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!runs.length) throw new NotFoundException(`No agent billing run for ${period}`);

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

  /** An agent's own billing history. */
  async historyForAgent(userId: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true, kind: true, isListed: true, suspendedAt: true, createdAt: true },
    });
    if (!agent) return { runs: [], nextCharge: null, agent: null };

    const [runs, cfg] = await Promise.all([
      this.prisma.agentFeeRun.findMany({
        where: { agentId: agent.id },
        orderBy: { period: 'desc' },
        take: 24,
        include: { invoice: { select: { number: true } } },
      }),
      this.feeConfig(),
    ]);

    const monthly = agent.kind === AgentKind.COMPANY ? cfg.company : cfg.individual;
    const withTax = Math.round(monthly * (1 + cfg.taxPercent / 100) * 100) / 100;

    return {
      agent,
      runs,
      nextCharge: {
        amount: withTax,
        currency: cfg.currency,
        // Surfaced so a new agent can see the free month rather than being
        // surprised by the first charge.
        freeMonths: cfg.freeMonths,
        inFreeWindow: this.withinFreeWindow(
          agent.createdAt,
          new Date().toISOString().slice(0, 7),
          cfg.freeMonths,
        ),
      },
    };
  }
}
