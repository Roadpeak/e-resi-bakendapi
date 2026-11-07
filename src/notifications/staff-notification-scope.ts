import type { NotificationType, Prisma } from '@prisma/client';

/**
 * Which dashboard page each notification belongs to, so a team member only
 * sees notifications for the pages their employer granted them.
 *
 * Notifications are stored against the developer account, and staff read
 * through it, so without this every team member saw everything: billing,
 * KYB decisions, deals they have no access to.
 */

const TYPE_PAGE: Partial<Record<NotificationType, string>> = {
  INQUIRY_RECEIVED: 'inquiries',
  INQUIRY_REPLIED: 'inquiries',
  BOOKING_CONFIRMED: 'bookings',
  BOOKING_CANCELLED: 'bookings',
  RESERVATION_UPDATED: 'reservations',
  RESERVATION_EXPIRING: 'reservations',
  UNIT_OWNERSHIP_GRANTED: 'units',
  DOCUMENT_SHARED: 'documents',
  PAYMENT_RECEIVED: 'billing',
  INVOICE_ISSUED: 'billing',
  INVOICE_REMINDER: 'billing',
  RECEIPT_ISSUED: 'billing',
  PAYMENT_METHOD_UPDATED: 'billing',
  KYB_APPROVED: 'profile',
  KYB_REJECTED: 'profile',
  PROPERTY_PUBLISHED: 'properties',
  DEAL_UPDATED: 'deals',
  MANDATE_UPDATED: 'mandates',
};

/** For GENERAL notifications, the page follows what they are about. */
const RESOURCE_PAGE: Record<string, string> = {
  Deal: 'deals',
  AgentPartnership: 'partners',
  Mandate: 'mandates',
  Invoice: 'billing',
  Receipt: 'billing',
  Reservation: 'reservations',
  Booking: 'bookings',
  Inquiry: 'inquiries',
  Document: 'documents',
  Unit: 'units',
  Property: 'properties',
  DeveloperProfile: 'profile',
  LettingEngagement: 'rentals',
  ChatThread: 'messages',
  Conversation: 'messages',
  // A signed-in buyer who opened a development: lives on the Leads page.
  Lead: 'leads',
};

/**
 * Prisma filter for the notifications a staff member may see. Platform-wide
 * announcements always show; everything else needs its page granted. A
 * GENERAL notification with nothing to place it by stays with the owner.
 */
export function staffNotificationWhere(pages: string[]): Prisma.NotificationWhereInput {
  const allowed = new Set(pages);
  const types = (Object.entries(TYPE_PAGE) as [NotificationType, string][])
    .filter(([, page]) => allowed.has(page))
    .map(([type]) => type);
  const resources = Object.entries(RESOURCE_PAGE)
    .filter(([, page]) => allowed.has(page))
    .map(([r]) => r);
  const linkPrefixes = [...allowed].map((p) => `/dashboard/${p}`);

  return {
    OR: [
      { type: 'SYSTEM_ANNOUNCEMENT' },
      ...(types.length ? [{ type: { in: types } }] : []),
      {
        type: 'GENERAL',
        OR: [
          ...(resources.length ? [{ resourceType: { in: resources } }] : []),
          ...linkPrefixes.map((prefix) => ({ link: { startsWith: prefix } })),
          // Support conversations are open to every team member.
          { resourceType: 'SupportThread' },
        ],
      },
    ],
  };
}
