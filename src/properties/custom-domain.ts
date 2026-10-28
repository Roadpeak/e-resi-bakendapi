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
