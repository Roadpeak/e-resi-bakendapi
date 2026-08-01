import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import type { LinkCardDto, LinkMpesaDto } from './dto/link-method.dto.js';

/** Flat monthly fee per live development (USD). */
export const LISTING_FEE_MONTHLY = 49;

function detectBrand(cardNumber: string): string {
  if (/^4/.test(cardNumber)) return 'Visa';
  if (/^5[1-5]/.test(cardNumber) || /^2[2-7]/.test(cardNumber)) return 'Mastercard';
  if (/^3[47]/.test(cardNumber)) return 'Amex';
  if (/^6/.test(cardNumber)) return 'Discover';
  return 'Card';
}

function luhnValid(cardNumber: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let d = Number(cardNumber[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProvidersService,
  ) {}

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
          status: true, reference: true, metadata: true, createdAt: true,
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

  private async makeDefaultIfFirst(userId: string): Promise<boolean> {
    const count = await this.prisma.linkedPaymentMethod.count({ where: { userId } });
    if (count === 0) return true;
    return false;
  }

  /**
   * Link a card: verify with a $1 authorization (reversed automatically),
   * then store display metadata + billing address. PAN/CVC are discarded.
   */
  async linkCard(userId: string, dto: LinkCardDto) {
    if (!luhnValid(dto.cardNumber)) {
      throw new BadRequestException('That card number is not valid');
    }
    const now = new Date();
    if (dto.expYear < now.getFullYear()
      || (dto.expYear === now.getFullYear() && dto.expMonth < now.getMonth() + 1)) {
      throw new BadRequestException('This card has expired');
    }

    const last4 = dto.cardNumber.slice(-4);
    const brand = detectBrand(dto.cardNumber);

    const duplicate = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, type: 'CARD', last4, brand, expMonth: dto.expMonth, expYear: dto.expYear },
    });
    if (duplicate) throw new BadRequestException('This card is already linked');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // $1 verification hold with the processor (or simulated in sandbox)
    const result = await this.providers.verifyCard(dto, user.email);

    const isDefault = await this.makeDefaultIfFirst(userId);
    const method = await this.prisma.linkedPaymentMethod.create({
      data: {
        userId,
        type: 'CARD',
        brand,
        last4,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        cardholderName: dto.cardholderName,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country.toUpperCase(),
        processorRef: result.processorRef,
        verification: result.verified ? 'VERIFIED' : 'PENDING',
        verifiedAt: result.verified ? new Date() : null,
        isDefault,
      },
    });

    // audit trail: the $1 verification + its reversal
    await this.prisma.payment.create({
      data: {
        userId,
        amount: 1,
        currency: 'USD',
        method: 'STRIPE_CARD',
        status: 'REFUNDED',
        reference: `CARD-VERIFY-${last4}-${Date.now()}`,
        metadata: {
          purpose: 'card_verification',
          reversed: true,
          sandbox: result.sandbox,
          methodId: method.id,
        },
      },
    });

    return { ...method, sandbox: result.sandbox };
  }

  /** Start PayPal linking — returns the approval URL for the redirect. */
  async paypalStart() {
    return this.providers.paypalStart();
  }

  /** Confirm the approved PayPal agreement → vault it for monthly billing. */
  async paypalConfirm(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const result = await this.providers.paypalConfirm(token, user.email);

    const duplicate = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, type: 'PAYPAL', paypalAgreementId: result.agreementId },
    });
    if (duplicate) return duplicate;

    const isDefault = await this.makeDefaultIfFirst(userId);
    const method = await this.prisma.linkedPaymentMethod.create({
      data: {
        userId,
        type: 'PAYPAL',
        paypalEmail: result.payerEmail,
        paypalAgreementId: result.agreementId,
        processorRef: result.agreementId,
        verification: 'VERIFIED',
        verifiedAt: new Date(),
        isDefault,
      },
    });
    return { ...method, sandbox: result.sandbox };
  }

  /** Link M-Pesa — sends a KES 1 STK verification prompt (reversed). */
  async linkMpesa(userId: string, dto: LinkMpesaDto) {
    const duplicate = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, type: 'MPESA', mpesaPhone: dto.phone },
    });
    if (duplicate) throw new BadRequestException('This M-Pesa number is already linked');

    const result = await this.providers.mpesaVerify(dto.phone);

    const isDefault = await this.makeDefaultIfFirst(userId);
    const method = await this.prisma.linkedPaymentMethod.create({
      data: {
        userId,
        type: 'MPESA',
        mpesaPhone: dto.phone,
        processorRef: result.checkoutRequestId,
        verification: result.verified ? 'VERIFIED' : 'PENDING',
        verifiedAt: result.verified ? new Date() : null,
        isDefault,
      },
    });

    await this.prisma.payment.create({
      data: {
        userId,
        amount: 1,
        currency: 'KES',
        method: 'MPESA',
        status: result.verified ? 'REFUNDED' : 'PENDING',
        reference: `MPESA-VERIFY-${dto.phone.slice(-4)}-${Date.now()}`,
        metadata: {
          purpose: 'mpesa_verification',
          reversed: result.verified,
          sandbox: result.sandbox,
          methodId: method.id,
          checkoutRequestId: result.checkoutRequestId,
        },
      },
    });

    return { ...method, sandbox: result.sandbox };
  }

  /** Daraja STK callback — marks the pending M-Pesa method verified. */
  async mpesaCallback(body: unknown) {
    const stk = (body as {
      Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number } };
    })?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) return { message: 'ignored' };

    const method = await this.prisma.linkedPaymentMethod.findFirst({
      where: { processorRef: stk.CheckoutRequestID, type: 'MPESA' },
    });
    if (!method) return { message: 'no matching method' };

    const succeeded = stk.ResultCode === 0;
    await this.prisma.linkedPaymentMethod.update({
      where: { id: method.id },
      data: {
        verification: succeeded ? 'VERIFIED' : 'FAILED',
        verifiedAt: succeeded ? new Date() : null,
      },
    });
    await this.prisma.payment.updateMany({
      where: { userId: method.userId, metadata: { path: ['checkoutRequestId'], equals: stk.CheckoutRequestID } },
      data: { status: succeeded ? 'REFUNDED' : 'FAILED' },
    });
    return { message: 'processed' };
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
