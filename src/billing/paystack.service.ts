import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveAppUrl } from '../common/app-url.js';

const BASE = 'https://api.paystack.co';

export interface PaystackAuthorization {
  authorization_code: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  card_type: string;
  bank?: string;
  brand?: string;
  reusable: boolean;
  country_code?: string;
}

/**
 * Paystack integration.
 *
 * Card details are never posted to this API. The client is sent to Paystack's
 * hosted checkout, the customer enters their card there, and we receive back a
 * reusable authorization code. That keeps card data entirely out of our systems
 * — the difference between PCI SAQ A and the far heavier SAQ D.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = config.get<string>('PAYSTACK_SECRET_KEY', '');
    this.frontendUrl = resolveAppUrl(config);
  }

  get configured(): boolean {
    return Boolean(this.secretKey);
  }

  /** True while running against test keys — surfaced so the UI can say so. */
  get testMode(): boolean {
    return this.secretKey.startsWith('sk_test_');
  }

  private async call<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const json = (await res.json().catch(() => null)) as
      | { status: boolean; message: string; data: T }
      | null;

    if (!res.ok || !json?.status) {
      const message = json?.message ?? `Paystack request failed (${res.status})`;
      this.logger.error(`${path} → ${message}`);
      throw new BadRequestException(message);
    }
    return json.data;
  }

  /**
   * Begin card linking. Paystack has no zero-amount authorization, so we charge
   * the smallest unit the currency allows and refund it immediately on
   * verification — the card is proven live without keeping the customer's money.
   */
  async startCardLink(
    email: string,
    userId: string,
    currency = 'KES',
  ): Promise<{ authorizationUrl: string; reference: string; testMode: boolean }> {
    const reference = `link_${userId}_${Date.now()}`;

    if (!this.configured) {
      this.logger.warn('[SANDBOX] Paystack not configured — simulating card link');
      return {
        authorizationUrl: `${this.frontendUrl}/dashboard/billing?paystack=simulated&reference=${reference}`,
        reference,
        testMode: true,
      };
    }

    const data = await this.call<{ authorization_url: string; reference: string }>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: {
          email,
          // Minor units: 100 KES. Refunded as soon as the card is verified.
          amount: 10000,
          currency,
          reference,
          callback_url: `${this.frontendUrl}/dashboard/billing?paystack=callback`,
          channels: ['card'],
          metadata: { userId, purpose: 'card_link' },
        },
      },
    );

    return {
      authorizationUrl: data.authorization_url,
      reference: data.reference,
      testMode: this.testMode,
    };
  }

  /**
   * Hosted checkout for a specific amount — used to pay an invoice.
   *
   * Unlike startCardLink this is a real charge that is meant to settle, so
   * channels stay open (card and M-Pesa) rather than card-only, and nothing
   * is refunded afterwards.
   */
  async startPayment(params: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackPath: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; reference: string; testMode: boolean }> {
    if (!this.configured) {
      this.logger.warn('[SANDBOX] Paystack not configured — simulating payment');
      return {
        authorizationUrl: `${this.frontendUrl}${params.callbackPath}?paystack=simulated&reference=${params.reference}`,
        reference: params.reference,
        testMode: true,
      };
    }

    const data = await this.call<{ authorization_url: string; reference: string }>(
      '/transaction/initialize',
      {
        method: 'POST',
        body: {
          email: params.email,
          amount: params.amountMinor,
          currency: params.currency,
          reference: params.reference,
          callback_url: `${this.frontendUrl}${params.callbackPath}?paystack=invoice`,
          // Card-only, matching card-linking, so invoice payment cannot pay
          // through a channel we can't also use to charge stored cards later.
          channels: ['card'],
          metadata: params.metadata,
        },
      },
    );

    return {
      authorizationUrl: data.authorization_url,
      reference: data.reference,
      testMode: this.testMode,
    };
  }

  /** Confirm the transaction and hand back the reusable authorization. */
  async verifyTransaction(reference: string): Promise<{
    successful: boolean;
    authorization: PaystackAuthorization | null;
    amount: number;
    currency: string;
    customerCode?: string;
  }> {
    if (!this.configured) {
      return {
        successful: true,
        authorization: {
          authorization_code: `sim_auth_${Date.now()}`,
          last4: '4081',
          exp_month: '12',
          exp_year: String(new Date().getFullYear() + 2),
          card_type: 'visa',
          brand: 'visa',
          reusable: true,
        },
        amount: 10000,
        currency: 'KES',
      };
    }

    const data = await this.call<{
      status: string;
      amount: number;
      currency: string;
      authorization: PaystackAuthorization;
      customer: { customer_code: string };
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    return {
      successful: data.status === 'success',
      authorization: data.authorization ?? null,
      amount: data.amount,
      currency: data.currency,
      customerCode: data.customer?.customer_code,
    };
  }

  /** Give back the verification charge. Never let it settle. */
  async refund(reference: string): Promise<void> {
    if (!this.configured) return;
    try {
      await this.call('/refund', { method: 'POST', body: { transaction: reference } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already refunded is the desired end state, not a failure — it happens
      // whenever a confirmation is retried.
      if (/refund already exist/i.test(message)) {
        this.logger.log(`Verification charge ${reference} was already refunded`);
        return;
      }
      // Otherwise the link still succeeded; an unrefunded charge is an
      // operations problem, not a reason to reject the customer's card.
      this.logger.error(`Failed to refund verification charge ${reference}: ${message}`);
    }
  }

  /** Charge a stored authorization — used for monthly listing fees. */
  async chargeAuthorization(params: {
    email: string;
    authorizationCode: string;
    amountMinor: number;
    currency?: string;
    reference?: string;
  }): Promise<{ successful: boolean; reference: string }> {
    if (!this.configured) {
      this.logger.warn('[SANDBOX] Paystack not configured — simulating charge');
      return { successful: true, reference: `sim_charge_${Date.now()}` };
    }

    const data = await this.call<{ status: string; reference: string }>(
      '/transaction/charge_authorization',
      {
        method: 'POST',
        body: {
          email: params.email,
          authorization_code: params.authorizationCode,
          amount: params.amountMinor,
          currency: params.currency ?? 'KES',
          ...(params.reference && { reference: params.reference }),
        },
      },
    );

    return { successful: data.status === 'success', reference: data.reference };
  }

  /**
   * Validate a webhook came from Paystack. Compared in constant time so the
   * comparison itself can't leak the expected signature.
   */
  verifyWebhook(rawBody: Buffer | string, signature: string): boolean {
    if (!this.configured || !signature) return false;
    const expected = createHmac('sha512', this.secretKey)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
