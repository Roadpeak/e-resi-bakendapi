import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LinkMethodDto } from './dto/link-method.dto.js';

/** Flat monthly fee per live development (USD). */
export const LISTING_FEE_MONTHLY = 49;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Developer billing summary ──────────────────────────────────────────

  async summary(userId: string) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const [properties, payments] = await Promise.all([
      this.prisma.property.findMany({
        where: { developerId: developer.id },
        select: { id: true, name: true, slug: true, status: true, submissionData: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, amount: true, currency: true, method: true,
          status: true, reference: true, createdAt: true,
        },
      }),
    ]);

    const listings = properties.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      monthlyFee: p.status === 'ACTIVE' ? LISTING_FEE_MONTHLY : 0,
    }));

    const production = properties
      .map((p) => {
        const sub = p.submissionData as {
          media?: { services?: Record<string, unknown> };
          servicesOneTimeTotal?: number;
        } | null;
        const serviceIds = Object.keys(sub?.media?.services ?? {});
        return {
          propertyId: p.id,
          name: p.name,
          serviceIds,
          total: sub?.servicesOneTimeTotal ?? 0,
        };
      })
      .filter((o) => o.serviceIds.length > 0);

    return {
      feePerListing: LISTING_FEE_MONTHLY,
      currency: 'USD',
      monthly: {
        liveCount: listings.filter((l) => l.monthlyFee > 0).length,
        total: listings.reduce((n, l) => n + l.monthlyFee, 0),
      },
      listings,
      production: {
        pendingTotal: production.reduce((n, o) => n + o.total, 0),
        orders: production,
      },
      payments,
    };
  }

  // ─── Linked payment methods ─────────────────────────────────────────────

  listMethods(userId: string) {
    return this.prisma.linkedPaymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async linkMethod(userId: string, dto: LinkMethodDto) {
    if (dto.type === 'CARD' && (!dto.brand || !dto.last4 || !dto.expMonth || !dto.expYear)) {
      throw new BadRequestException('Card methods require brand, last4, expMonth and expYear');
    }
    if (dto.type === 'PAYPAL' && !dto.paypalEmail) {
      throw new BadRequestException('PayPal methods require paypalEmail');
    }

    // reject exact duplicates
    const existing = await this.prisma.linkedPaymentMethod.findFirst({
      where: dto.type === 'CARD'
        ? { userId, type: 'CARD', last4: dto.last4, brand: dto.brand, expMonth: dto.expMonth, expYear: dto.expYear }
        : { userId, type: 'PAYPAL', paypalEmail: dto.paypalEmail },
    });
    if (existing) throw new BadRequestException('This payment method is already linked');

    const count = await this.prisma.linkedPaymentMethod.count({ where: { userId } });
    const makeDefault = dto.makeDefault || count === 0;

    if (makeDefault) {
      await this.prisma.linkedPaymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.linkedPaymentMethod.create({
      data: {
        userId,
        type: dto.type,
        brand: dto.brand,
        last4: dto.last4,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        paypalEmail: dto.paypalEmail,
        isDefault: makeDefault,
      },
    });
  }

  async setDefault(userId: string, id: string) {
    const method = await this.prisma.linkedPaymentMethod.findUnique({ where: { id } });
    if (!method || method.userId !== userId) throw new NotFoundException('Payment method not found');

    await this.prisma.$transaction([
      this.prisma.linkedPaymentMethod.updateMany({ where: { userId }, data: { isDefault: false } }),
      this.prisma.linkedPaymentMethod.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { message: 'Default payment method updated' };
  }

  async removeMethod(userId: string, id: string) {
    const method = await this.prisma.linkedPaymentMethod.findUnique({ where: { id } });
    if (!method || method.userId !== userId) throw new NotFoundException('Payment method not found');

    await this.prisma.linkedPaymentMethod.delete({ where: { id } });

    // promote the most recent remaining method to default
    if (method.isDefault) {
      const next = await this.prisma.linkedPaymentMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await this.prisma.linkedPaymentMethod.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return { message: 'Payment method removed' };
  }
}
