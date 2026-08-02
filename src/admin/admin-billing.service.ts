import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaymentStatus,
  ProductionOrderStatus,
  PropertyStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PricingService } from './pricing.service.js';

@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Platform revenue. Recurring revenue is derived from live listings times the
   * admin-managed listing fee, since there is no subscription record per
   * property — the fee is charged for each ACTIVE listing.
   */
  async summary() {
    const [collected, pending, failed, refunded, liveProperties, feeRaw, currencyRaw] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: { status: PaymentStatus.COMPLETED },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.payment.aggregate({
          where: { status: PaymentStatus.PENDING },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
        this.prisma.payment.aggregate({
          where: { status: PaymentStatus.REFUNDED },
          _sum: { amount: true },
        }),
        this.prisma.property.count({ where: { status: PropertyStatus.ACTIVE } }),
        this.pricing.getSetting('listing_fee_monthly', '49'),
        this.pricing.platformCurrency(),
      ]);

    const fee = Number(feeRaw) || 0;

    return {
      collected: collected._sum.amount ?? 0,
      collectedCount: collected._count._all,
      pending: pending._sum.amount ?? 0,
      pendingCount: pending._count._all,
      failedCount: failed,
      refunded: refunded._sum.amount ?? 0,
      recurring: {
        liveProperties,
        feePerProperty: fee,
        currency: currencyRaw,
        monthly: liveProperties * fee,
      },
    };
  }

  async payments(
    pagination: PaginationDto,
    filters: { status?: PaymentStatus; userId?: string } = {},
  ) {
    const where = {
      ...(filters.status && { status: filters.status }),
      ...(filters.userId && { userId: filters.userId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page ?? 1,
        limit: pagination.limit ?? 20,
        totalPages: Math.ceil(total / (pagination.limit ?? 20)),
      },
    };
  }

  /** Mark a payment refunded. The money movement itself happens at the PSP. */
  async refund(id: string) {
    const before = await this.prisma.payment.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Payment not found');
    const after = await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.REFUNDED },
    });
    return { before, after };
  }

  /** Re-queue a failed payment for another attempt. */
  async retry(id: string) {
    const before = await this.prisma.payment.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Payment not found');
    const after = await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.PENDING },
    });
    return { before, after };
  }

  // ─── Production orders ────────────────────────────────────────────────────

  async productionOrders(status?: ProductionOrderStatus) {
    return this.prisma.productionTier.findMany({
      where: status ? { orderStatus: status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          select: {
            slug: true,
            name: true,
            heroImageUrl: true,
            developer: { select: { companyName: true } },
          },
        },
      },
    });
  }

  async updateOrder(
    id: string,
    data: { orderStatus?: ProductionOrderStatus; scheduledAt?: string; crewNotes?: string },
  ) {
    const before = await this.prisma.productionTier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Production order not found');

    const after = await this.prisma.productionTier.update({
      where: { id },
      data: {
        ...(data.orderStatus && { orderStatus: data.orderStatus }),
        ...(data.scheduledAt !== undefined && {
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        }),
        ...(data.crewNotes !== undefined && { crewNotes: data.crewNotes }),
        // Stamp delivery when the order reaches DELIVERED, so "when was this
        // finished" is answerable without reading the audit log.
        ...(data.orderStatus === ProductionOrderStatus.DELIVERED && { deliveredAt: new Date() }),
      },
      include: { property: { select: { name: true } } },
    });
    return { before, after };
  }
}
