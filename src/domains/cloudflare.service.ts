import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API = 'https://api.cloudflare.com/client/v4';

export class CloudflareError extends Error {
  constructor(message: string, readonly codes: number[] = []) {
    super(message);
  }
}

export interface CfZone {
  id: string;
  name: string;
  status: string; // pending | active | moved | deleted | initializing
  name_servers: string[];
}

export interface CfCustomHostname {
  id: string;
  hostname: string;
  status: string; // pending | active | moved | deleted | blocked
  ssl?: { status?: string };
  verification_errors?: string[];
}

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
}

/**
 * Thin Cloudflare v4 client for the calls custom domains need.
 *
 * Configured by CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID; without both,
 * `enabled` is false and domains fall back to being connected by hand.
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly token: string;
  readonly accountId: string;
  /** Server every development domain points at. */
  readonly originIp: string;
  /** e-resi's own zone — home of <name>.e-resi.com and custom hostnames. */
  readonly siteZone: string;
  /** CNAME target developers point a subdomain at. */
  readonly saasTarget: string;
  private siteZoneId?: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('CLOUDFLARE_API_TOKEN', '');
    this.accountId = config.get<string>('CLOUDFLARE_ACCOUNT_ID', '');
    this.originIp = config.get<string>('CLOUDFLARE_ORIGIN_IP', '167.99.81.98');
    this.siteZone = config.get<string>('CLOUDFLARE_SITE_ZONE', 'e-resi.com');
    this.saasTarget = config.get<string>('CLOUDFLARE_SAAS_TARGET', `domains.${this.siteZone}`);
  }

  get enabled() {
    return !!(this.token && this.accountId);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; result: T; errors?: { code: number; message: string }[] }
      | null;
    if (!json?.success) {
      const errors = json?.errors ?? [];
      const message = errors.map((e) => e.message).join('; ') || `Cloudflare ${res.status}`;
      throw new CloudflareError(message, errors.map((e) => e.code));
    }
    return json.result;
  }

  // ── Zones (a whole domain added to e-resi's account) ─────────────────────

  /**
   * Add a domain as a zone, scanning its existing records first so the
   * developer's email (MX, SPF…) keeps working after the nameserver switch.
   * Reuses the zone if this account already has it.
   */
  async createZone(name: string): Promise<CfZone> {
    try {
      return await this.call<CfZone>('POST', '/zones', {
        name, account: { id: this.accountId }, type: 'full', jump_start: true,
      });
    } catch (e) {
      const existing = await this.findZone(name);
      if (existing) return existing;
      throw e;
    }
  }

  async findZone(name: string): Promise<CfZone | null> {
    const zones = await this.call<CfZone[]>(
      'GET', `/zones?name=${encodeURIComponent(name)}&account.id=${this.accountId}`,
    );
    return zones[0] ?? null;
  }

  getZone(id: string) {
    return this.call<CfZone>('GET', `/zones/${id}`);
  }

  async deleteZone(id: string) {
    await this.call('DELETE', `/zones/${id}`);
  }

  /** Ask Cloudflare to re-check nameservers now. Rate-limited by Cloudflare; failures are harmless. */
  async activationCheck(id: string) {
    try {
      await this.call('PUT', `/zones/${id}/activation_check`);
    } catch {
      /* rate limited or already active */
    }
  }

  /**
   * Point the domain and www at e-resi. Records the scan imported for those
   * two names are replaced (they would point at the developer's old host);
   * everything else — mail above all — is left alone.
   */
  async pointZoneAtOrigin(zoneId: string, domain: string) {
    const names = new Set([domain, `www.${domain}`]);
    const records = await this.call<CfDnsRecord[]>('GET', `/zones/${zoneId}/dns_records?per_page=500`);
    for (const r of records) {
      if (names.has(r.name) && ['A', 'AAAA', 'CNAME'].includes(r.type)) {
        await this.call('DELETE', `/zones/${zoneId}/dns_records/${r.id}`);
      }
    }
    await this.call('POST', `/zones/${zoneId}/dns_records`, {
      type: 'A', name: domain, content: this.originIp, proxied: true, ttl: 1,
    });
    await this.call('POST', `/zones/${zoneId}/dns_records`, {
      type: 'CNAME', name: `www.${domain}`, content: domain, proxied: true, ttl: 1,
    });
    // Full, not strict: the origin certificate covers e-resi.com only, and
    // strict would reject it for this domain. Edge-to-browser stays fully
    // validated; edge-to-origin stays encrypted.
    await this.call('PATCH', `/zones/${zoneId}/settings/ssl`, { value: 'full' });
    await this.call('PATCH', `/zones/${zoneId}/settings/always_use_https`, { value: 'on' });
  }

  // ── e-resi's own zone ──────────────────────────────────────────────────────

  async getSiteZoneId(): Promise<string> {
    if (this.siteZoneId) return this.siteZoneId;
    const zone = await this.findZone(this.siteZone);
    if (!zone) throw new CloudflareError(`${this.siteZone} is not in this Cloudflare account`);
    this.siteZoneId = zone.id;
    return zone.id;
  }

  /** Create a proxied A record in e-resi's zone unless one by that name exists. */
  async ensureSiteRecord(name: string) {
    const zoneId = await this.getSiteZoneId();
    const fqdn = name === '@' ? this.siteZone : `${name}.${this.siteZone}`;
    const existing = await this.call<CfDnsRecord[]>(
      'GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(fqdn)}`,
    );
    if (existing.length) return false;
    await this.call('POST', `/zones/${zoneId}/dns_records`, {
      type: 'A', name: fqdn, content: this.originIp, proxied: true, ttl: 1,
    });
    this.logger.log(`Created DNS record ${fqdn} → ${this.originIp}`);
    return true;
  }

  // ── Custom hostnames (Cloudflare for SaaS: a developer's subdomain) ────────

  async createCustomHostname(hostname: string): Promise<CfCustomHostname> {
    const zoneId = await this.getSiteZoneId();
    await this.ensureSiteRecord(this.saasTarget.replace(`.${this.siteZone}`, ''));
    try {
      await this.call('PUT', `/zones/${zoneId}/custom_hostnames/fallback_origin`, { origin: this.saasTarget });
    } catch (e) {
      this.logger.warn(`Fallback origin not set: ${(e as Error).message}`);
    }
    return this.call<CfCustomHostname>('POST', `/zones/${zoneId}/custom_hostnames`, {
      hostname,
      ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } },
    });
  }

  async getCustomHostname(id: string) {
    const zoneId = await this.getSiteZoneId();
    return this.call<CfCustomHostname>('GET', `/zones/${zoneId}/custom_hostnames/${id}`);
  }

  async deleteCustomHostname(id: string) {
    const zoneId = await this.getSiteZoneId();
    await this.call('DELETE', `/zones/${zoneId}/custom_hostnames/${id}`);
  }
}
