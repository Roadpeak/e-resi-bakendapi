/**
 * Where clicking a notification should take the person reading it.
 *
 * One resolver for every portal, so a notification never lands someone in a
 * portal that isn't theirs: the same "deal updated" goes to /dashboard/deals
 * for the developer and /agent/deals for the agent. It works from the link
 * stored at creation when there is one (re-pointed at the reader's portal),
 * from the resource the notification is about when that is more precise, and
 * from the notification type for older rows that stored neither.
 */

type Role = string | null | undefined;

export interface LinkableNotification {
  type: string;
  link?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

const PORTAL: Record<string, string> = {
  DEVELOPER: '/dashboard',
  AGENT: '/agent',
  ADMIN: '/admin',
};
const portalOf = (role: Role) => PORTAL[role ?? ''] ?? '/account';

/** Sections that exist, under the same name, in both the developer and agent portals. */
const SHARED_SECTIONS = new Set(['deals', 'mandates', 'partners', 'billing', 'bookings', 'inquiries', 'reservations', 'messages', 'profile']);

/** Re-point a stored path at the reader's own portal. */
function remap(path: string, role: Role): string {
  const portal = portalOf(role);
  const m = path.match(/^\/(dashboard|agent|account|admin)(\/[^?#]*)?(.*)$/);
  if (!m) return path; // public page, e.g. /<slug>
  const [, from, rest = '', tail] = m;
  if (`/${from}` === portal) return path;

  const section = rest.split('/')[1] ?? '';
  if (portal === '/agent' || portal === '/dashboard') {
    if (from === 'dashboard' || from === 'agent') {
      if (SHARED_SECTIONS.has(section)) return `${portal}${rest}${tail}`;
      if (portal === '/dashboard' && section === 'lettings') return '/dashboard/rentals';
      return portal;
    }
  }
  return `${portal === '/account' ? '/account/notifications' : portal}`;
}

/** Most precise destination the resource allows, for this reader. */
function fromResource(n: LinkableNotification, role: Role, slug?: string): string | null {
  const portal = portalOf(role);
  const id = n.resourceId;
  switch (n.resourceType) {
    case 'Deal':
      return portal === '/account' ? null : id ? `${portal}/deals/${id}` : `${portal}/deals`;
    case 'AgentPartnership':
      return portal === '/account' ? null : id ? `${portal}/partners/${id}` : `${portal}/partners`;
    case 'Mandate':
      return portal === '/account' ? null : `${portal}/mandates`;
    case 'Invoice':
    case 'Receipt':
      return portal === '/admin' ? '/admin/billing/invoices' : portal === '/account' ? null : `${portal}/billing`;
    case 'Reservation':
      return portal === '/admin' ? '/admin/rentals' : `${portal}/reservations`;
    case 'Booking':
      return portal === '/admin' ? '/admin/rentals' : portal === '/account' ? '/account/viewings' : `${portal}/bookings`;
    case 'Inquiry':
      return portal === '/admin' ? '/admin/rentals' : `${portal}/inquiries`;
    case 'Document':
      return portal === '/dashboard' ? '/dashboard/documents' : portal === '/account' ? '/account/reservations' : null;
    case 'Unit':
      return portal === '/account' ? '/account/units' : null;
    case 'LettingEngagement':
      return portal === '/agent' ? '/agent/lettings' : portal === '/account' ? '/account/units' : null;
    case 'DeveloperProfile':
      return portal === '/admin' && id ? `/admin/developers/${id}` : null;
    case 'AgentProfile':
      return portal === '/admin' && id ? `/admin/agents/${id}` : null;
    case 'Property':
      if (portal === '/dashboard') return slug ? `/dashboard/properties/${slug}` : '/dashboard/properties';
      if (portal === '/agent') return '/agent/properties';
      if (portal === '/admin') return '/admin/properties';
      return slug ? `/${slug}` : null;
    default:
      return null;
  }
}

/** Fallback by notification type, for rows with neither link nor resource. */
function fromType(type: string, role: Role): string | null {
  const portal = portalOf(role);
  if (/^(INVOICE_|RECEIPT_|PAYMENT_)/.test(type)) return portal === '/account' ? null : portal === '/admin' ? '/admin/billing' : `${portal}/billing`;
  if (type.startsWith('INQUIRY')) return portal === '/admin' ? null : `${portal}/inquiries`;
  if (type.startsWith('BOOKING')) return portal === '/account' ? '/account/viewings' : portal === '/admin' ? null : `${portal}/bookings`;
  if (type.startsWith('RESERVATION')) return portal === '/admin' ? null : `${portal}/reservations`;
  if (type === 'DEAL_UPDATED') return portal === '/account' ? null : `${portal}/deals`;
  if (type === 'MANDATE_UPDATED') return portal === '/account' ? null : `${portal}/mandates`;
  if (type === 'DOCUMENT_SHARED') return portal === '/dashboard' ? '/dashboard/documents' : '/account/reservations';
  if (type === 'UNIT_OWNERSHIP_GRANTED') return '/account/units';
  if (type.startsWith('KYB')) return '/dashboard/profile';
  if (type === 'PROPERTY_PUBLISHED') return '/dashboard/properties';
  return null;
}

const PORTAL_ROOTS = new Set(['/dashboard', '/agent', '/account', '/admin']);

export function resolveNotificationLink(n: LinkableNotification, role: Role, slug?: string): string | null {
  const resource = fromResource(n, role, slug);
  // A resource-specific page (a particular deal or partnership) beats a list.
  if (resource && n.resourceId && resource.includes(n.resourceId)) return resource;
  if (n.link && !PORTAL_ROOTS.has(n.link)) {
    // Keep the stored link's query (e.g. ?status=DRAFT) and its own page.
    return remap(n.link, role);
  }
  return resource ?? fromType(n.type, role) ?? (n.link ? remap(n.link, role) : null);
}
