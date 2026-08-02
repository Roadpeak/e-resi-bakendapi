import type { ConfigService } from '@nestjs/config';

/**
 * The single public origin for links we hand to users — password resets,
 * verification emails, payment callbacks.
 *
 * FRONTEND_URL cannot be used directly: it doubles as the CORS allow-list, so
 * in production it holds several comma-separated origins. Interpolating that
 * into a link produces
 *   "https://e-resi.com,https://www.e-resi.com,https://app.e-resi.com/reset-password?token=…"
 * which is what shipped, and it breaks every emailed link and every gateway
 * redirect built from it.
 *
 * Prefers APP_PUBLIC_URL. Falls back to the first entry of FRONTEND_URL so an
 * environment that has not set it yet still produces a usable link rather than
 * a corrupt one.
 */
export function resolveAppUrl(config: ConfigService): string {
  const explicit = config.get<string>('APP_PUBLIC_URL');
  const candidate = explicit?.trim()
    || config.get<string>('FRONTEND_URL', 'http://localhost:3000').split(',')[0].trim();

  // A trailing slash would double up against the paths callers append.
  return candidate.replace(/\/+$/, '');
}
