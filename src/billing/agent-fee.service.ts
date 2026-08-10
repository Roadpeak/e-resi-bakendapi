import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentKind, KybStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { PaystackService } from './paystack.service.js';
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
    private readonly events: PlatformEventsService,
  ) {}

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
