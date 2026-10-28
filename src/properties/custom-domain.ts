/**
 * Custom domains: a development served on its own host, e.g.
 * herisresidence.co.ke or tours.developer.co.ke.
 *
 * One canonical spelling is stored — lowercase, no scheme, path, port or
 * leading "www." — so "https://WWW.HerisResidence.com/" and
 * "herisresidence.com" cannot both be registered, and the web proxy can look
 * up apex and www alike with the same normalisation.
 */
export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

/** Hosts that must never be claimed by a development — they route e-resi itself. */
export function isReservedDomain(domain: string): boolean {
  return domain === 'e-resi.com' || domain.endsWith('.e-resi.com')
    || domain === 'localhost' || /^\d+(\.\d+){3}$/.test(domain);
}

/** The e-resi zone free development addresses live under. */
export const SITE_ZONE = 'e-resi.com';

/**
 * Labels that route e-resi itself or could pass for it. A development
 * cannot claim admin.e-resi.com and look like part of the platform.
 */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'mail', 'email', 'smtp', 'imap', 'pop',
  'ftp', 'cdn', 'media', 'static', 'assets', 'img', 'images', 'files', 'docs', 'help',
  'support', 'status', 'blog', 'news', 'staging', 'dev', 'test', 'qa', 'preview', 'beta',
  'demo', 'auth', 'login', 'account', 'accounts', 'billing', 'pay', 'payments', 'secure',
  'domains', 'domain', 'e-resi', 'eresi', 'agent', 'agents', 'developer', 'developers', 'm', 'ns1', 'ns2',
]);

export function normaliseSubdomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.e-resi\.com\.?$/, '');
}

/** One DNS label: 3–63 of a-z, 0-9 and inner hyphens. */
export function subdomainProblem(label: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(label)) {
    return 'Use 3–63 letters, numbers or hyphens, not starting or ending with a hyphen';
  }
  if (RESERVED_SUBDOMAINS.has(label)) return 'That address is reserved';
  return null;
}

/** "herisresidence.e-resi.com" → "herisresidence"; anything else → null. */
export function subdomainOf(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h.endsWith(`.${SITE_ZONE}`)) return null;
  const label = h.slice(0, -(SITE_ZONE.length + 1));
  return label.includes('.') ? null : label;
}
