import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { PaystackService } from './paystack.service.js';
import type { LinkCardDto, PayMpesaDto } from './dto/link-method.dto.js';

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
    private readonly paystack: PaystackService,
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
  /**
   * Start card linking via Paystack's hosted checkout. The customer enters
   * their card on Paystack's page, not ours, so no card data reaches this API.
   */
  async startPaystackCardLink(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.paystack.startCardLink(user.email, userId);
  }

  /**
   * Finish linking once the customer returns. Verifies the transaction, stores
   * the reusable authorization, and refunds the verification charge.
   */
  async confirmPaystackCardLink(userId: string, reference: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Confirmation can arrive more than once — a double-click, the browser back
    // button, or a retried webhook. Anything past this point must be safe to
    // repeat, so bail out early if this reference was already processed.
    const alreadyProcessed = await this.prisma.payment.findFirst({ where: { reference } });
    if (alreadyProcessed) {
      const existing = await this.prisma.linkedPaymentMethod.findFirst({
        where: { userId, type: 'CARD' },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    const result = await this.paystack.verifyTransaction(reference);
    if (!result.successful || !result.authorization) {
      throw new BadRequestException('That card could not be verified');
    }
    const auth = result.authorization;
    if (!auth.reusable) {
      throw new BadRequestException('That card cannot be saved for future payments');
    }

    // The authorization code identifies the card at Paystack. If this user has
    // already linked it, hand that back instead of storing a duplicate.
    const duplicate = await this.prisma.linkedPaymentMethod.findFirst({
      where: { userId, processorRef: auth.authorization_code },
    });
    if (duplicate) {
      await this.paystack.refund(reference);
      return duplicate;
    }

    const isDefault = await this.makeDefaultIfFirst(userId);
    const method = await this.prisma.linkedPaymentMethod.create({
      data: {
        userId,
        type: 'CARD',
        brand: auth.brand ?? auth.card_type,
        last4: auth.last4,
        expMonth: Number.parseInt(auth.exp_month, 10),
        expYear: Number.parseInt(auth.exp_year, 10),
        cardholderName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        country: auth.country_code ?? 'KE',
        processorRef: auth.authorization_code,
        verification: 'VERIFIED',
        verifiedAt: new Date(),
        isDefault,
      },
    });

    // The charge existed only to prove the card is live — give it back.
    await this.paystack.refund(reference);

    await this.prisma.payment.create({
      data: {
        userId,
        amount: result.amount / 100,
        currency: result.currency,
        method: 'STRIPE_CARD',
        status: 'REFUNDED',
        reference,
        metadata: { purpose: 'card_verification', provider: 'paystack' },
      },
    });

    return method;
  }

  /**
   * Handle a verified Paystack webhook.
   *
   * Webhooks are the only reliable signal for recurring charges: nobody is
   * watching the browser when a monthly listing fee fails. Every branch is
   * idempotent because Paystack retries until it gets a 200.
   */
  async handlePaystackEvent(event: { event: string; data: Record<string, unknown> }) {
    const data = event.data ?? {};
    const reference = typeof data.reference === 'string' ? data.reference : null;
    if (!reference) return { handled: false };

    switch (event.event) {
      case 'charge.success': {
        const existing = await this.prisma.payment.findFirst({ where: { reference } });
        if (existing) return { handled: true, duplicate: true };

        const metadata = (data.metadata ?? {}) as { userId?: string; purpose?: string };
        if (!metadata.userId) return { handled: false };

        await this.prisma.payment.create({
          data: {
            userId: metadata.userId,
            amount: Number(data.amount ?? 0) / 100,
            currency: String(data.currency ?? 'KES'),
            method: 'STRIPE_CARD',
            status: 'COMPLETED',
            reference,
            metadata: { provider: 'paystack', purpose: metadata.purpose ?? 'charge' },
          },
        });
        return { handled: true };
      }

      case 'charge.failed': {
        const metadata = (data.metadata ?? {}) as { userId?: string };
        if (!metadata.userId) return { handled: false };

        const existing = await this.prisma.payment.findFirst({ where: { reference } });
        if (existing) {
          await this.prisma.payment.update({
            where: { id: existing.id },
            data: { status: 'FAILED' },
          });
        } else {
          await this.prisma.payment.create({
            data: {
              userId: metadata.userId,
              amount: Number(data.amount ?? 0) / 100,
              currency: String(data.currency ?? 'KES'),
              method: 'STRIPE_CARD',
              status: 'FAILED',
              reference,
              metadata: { provider: 'paystack', reason: data.gateway_response ?? null },
            },
          });
        }

        // A failed charge is what an admin needs to see; the billing queue reads
        // FAILED payments, so this surfaces without anyone polling Paystack.
        await this.prisma.notification.create({
          data: {
            userId: metadata.userId,
            type: 'PAYMENT_RECEIVED',
            title: 'A payment failed',
            body: `We could not charge your card${data.gateway_response ? `: ${data.gateway_response}` : ''}. Please update your payment method.`,
          },
        });
        return { handled: true };
      }

      case 'refund.processed':
      case 'refund.pending': {
        const existing = await this.prisma.payment.findFirst({ where: { reference } });
        if (existing && existing.status !== 'REFUNDED') {
          await this.prisma.payment.update({
            where: { id: existing.id },
            data: { status: 'REFUNDED' },
          });
        }
        return { handled: true };
      }

      default:
        // Unhandled events still get a 200 — Paystack retries anything else,
        // and we do not want retries for events we simply do not use.
        return { handled: false };
    }
  }

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

  /**
   * Pay pending bills with M-Pesa — sends an STK push for the amount.
   * M-Pesa is pay-per-invoice, not a stored method: nothing is linked.
   */
  async payWithMpesa(userId: string, dto: PayMpesaDto) {
    // never accept paying more than what is actually owed
    const bill = await this.summary(userId);
    const payable = bill.production.pendingTotal + bill.monthly.total;
    if (payable <= 0) throw new BadRequestException('You have no pending bills to pay');
    if (dto.amountUsd > payable) {
      throw new BadRequestException(`Amount exceeds your pending balance of $${payable}`);
    }

    const rate = Number.parseFloat(
      process.env.USD_KES_RATE ?? '130',
    );
    const amountKes = Math.ceil(dto.amountUsd * (Number.isFinite(rate) && rate > 0 ? rate : 130));
    const description = dto.purpose ?? 'e-resi pending bills';

    const result = await this.providers.mpesaStkPush(dto.phone, amountKes, description);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: amountKes,
        currency: 'KES',
        method: 'MPESA',
        status: result.completed ? 'COMPLETED' : 'PENDING',
        reference: `MPESA-${dto.phone.slice(-4)}-${Date.now()}`,
        mpesaCode: result.sandbox ? `SIM${Date.now()}` : undefined,
        metadata: {
          purpose: 'bill_payment',
          description,
          usdAmount: dto.amountUsd,
          rate,
          sandbox: result.sandbox,
          checkoutRequestId: result.checkoutRequestId,
        },
      },
    });

    return {
      paymentId: payment.id,
      status: payment.status,
      amountKes,
      amountUsd: dto.amountUsd,
      checkoutRequestId: result.checkoutRequestId,
      sandbox: result.sandbox,
    };
  }

  /** Daraja STK callback — settles the pending bill payment. */
  async mpesaCallback(body: unknown) {
    const stk = (body as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          ResultCode?: number;
          CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
        };
      };
    })?.Body?.stkCallback;
    if (!stk?.CheckoutRequestID) return { message: 'ignored' };

    const succeeded = stk.ResultCode === 0;
    const receipt = stk.CallbackMetadata?.Item?.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;

    await this.prisma.payment.updateMany({
      where: { metadata: { path: ['checkoutRequestId'], equals: stk.CheckoutRequestID } },
      data: {
        status: succeeded ? 'COMPLETED' : 'FAILED',
        ...(receipt && { mpesaCode: String(receipt) }),
      },
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
