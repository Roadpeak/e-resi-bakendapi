import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits by the visitor's address, not the proxy's.
 *
 * Requests reach the API through Cloudflare and nginx, so req.ip is nginx for
 * everyone — limiting on it would cap the whole site at a handful of support
 * messages a minute. Cloudflare's header is the real client.
 */
@Injectable()
export class SupportThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req.headers ?? {};
    const forwarded = String(headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    return String(headers['cf-connecting-ip'] ?? '') || forwarded || req.ip;
  }
}
