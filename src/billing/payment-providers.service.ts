import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { LinkCardDto } from './dto/link-method.dto.js';

/**
 * Thin integration layer over the three processors.
 *
 * Each provider runs LIVE when its credentials are configured, and in an
 * explicit SANDBOX simulation when they are not — so the whole linking UX
 * (including the $1 card verification + reversal) works end-to-end in
 * development and switches to real processing by filling in .env.
 */
@Injectable()
export class PaymentProvidersService {
  private readonly logger = new Logger(PaymentProvidersService.name);
  private readonly stripe: Stripe | null;
  private readonly paypalConfigured: boolean;
  private readonly mpesaConfigured: boolean;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const stripeKey = config.get<string>('STRIPE_SECRET_KEY', '');
    this.stripe = stripeKey ? new Stripe(stripeKey) : null;
    this.paypalConfigured = Boolean(
      config.get('PAYPAL_CLIENT_ID') && config.get('PAYPAL_CLIENT_SECRET'),
    );
    this.mpesaConfigured = Boolean(
      config.get('MPESA_CONSUMER_KEY') && config.get('MPESA_CONSUMER_SECRET')
      && config.get('MPESA_SHORTCODE') && config.get('MPESA_PASSKEY'),
    );
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3001');
  }

  get sandbox() {
    return {
      stripe: !this.stripe,
      paypal: !this.paypalConfigured,
      mpesa: !this.mpesaConfigured,
    };
  }

  // ─── Cards (Stripe): tokenize, $1 verification hold, reverse ─────────────

  /**
   * Verifies the card with a $1 authorization that is immediately released.
   * Returns processor references; the PAN/CVC are used transiently and never
   * stored. In sandbox mode the verification is simulated.
   */
  async verifyCard(dto: LinkCardDto, userEmail: string): Promise<{
    processorRef: string;
    verified: boolean;
    sandbox: boolean;
  }> {
    if (!this.stripe) {
      this.logger.warn('[SANDBOX] Stripe not configured — simulating $1 card verification + reversal');
      return { processorRef: `sim_pm_${Date.now()}`, verified: true, sandbox: true };
    }

    try {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        name: dto.cardholderName,
        address: {
          line1: dto.addressLine1,
          line2: dto.addressLine2 ?? undefined,
          city: dto.city,
          postal_code: dto.postalCode,
          country: dto.country,
        },
      });

      const paymentMethod = await this.stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: dto.cardNumber,
          exp_month: dto.expMonth,
          exp_year: dto.expYear,
          cvc: dto.cvc,
        },
        billing_details: {
          name: dto.cardholderName,
          email: userEmail,
          address: {
            line1: dto.addressLine1,
            line2: dto.addressLine2 ?? undefined,
            city: dto.city,
            postal_code: dto.postalCode,
            country: dto.country,
          },
        },
      });
      await this.stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });

      // $1 verification hold — manual capture so nothing settles, then release
      const intent = await this.stripe.paymentIntents.create({
        amount: 100,
        currency: 'usd',
        customer: customer.id,
        payment_method: paymentMethod.id,
        capture_method: 'manual',
        confirm: true,
        description: 'e-resi card verification (reversed automatically)',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      });
      if (intent.status !== 'requires_capture' && intent.status !== 'succeeded') {
        throw new BadRequestException('Card verification failed — the $1 authorization was declined');
      }
      await this.stripe.paymentIntents.cancel(intent.id).catch(async () => {
        // already captured → refund instead
        await this.stripe!.refunds.create({ payment_intent: intent.id });
      });

      return { processorRef: `${customer.id}:${paymentMethod.id}`, verified: true, sandbox: false };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('Stripe card verification failed', err as Error);
      throw new BadRequestException(
        (err as { message?: string }).message ?? 'Card verification failed',
      );
    }
  }

  // ─── PayPal billing agreements (recurring monthly billing) ───────────────

  private async paypalToken(): Promise<string> {
    const base = this.config.get('PAYPAL_MODE') === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
    const auth = Buffer.from(
      `${this.config.get('PAYPAL_CLIENT_ID')}:${this.config.get('PAYPAL_CLIENT_SECRET')}`,
    ).toString('base64');
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new BadRequestException('PayPal authentication failed');
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  private paypalBase(): string {
    return this.config.get('PAYPAL_MODE') === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /** Start the agreement flow — returns the PayPal approval URL to redirect to. */
  async paypalStart(): Promise<{ approvalUrl: string; token: string; sandbox: boolean }> {
    const returnUrl = `${this.frontendUrl}/dashboard/billing?paypal=confirm`;
    if (!this.paypalConfigured) {
      const token = `SIM-BA-${Date.now()}`;
      this.logger.warn('[SANDBOX] PayPal not configured — simulating approval redirect');
      return { approvalUrl: `${returnUrl}&token=${token}&sandbox=1`, token, sandbox: true };
    }

    const accessToken = await this.paypalToken();
    const res = await fetch(`${this.paypalBase()}/v1/billing-agreements/agreement-tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'e-resi automatic monthly listing billing',
        payer: { payment_method: 'PAYPAL' },
        plan: {
          type: 'MERCHANT_INITIATED_BILLING',
          merchant_preferences: {
            return_url: returnUrl,
            cancel_url: `${this.frontendUrl}/dashboard/billing?paypal=cancelled`,
          },
        },
      }),
    });
    if (!res.ok) {
      this.logger.error(`PayPal agreement token failed: ${await res.text()}`);
      throw new BadRequestException('Could not start PayPal linking');
    }
    const json = (await res.json()) as { token_id: string; links: { rel: string; href: string }[] };
    const approval = json.links.find((l) => l.rel === 'approval_url')?.href;
    if (!approval) throw new BadRequestException('PayPal did not return an approval link');
    return { approvalUrl: approval, token: json.token_id, sandbox: false };
  }

  /** Execute the approved agreement token → billing agreement id + payer email. */
  async paypalConfirm(token: string, fallbackEmail: string): Promise<{
    agreementId: string;
    payerEmail: string;
    sandbox: boolean;
  }> {
    if (!this.paypalConfigured || token.startsWith('SIM-')) {
      this.logger.warn('[SANDBOX] PayPal not configured — simulating agreement execution');
      return { agreementId: token, payerEmail: fallbackEmail, sandbox: true };
    }

    const accessToken = await this.paypalToken();
    const res = await fetch(`${this.paypalBase()}/v1/billing-agreements/agreements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_id: token }),
    });
    if (!res.ok) {
      this.logger.error(`PayPal agreement execution failed: ${await res.text()}`);
      throw new BadRequestException('PayPal approval could not be confirmed');
    }
    const json = (await res.json()) as { id: string; payer?: { payer_info?: { email?: string } } };
    return {
      agreementId: json.id,
      payerEmail: json.payer?.payer_info?.email ?? fallbackEmail,
      sandbox: false,
    };
  }

  // ─── M-Pesa (Daraja STK push verification) ────────────────────────────────

  async mpesaStkPush(phone: string, amountKes: number, description: string): Promise<{
    checkoutRequestId: string;
    completed: boolean;
    sandbox: boolean;
  }> {
    if (!this.mpesaConfigured) {
      this.logger.warn('[SANDBOX] Daraja not configured — simulating M-Pesa STK payment');
      return { checkoutRequestId: `sim_stk_${Date.now()}`, completed: true, sandbox: true };
    }

    const key = this.config.get('MPESA_CONSUMER_KEY');
    const secret = this.config.get('MPESA_CONSUMER_SECRET');
    const shortcode = this.config.get('MPESA_SHORTCODE');
    const passkey = this.config.get('MPESA_PASSKEY');

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const tokenRes = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!tokenRes.ok) throw new BadRequestException('M-Pesa authentication failed');
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const stkRes = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.max(1, Math.round(amountKes)),
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: `${this.config.get('API_PUBLIC_URL', 'http://localhost:4000')}/api/billing/mpesa/callback`,
        AccountReference: 'e-resi-billing',
        TransactionDesc: description.slice(0, 90),
      }),
    });
    if (!stkRes.ok) {
      this.logger.error(`M-Pesa STK push failed: ${await stkRes.text()}`);
      throw new BadRequestException('Could not send the M-Pesa verification prompt');
    }
    const json = (await stkRes.json()) as { CheckoutRequestID: string };
    // completion arrives via the callback once the user enters their PIN
    return { checkoutRequestId: json.CheckoutRequestID, completed: false, sandbox: false };
  }
}
