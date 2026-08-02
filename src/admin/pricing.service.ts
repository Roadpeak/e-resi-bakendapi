import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProductionTierType, ServiceCategoryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExchangeRateService } from './exchange-rate.service.js';

/**
 * Values previously hardcoded in production-tiers.service.ts. Used once to seed
 * the table so existing pricing survives the move to the database.
 */
const TIER_SEED: {
  tier: ProductionTierType;
  label: string;
  price: number;
  features: string[];
}[] = [
  { tier: 'LISTING_ONLY', label: 'Listing only', price: 0, features: ['Basic listing', 'Up to 10 photos (self-upload)', 'Standard visibility'] },
  { tier: 'PHOTOGRAPHY', label: 'Photography', price: 15000, features: ['Professional photography (up to 30 shots)', 'Edited gallery', 'Priority listing'] },
  { tier: 'PHOTOGRAPHY_VIDEO', label: 'Photography + Video', price: 35000, features: ['All Photography tier features', 'Professional property video (3–5 min)', 'YouTube + social cuts'] },
  { tier: 'TOUR_CINEMATIC', label: 'Cinematic tour', price: 75000, features: ['All Photo+Video features', 'Cinematic VR-ready tour video', 'Scene tagging'] },
  { tier: 'TOUR_3D', label: '3D tour', price: 95000, features: ['All Cinematic features', 'Interactive 3D walkthrough', 'Room-by-room navigation'] },
  { tier: 'TOUR_VR', label: 'VR tour', price: 120000, features: ['All 3D Tour features', 'Full VR headset experience', 'WebGL-optimised delivery'] },
  { tier: 'FULL_PRODUCTION', label: 'Full production', price: 250000, features: ['All tiers combined', 'Aerial drone footage', 'Digital twin model', 'Dedicated production team'] },
];

/** Mirrors the frontend catalog so the same services and prices carry over. */
const SERVICE_SEED: {
  key: string;
  label: string;
  category: ServiceCategoryType;
  price: number;
  description: string;
  unit?: string;
}[] = [
  { key: 'photography', label: 'Professional Photography', category: 'CAPTURE', price: 850, description: 'Full interior & exterior stills shoot, edited and colour-graded.' },
  { key: 'videography', label: 'Professional Videography', category: 'CAPTURE', price: 1200, description: 'Ground-level cinematic filming of the development.' },
  { key: 'drone_photo', label: 'Drone Photography', category: 'CAPTURE', price: 400, description: 'Aerial stills showing the site, views and surroundings.' },
  { key: 'drone_video', label: 'Drone Cinematic Video', category: 'CAPTURE', price: 700, description: 'Aerial cinematic sequences, edited to music.' },
  { key: 'twilight', label: 'Twilight Photography', category: 'CAPTURE', price: 450, description: 'Golden-hour and dusk shots for hero imagery.' },
  { key: 'scan_3d', label: '3D Property Scan', category: 'IMMERSIVE', price: 2500, description: 'LiDAR / Matterport capture of built units.' },
  { key: 'vr_tour', label: 'Virtual Reality Tour', category: 'IMMERSIVE', price: 3800, description: 'Headset-ready immersive walkthrough experience.' },
  { key: 'tour_360', label: '360° Tour', category: 'IMMERSIVE', price: 1500, description: 'Browser-based 360° panorama tour.' },
  { key: 'walkthrough', label: 'Cinematic Walkthrough Video', category: 'IMMERSIVE', price: 1800, description: 'Steadicam interior walkthrough, cinematic edit.' },
  { key: 'cgi', label: 'CGI / Architectural Visualization', category: 'IMMERSIVE', price: 2200, description: 'Photoreal renders for off-plan developments.' },
];

/** Fallback when nothing is configured. Kenyan platform, Kenyan settlement. */
export const PLATFORM_DEFAULT_CURRENCY = 'KES';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: ExchangeRateService,
  ) {}

  /**
   * Populate the pricing tables from the previously hardcoded values.
   * Idempotent — existing rows are left untouched, so re-running never
   * overwrites prices an admin has since edited.
   */
  async seedDefaults(): Promise<{ tiers: number; services: number; settings: number }> {
    let tiers = 0;
    for (const [i, t] of TIER_SEED.entries()) {
      const existing = await this.prisma.pricingPlan.findUnique({ where: { tier: t.tier } });
      if (existing) continue;
      await this.prisma.pricingPlan.create({
        data: { ...t, currency: PLATFORM_DEFAULT_CURRENCY, order: i },
      });
      tiers++;
    }

    let services = 0;
    for (const [i, s] of SERVICE_SEED.entries()) {
      const existing = await this.prisma.serviceCatalogItem.findUnique({ where: { key: s.key } });
      if (existing) continue;
      await this.prisma.serviceCatalogItem.create({
        data: { ...s, currency: PLATFORM_DEFAULT_CURRENCY, order: i },
      });
      services++;
    }

    const settingSeed = [
      { key: 'platform_currency', value: 'KES', valueType: 'string', label: 'Platform currency', group: 'billing', description: 'Everything the platform bills in — listing fees, production, invoices and receipts. Must be a currency the payment gateway settles.' },
      { key: 'listing_fee_monthly', value: '49', valueType: 'number', label: 'Monthly listing fee', group: 'billing', description: 'Charged per active development each month.' },
      { key: 'listing_fee_free_months', value: '0', valueType: 'number', label: 'Free months on signup', group: 'billing' },
      { key: 'tax_rate_percent', value: '16', valueType: 'number', label: 'VAT rate (%)', group: 'billing', description: 'Applied to invoices.' },
    ];
    let settings = 0;
    for (const s of settingSeed) {
      const existing = await this.prisma.platformSetting.findUnique({ where: { key: s.key } });
      if (existing) continue;
      await this.prisma.platformSetting.create({ data: s });
      settings++;
    }

    return { tiers, services, settings };
  }

  // ─── Production tiers ─────────────────────────────────────────────────────

  async listTiers(includeInactive = false) {
    return this.prisma.pricingPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async updateTier(
    id: string,
    data: Partial<{ label: string; price: number; currency: string; features: string[]; description: string; isActive: boolean; order: number }>,
  ) {
    const existing = await this.prisma.pricingPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pricing plan not found');
    const updated = await this.prisma.pricingPlan.update({ where: { id }, data });
    return { before: existing, after: updated };
  }

  /** How many properties sit on a tier — shown before a price change. */
  async tierImpact(tier: ProductionTierType) {
    const count = await this.prisma.productionTier.count({ where: { tier } });
    return { tier, affectedProperties: count };
  }

  // ─── Service catalogue ────────────────────────────────────────────────────

  async listServices(includeInactive = false) {
    return this.prisma.serviceCatalogItem.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  async createService(data: {
    key: string;
    label: string;
    category: ServiceCategoryType;
    price: number;
    currency?: string;
    unit?: string;
    description?: string;
  }) {
    return this.prisma.serviceCatalogItem.create({ data });
  }

  async updateService(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.serviceCatalogItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');
    const updated = await this.prisma.serviceCatalogItem.update({ where: { id }, data });
    return { before: existing, after: updated };
  }

  async removeService(id: string) {
    const existing = await this.prisma.serviceCatalogItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');
    // Soft-delete: past orders reference this key, so the row must survive.
    return this.prisma.serviceCatalogItem.update({ where: { id }, data: { isActive: false } });
  }

  // ─── Platform settings ────────────────────────────────────────────────────

  async listSettings(group?: string) {
    return this.prisma.platformSetting.findMany({
      where: group ? { group } : {},
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
  }

  async updateSetting(key: string, value: string) {
    const existing = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException('Setting not found');
    const updated = await this.prisma.platformSetting.update({ where: { key }, data: { value } });
    return { before: existing, after: updated };
  }

  /** Convenience read used by billing and the public catalogue. */
  async getSetting(key: string, fallback: string): Promise<string> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return row?.value ?? fallback;
  }

  /**
   * The one currency the platform bills in. Everything chargeable — listing
   * fees, production, invoices, receipts — reads this rather than carrying its
   * own default, which is how services ended up in USD while tiers were in KES.
   *
   * Note this is not the same as a listing's currency: a developer may price a
   * development in USD while still being billed in KES.
   */
  async platformCurrency(): Promise<string> {
    const value = await this.getSetting('platform_currency', PLATFORM_DEFAULT_CURRENCY);
    return value.trim().toUpperCase();
  }

  /**
   * Switch the platform currency and restate catalog prices with it.
   *
   * `rate` multiplies every tier and service price. Passing 1 relabels without
   * converting, which is only right when the old figures were placeholders.
   * Nothing already invoiced or ordered is touched — those record a price that
   * was agreed, and rewriting them would change what somebody owes.
   */
  async setPlatformCurrency(currency: string, rate = 1, useLiveRate = false) {
    const next = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) {
      throw new BadRequestException('Currency must be a 3-letter ISO code, e.g. KES');
    }

    const from = (await this.getSetting('platform_currency', PLATFORM_DEFAULT_CURRENCY))
      .toUpperCase();

    // Fetching at the moment of conversion, rather than trusting a figure typed
    // into a form earlier, is the difference between converting at today's rate
    // and converting at whatever the rate was when the page was opened.
    let appliedRate = rate;
    let rateSource = 'manual';
    let rateFetchedAt: string | null = null;

    if (useLiveRate && from !== next) {
      const live = await this.fx.getRate(from, next);
      appliedRate = live.rate;
      rateSource = live.source;
      rateFetchedAt = live.fetchedAt;
    }

    if (!Number.isFinite(appliedRate) || appliedRate <= 0) {
      throw new BadRequestException('Conversion rate must be greater than zero');
    }
    rate = appliedRate;

    const round = (n: number) => Math.round(n * rate * 100) / 100;

    const [tiers, services] = await Promise.all([
      this.prisma.pricingPlan.findMany(),
      this.prisma.serviceCatalogItem.findMany(),
    ]);

    // Convert only what is not already in the target currency. The catalog can
    // hold mixed currencies — tiers were seeded KES while services were USD —
    // and multiplying a row that is already KES inflates it by the whole rate.
    let converted = 0;
    for (const t of tiers) {
      const needsConversion = rate !== 1 && t.currency.toUpperCase() !== next;
      if (needsConversion) converted++;
      await this.prisma.pricingPlan.update({
        where: { id: t.id },
        data: { currency: next, ...(needsConversion && { price: round(t.price) }) },
      });
    }
    for (const s of services) {
      const needsConversion = rate !== 1 && s.currency.toUpperCase() !== next;
      if (needsConversion) converted++;
      await this.prisma.serviceCatalogItem.update({
        where: { id: s.id },
        data: { currency: next, ...(needsConversion && { price: round(s.price) }) },
      });
    }

    // The listing fee lives in settings rather than a priced row, so its
    // currency comes from the previous platform setting.
    const previous = (await this.getSetting('platform_currency', '')).toUpperCase()
      || (await this.getSetting('listing_fee_currency', '')).toUpperCase();
    const fee = Number(await this.getSetting('listing_fee_monthly', '0'));
    const feeNeedsConversion = rate !== 1 && fee > 0 && previous !== next;

    await this.upsertSetting('platform_currency', next);
    if (feeNeedsConversion) {
      await this.upsertSetting('listing_fee_monthly', String(round(fee)));
    }
    // Kept in step so anything still reading the old key stays correct.
    await this.upsertSetting('listing_fee_currency', next);

    return {
      currency: next,
      rate,
      rateSource,
      rateFetchedAt,
      tiersUpdated: tiers.length,
      servicesUpdated: services.length,
      /** How many prices were actually multiplied, as opposed to relabelled. */
      pricesConverted: converted,
      listingFee: feeNeedsConversion ? round(fee) : fee,
    };
  }

  private async upsertSetting(key: string, value: string) {
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, value, valueType: 'string', label: key, group: 'billing' },
      update: { value },
    });
  }
}
