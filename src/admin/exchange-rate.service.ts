import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

/** Provider requires no key and publishes daily mid-market rates. */
const DEFAULT_ENDPOINT = 'https://open.er-api.com/v6/latest';

/** Cached rates older than this are refused for conversions. */
const MAX_AGE_HOURS = 48;

interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: string;
}

/**
 * Live foreign-exchange rates.
 *
 * Kept deliberately narrow: rates are used when an admin converts the catalog
 * from one currency to another, not on every page render. Prices are stored in
 * one currency and stay there, so nothing revalues silently overnight — a
 * shilling that moves 2% must not quietly reprice work already commissioned.
 *
 * The last good response is cached in platform settings, so a provider outage
 * degrades to a slightly stale rate rather than blocking the admin.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly endpoint: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.endpoint = config.get<string>('FX_ENDPOINT', DEFAULT_ENDPOINT);
  }

  // ─── Cache ───────────────────────────────────────────────────────────────

  private async readCache(): Promise<CachedRates | null> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'fx_rates_cache' },
    });
    if (!row?.value) return null;
    try {
      return JSON.parse(row.value) as CachedRates;
    } catch {
      // A corrupt cache should behave as no cache, not crash the request.
      return null;
    }
  }

  private async writeCache(payload: CachedRates): Promise<void> {
    await this.prisma.platformSetting.upsert({
      where: { key: 'fx_rates_cache' },
      create: {
        key: 'fx_rates_cache',
        value: JSON.stringify(payload),
        valueType: 'json',
        label: 'Exchange rate cache',
        group: 'billing',
        description: 'Last successful FX fetch. Managed automatically.',
      },
      update: { value: JSON.stringify(payload) },
    });
  }

  // ─── Fetching ────────────────────────────────────────────────────────────

  /** Pull fresh rates. Returns null on any failure — callers fall back to cache. */
  private async fetchRates(base: string): Promise<CachedRates | null> {
    try {
      const res = await fetch(`${this.endpoint}/${base}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`provider returned ${res.status}`);

      const json = (await res.json()) as {
        result?: string;
        base_code?: string;
        rates?: Record<string, number>;
      };
      if (json.result === 'error' || !json.rates) {
        throw new Error('provider returned no rates');
      }

      const payload: CachedRates = {
        base: json.base_code ?? base,
        rates: json.rates,
        fetchedAt: new Date().toISOString(),
        source: new URL(this.endpoint).host,
      };
      await this.writeCache(payload);
      return payload;
    } catch (err) {
      this.logger.warn(`FX fetch failed for ${base}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Refresh the cache daily so an admin converting at 09:00 is not the one
   * paying for a cold fetch. Failure is non-fatal: the cached rate stands.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM, { name: 'fx-refresh', timeZone: 'Africa/Nairobi' })
  async refresh(): Promise<void> {
    const cached = await this.readCache();
    const fresh = await this.fetchRates(cached?.base ?? 'USD');
    if (fresh) {
      this.logger.log(`FX rates refreshed from ${fresh.source}`);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * How many `to` you get for one `from`, plus how old the figure is so the UI
   * can say when it was last checked rather than presenting it as gospel.
   */
  async getRate(from: string, to: string): Promise<{
    rate: number;
    from: string;
    to: string;
    fetchedAt: string;
    source: string;
    stale: boolean;
  }> {
    const base = from.trim().toUpperCase();
    const quote = to.trim().toUpperCase();

    if (base === quote) {
      return {
        rate: 1, from: base, to: quote,
        fetchedAt: new Date().toISOString(), source: 'identity', stale: false,
      };
    }

    let data = await this.readCache();
    const ageHours = data
      ? (Date.now() - new Date(data.fetchedAt).getTime()) / 3_600_000
      : Infinity;

    // Refetch when the cache is missing, aged, or keyed to a different base.
    if (!data || ageHours > 12 || data.base !== base) {
      data = (await this.fetchRates(base)) ?? data;
    }
    if (!data) {
      throw new ServiceUnavailableException(
        'Live exchange rates are unavailable. Enter the rate manually.',
      );
    }

    const rate = data.base === base
      ? data.rates[quote]
      // Cross-rate via the cached base, e.g. cache is USD-based but the admin
      // is converting KES → EUR.
      : (data.rates[quote] ?? 0) / (data.rates[base] ?? 0);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException(
        `No exchange rate available for ${base} → ${quote}. Enter it manually.`,
      );
    }

    const age = (Date.now() - new Date(data.fetchedAt).getTime()) / 3_600_000;
    return {
      rate: Math.round(rate * 1e6) / 1e6,
      from: base,
      to: quote,
      fetchedAt: data.fetchedAt,
      source: data.source,
      stale: age > MAX_AGE_HOURS,
    };
  }
}
