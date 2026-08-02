import { Injectable } from '@nestjs/common';
import { KybStatus, PaymentStatus, PropertyStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Headline counters plus the queues that need an admin's attention. */
  async overview() {
    const [
      usersByRole,
      totalProperties,
      liveProperties,
      pendingReview,
      kybPending,
      activeReservations,
      openInquiries,
      failedPayments,
      revenueAgg,
      rentListings,
    ] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.property.count(),
      this.prisma.property.count({ where: { status: PropertyStatus.ACTIVE } }),
      this.prisma.property.count({ where: { status: PropertyStatus.DRAFT } }),
      this.prisma.developerProfile.count({ where: { kybStatus: KybStatus.PENDING } }),
      this.prisma.reservation.count({ where: { expiresAt: { gt: new Date() } } }),
      this.prisma.inquiry.count({ where: { status: 'NEW' } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),
      this.prisma.rentListing.count(),
    ]);

    const roleCounts = Object.fromEntries(
      usersByRole.map((r) => [r.role, r._count._all]),
    ) as Record<UserRole, number>;

    return {
      users: {
        total: Object.values(roleCounts).reduce((a, b) => a + b, 0),
        byRole: roleCounts,
      },
      properties: { total: totalProperties, live: liveProperties, pendingReview },
      rentListings,
      reservations: { active: activeReservations },
      revenue: { collected: revenueAgg._sum.amount ?? 0 },
      queues: { kybPending, pendingReview, failedPayments, openInquiries },
    };
  }

  /**
   * Daily revenue and signups over the window. Buckets are keyed in local time
   * to match how they're built — toISOString() would shift them by the UTC
   * offset and drop same-day records.
   */
  async trends(days = 30) {
    const clamped = Math.max(1, Math.min(days, 365));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (clamped - 1));

    const [payments, signups] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.COMPLETED, createdAt: { gte: since } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, role: true },
      }),
    ]);

    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const daily: { date: string; revenue: number; signups: number }[] = [];
    for (let i = 0; i < clamped; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      daily.push({ date: key(d), revenue: 0, signups: 0 });
    }
    const byDate = new Map(daily.map((row) => [row.date, row]));

    for (const p of payments) {
      const row = byDate.get(key(p.createdAt));
      if (row) row.revenue += p.amount;
    }
    for (const u of signups) {
      const row = byDate.get(key(u.createdAt));
      if (row) row.signups += 1;
    }

    return { daily };
  }

  /** Items an admin needs to act on, newest first. */
  async attention() {
    const [kyb, properties, payments] = await Promise.all([
      this.prisma.developerProfile.findMany({
        where: { kybStatus: KybStatus.PENDING },
        take: 5,
        orderBy: { onboardingSubmittedAt: 'desc' },
        select: { id: true, companyName: true, onboardingSubmittedAt: true },
      }),
      this.prisma.property.findMany({
        where: { status: PropertyStatus.DRAFT },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          name: true,
          createdAt: true,
          developer: { select: { companyName: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { status: PaymentStatus.FAILED },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, amount: true, currency: true, createdAt: true },
      }),
    ]);

    return { kybPending: kyb, propertiesAwaitingReview: properties, failedPayments: payments };
  }
}
