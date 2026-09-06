import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommissionStatus, DealStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto, paginateMeta } from '../common/dto/pagination.dto.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';

/**
 * The deal pipeline — attribution turned into money.
 *
 * The partnership layer records that an agent and developer work together,
 * and the ?ref= chain records who introduced a lead. Neither says what
 * happened next, and "what happened next" is the agent's entire livelihood:
 * did the client reserve, did the sale complete, and above all was the
 * commission paid. That trail currently lives in WhatsApp threads and memory,
 * which is exactly where commission disputes come from.
 *
 * Two design decisions run through everything here:
 *
 * Stage and commission are separate state machines, because money lags
 * paperwork. An SPA gets signed with the commission unpaid for months, and
 * making that gap visible — with timestamps, to both sides — is the feature.
 *
 * Every change appends a DealEvent. Commission arguments are memory
 * arguments; an append-only history both sides read is what turns "you said
 * 3% on WhatsApp in March" into a record.
 */

/** What both sides see on a deal row. */
const DEAL_INCLUDE = {
  property: {
    select: { id: true, slug: true, name: true, heroImageUrl: true, city: true },
  },
  unit: { select: { id: true, name: true, price: true, currency: true } },
  agent: {
    select: { id: true, displayName: true, photoUrl: true, logoUrl: true, userId: true },
  },
  developer: { select: { id: true, companyName: true, logoUrl: true, userId: true } },
} as const;

/**
 * Stages a deal is allowed to leave.
 *
 * COMPLETED is terminal once its commission is PAID — reopening a settled
 * deal would un-count a closing that ranking and payment history already
 * rest on. LOST is reopenable: deals fall through and come back, and
 * forcing a duplicate row for the same client would split the history.
 */
const SETTLED = (stage: DealStage, commission: CommissionStatus) =>
  stage === DealStage.COMPLETED && commission === CommissionStatus.PAID;

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  /** Same actor resolution as partnerships — both sides share the endpoints. */
  private async resolveActor(userId: string) {
    const [developer, agent] = await Promise.all([
      this.prisma.developerProfile.findUnique({
        where: { userId },
        select: { id: true, companyName: true },
      }),
      this.prisma.agentProfile.findUnique({
        where: { userId },
        select: { id: true, displayName: true },
      }),
    ]);
    if (!developer && !agent) {
      throw new ForbiddenException('Only developers and agents have deals');
    }
    return { developerId: developer?.id, agentId: agent?.id, developer, agent };
  }

  /** A deal the caller is party to, or 404 — never another pair's. */
  private async assertMine(dealId: string, userId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: DEAL_INCLUDE,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    const mine = deal.agent.userId === userId || deal.developer.userId === userId;
    if (!mine) throw new NotFoundException('Deal not found');
    return deal;
  }

  private async logEvent(dealId: string, actorId: string, kind: string, summary: string) {
    await this.prisma.dealEvent.create({ data: { dealId, actorId, kind, summary } });
  }

  /** Tell the other side of the deal something changed. */
  private async notifyCounterparty(
    deal: { agent: { userId: string }; developer: { userId: string }; id: string; property: { name: string } },
    actorUserId: string,
    summary: string,
  ) {
    const otherUserId =
      deal.agent.userId === actorUserId ? deal.developer.userId : deal.agent.userId;
    await this.events.dealUpdated(otherUserId, deal.property.name, summary, deal.id);
  }

  // ─── Creating ─────────────────────────────────────────────────────────────

  /**
   * Open a deal on a partnership.
   *
   * Either side may log one — an agent registers a client they are working,
   * a developer records a walk-in an agent sent over. The commission percent
   * defaults down the chain the partnership already defines: the property's
   * assignment first, the partnership default second, because a flagship
   * unit's terms were deliberately set apart when the assignment overrode.
   */
  async create(
    userId: string,
    dto: {
      partnershipId: string;
      propertyId: string;
      unitId?: string;
      clientName: string;
      clientEmail?: string;
      clientPhone?: string;
      notes?: string;
      inquiryId?: string;
      bookingId?: string;
      reservationId?: string;
    },
  ) {
    const partnership = await this.prisma.agentPartnership.findUnique({
      where: { id: dto.partnershipId },
      include: {
        agent: { select: { id: true, userId: true, displayName: true } },
        developer: { select: { id: true, userId: true, companyName: true } },
        assignments: {
          where: { propertyId: dto.propertyId, isActive: true },
          select: { commissionPercent: true },
        },
      },
    });
    if (!partnership) throw new NotFoundException('Partnership not found');
    const mine =
      partnership.agent.userId === userId || partnership.developer.userId === userId;
    if (!mine) throw new NotFoundException('Partnership not found');
    if (partnership.status !== 'ACTIVE') {
      throw new BadRequestException('Deals can only be opened on an active partnership');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, name: true, developerId: true },
    });
    if (!property || property.developerId !== partnership.developerId) {
      // The property has to be the developer's own — a deal on someone
      // else's development is a data-entry mistake, not a relationship.
      throw new BadRequestException("Property does not belong to this partnership's developer");
    }

    if (dto.unitId) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: dto.unitId },
        select: { propertyId: true },
      });
      if (!unit || unit.propertyId !== dto.propertyId) {
        throw new BadRequestException('Unit does not belong to that property');
      }
    }

    const commissionPercent =
      partnership.assignments[0]?.commissionPercent ??
      partnership.commissionPercent ??
      null;

    const deal = await this.prisma.deal.create({
      data: {
        partnershipId: partnership.id,
        agentId: partnership.agentId,
        developerId: partnership.developerId,
        propertyId: dto.propertyId,
        unitId: dto.unitId,
        clientName: dto.clientName.trim(),
        clientEmail: dto.clientEmail?.trim() || null,
        clientPhone: dto.clientPhone?.trim() || null,
        notes: dto.notes,
        commissionPercent,
        inquiryId: dto.inquiryId,
        bookingId: dto.bookingId,
        reservationId: dto.reservationId,
      },
      include: DEAL_INCLUDE,
    });

    await this.logEvent(deal.id, userId, 'CREATED', `Deal opened for ${deal.clientName}`);
    await this.notifyCounterparty(deal, userId, `New deal opened for ${deal.clientName}`);
    return deal;
  }

  // ─── Reading ──────────────────────────────────────────────────────────────

  async listMine(
    userId: string,
    pagination: PaginationDto,
    filters: { stage?: DealStage; commissionStatus?: CommissionStatus } = {},
  ) {
    const actor = await this.resolveActor(userId);
    const where = {
      ...(actor.developerId ? { developerId: actor.developerId } : { agentId: actor.agentId }),
      ...(filters.stage && { stage: filters.stage }),
      ...(filters.commissionStatus && { commissionStatus: filters.commissionStatus }),
    };

    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        // Live pipeline first, then most recently moved — a stale deal
        // surfacing high is a prompt, not a bug.
        orderBy: [{ stage: 'asc' }, { stageChangedAt: 'desc' }],
        include: DEAL_INCLUDE,
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data, meta: paginateMeta(total, pagination.page ?? 1, pagination.limit ?? 20) };
  }

  async getOne(dealId: string, userId: string) {
    await this.assertMine(dealId, userId);
    return this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        ...DEAL_INCLUDE,
        events: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  /**
   * The numbers each dashboard leads with.
   *
   * One query set, both perspectives: an agent reads "what am I owed", a
   * developer reads "what do I owe" — same rows, opposite emotions.
   */
  async summary(userId: string) {
    const actor = await this.resolveActor(userId);
    const own = actor.developerId
      ? { developerId: actor.developerId }
      : { agentId: actor.agentId };

    const [byStage, commissions, open] = await Promise.all([
      this.prisma.deal.groupBy({ by: ['stage'], where: own, _count: true }),
      this.prisma.deal.groupBy({
        by: ['commissionStatus'],
        where: own,
        _count: true,
        _sum: { commissionAmount: true },
      }),
      this.prisma.deal.count({
        where: { ...own, stage: { notIn: [DealStage.COMPLETED, DealStage.LOST] } },
      }),
    ]);

    const stageCounts = Object.fromEntries(byStage.map((r) => [r.stage, r._count]));
    const commissionTotals = Object.fromEntries(
      commissions.map((r) => [
        r.commissionStatus,
        { count: r._count, amount: r._sum.commissionAmount ?? 0 },
      ]),
    );
    return { openDeals: open, stageCounts, commissionTotals };
  }

  // ─── Stage ────────────────────────────────────────────────────────────────

  /**
   * Move a deal along the pipeline.
   *
   * Deliberately not a rigid state machine. Either side can move a deal in
   * either direction — real deals go backwards, and a two-party correction
   * beats an admin ticket — except out of a settled closing, which ranking
   * and payment history already rest on. The audit trail, not the
   * transition table, is what keeps this honest.
   */
  async updateStage(dealId: string, userId: string, stage: DealStage, lostReason?: string) {
    const deal = await this.assertMine(dealId, userId);
    if (SETTLED(deal.stage, deal.commissionStatus)) {
      throw new BadRequestException('A completed deal with a paid commission cannot be reopened');
    }
    if (stage === deal.stage) return deal;

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        stage,
        stageChangedAt: new Date(),
        lostReason: stage === DealStage.LOST ? (lostReason ?? deal.lostReason) : null,
      },
      include: DEAL_INCLUDE,
    });

    await this.logEvent(
      dealId,
      userId,
      'STAGE_CHANGED',
      `${deal.stage} → ${stage}${stage === DealStage.LOST && lostReason ? ` (${lostReason})` : ''}`,
    );
    await this.notifyCounterparty(updated, userId, `Deal for ${deal.clientName} moved to ${stage}`);

    // Completions feed the directory ranking, so the cached track record
    // updates the moment the stage does — in both directions.
    if (stage === DealStage.COMPLETED || deal.stage === DealStage.COMPLETED) {
      await this.recomputeAgentStats(deal.agent.id);
    }
    return updated;
  }

  // ─── Commission ───────────────────────────────────────────────────────────

  /**
   * Set the money. Developer-only: the sale value is their price sheet, and
   * an agent writing their own commission is the dispute this table exists
   * to prevent.
   *
   * Frozen once DUE or PAID — from that point the number is a debt, and
   * debts do not get quietly re-derived.
   */
  async setCommission(
    dealId: string,
    userId: string,
    dto: { saleValue?: number; commissionPercent?: number },
  ) {
    const deal = await this.assertMine(dealId, userId);
    if (deal.developer.userId !== userId) {
      throw new ForbiddenException('Only the developer sets the sale value and commission');
    }
    if (
      deal.commissionStatus === CommissionStatus.DUE ||
      deal.commissionStatus === CommissionStatus.PAID ||
      deal.commissionStatus === CommissionStatus.DISPUTED
    ) {
      // DISPUTED is in this list for the sharpest reason of the three: a
      // dispute is the agent contesting a number, and letting the developer
      // quietly rewrite that number mid-dispute — resetting it to ACCRUED
      // and then paying the smaller figure — is the exact move the ledger
      // exists to make impossible. Caught by the smoke test doing it.
      throw new BadRequestException(
        'This commission is already payable or under dispute — it can no longer be edited',
      );
    }

    const saleValue = dto.saleValue ?? deal.saleValue;
    const percent = dto.commissionPercent ?? deal.commissionPercent;
    const amount =
      saleValue != null && percent != null
        ? Math.round(saleValue * (percent / 100) * 100) / 100
        : null;

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        saleValue,
        commissionPercent: percent,
        commissionAmount: amount,
        commissionStatus:
          amount != null ? CommissionStatus.ACCRUED : deal.commissionStatus,
      },
      include: DEAL_INCLUDE,
    });

    await this.logEvent(
      dealId,
      userId,
      'COMMISSION_SET',
      amount != null
        ? `Commission set: ${percent}% of ${saleValue} = ${amount} ${deal.currency}`
        : `Commission inputs updated (incomplete)`,
    );
    await this.notifyCounterparty(updated, userId, `Commission updated on ${deal.clientName}'s deal`);
    return updated;
  }

  /**
   * Move the commission through its own lifecycle.
   *
   * Who may do what is the whole design:
   *  - the developer marks DUE and PAID — they hold the money;
   *  - the agent raises DISPUTED — they are the one not holding it;
   *  - the agent may also withdraw a dispute back to DUE.
   * Neither side can move the other's markers, so the ledger records an
   * agreement rather than one party's version of it.
   */
  async updateCommissionStatus(
    dealId: string,
    userId: string,
    status: CommissionStatus,
    reason?: string,
  ) {
    const deal = await this.assertMine(dealId, userId);
    const isDeveloper = deal.developer.userId === userId;
    const from = deal.commissionStatus;

    const allowed: Record<string, boolean> = {
      // Developer: accrued → due, and anything unpaid or disputed → paid.
      [`DEV:${CommissionStatus.ACCRUED}>${CommissionStatus.DUE}`]: true,
      [`DEV:${CommissionStatus.ACCRUED}>${CommissionStatus.PAID}`]: true,
      [`DEV:${CommissionStatus.DUE}>${CommissionStatus.PAID}`]: true,
      [`DEV:${CommissionStatus.DISPUTED}>${CommissionStatus.PAID}`]: true,
      [`DEV:${CommissionStatus.DISPUTED}>${CommissionStatus.DUE}`]: true,
      // Agent: anything with money attached → disputed; withdraw → due.
      [`AGT:${CommissionStatus.ACCRUED}>${CommissionStatus.DISPUTED}`]: true,
      [`AGT:${CommissionStatus.DUE}>${CommissionStatus.DISPUTED}`]: true,
      [`AGT:${CommissionStatus.PAID}>${CommissionStatus.DISPUTED}`]: true,
      [`AGT:${CommissionStatus.DISPUTED}>${CommissionStatus.DUE}`]: true,
    };
    const key = `${isDeveloper ? 'DEV' : 'AGT'}:${from}>${status}`;
    if (!allowed[key]) {
      throw new BadRequestException(`Cannot move commission from ${from} to ${status}`);
    }
    if (status === CommissionStatus.DISPUTED && !reason?.trim()) {
      throw new BadRequestException('A dispute needs a reason the other side can answer');
    }

    const updated = await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        commissionStatus: status,
        commissionDueAt:
          status === CommissionStatus.DUE && !deal.commissionDueAt ? new Date() : undefined,
        commissionPaidAt: status === CommissionStatus.PAID ? new Date() : undefined,
        disputeReason: status === CommissionStatus.DISPUTED ? reason!.trim() : null,
      },
      include: DEAL_INCLUDE,
    });

    const kindMap: Partial<Record<CommissionStatus, string>> = {
      [CommissionStatus.DUE]: 'COMMISSION_DUE',
      [CommissionStatus.PAID]: 'COMMISSION_PAID',
      [CommissionStatus.DISPUTED]: 'COMMISSION_DISPUTED',
    };
    await this.logEvent(
      dealId,
      userId,
      kindMap[status] ?? 'COMMISSION_STATUS',
      `Commission ${from} → ${status}${reason ? `: ${reason}` : ''}`,
    );
    await this.notifyCounterparty(
      updated,
      userId,
      status === CommissionStatus.PAID
        ? `Commission on ${deal.clientName}'s deal marked paid`
        : status === CommissionStatus.DISPUTED
          ? `Commission on ${deal.clientName}'s deal disputed`
          : `Commission on ${deal.clientName}'s deal is now ${status.toLowerCase()}`,
    );
    return updated;
  }

  /** A dated note on the record, visible to both sides. */
  async addNote(dealId: string, userId: string, note: string) {
    await this.assertMine(dealId, userId);
    await this.logEvent(dealId, userId, 'NOTE', note.trim());
    return this.getOne(dealId, userId);
  }

  // ─── Ranking cache ────────────────────────────────────────────────────────

  /**
   * Refresh the agent's cached track record from source of truth.
   *
   * Recomputed rather than incremented: an increment drifts the first time
   * a completion is reverted or a deal deleted, and the aggregate is one
   * cheap query over one agent's rows.
   */
  private async recomputeAgentStats(agentId: string) {
    const agg = await this.prisma.deal.aggregate({
      where: { agentId, stage: DealStage.COMPLETED },
      _count: true,
      _sum: { saleValue: true },
    });
    await this.prisma.agentProfile.update({
      where: { id: agentId },
      data: {
        dealsCompleted: agg._count,
        closedVolume: agg._sum.saleValue ?? 0,
      },
    });
  }
}
