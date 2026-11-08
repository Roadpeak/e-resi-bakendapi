import { UserRole } from '@prisma/client';

/**
 * A development is owned by a developer OR by an agent listing it
 * themselves (the developer need not be on e-resi). Every ownership check
 * goes through here so agents pass wherever developers do — and only for
 * their own listings.
 */

/** Include this wherever a property is loaded for an ownership check. */
export const OWNER_INCLUDE = {
  developer: { select: { id: true, userId: true, companyName: true } },
  listedByAgent: { select: { id: true, userId: true, displayName: true } },
} as const;

export interface OwnedProperty {
  developer?: { userId: string } | null;
  listedByAgent?: { userId: string } | null;
}

/** The user who owns this development, whichever kind of owner it is. */
export function ownerUserId(p: OwnedProperty | null | undefined): string | null {
  if (!p) return null;
  return p.developer?.userId ?? p.listedByAgent?.userId ?? null;
}

/** True for the owner (developer or listing agent), and for admins. */
export function canManageProperty(p: OwnedProperty, userId: string, role?: UserRole | string): boolean {
  if (role === UserRole.ADMIN || role === 'ADMIN') return true;
  return ownerUserId(p) === userId;
}

/** Display name of whoever owns it, for notifications and documents. */
export function ownerName(p: { developer?: { companyName?: string | null } | null; listedByAgent?: { displayName?: string | null } | null; developerName?: string | null }): string {
  return p.developer?.companyName ?? p.listedByAgent?.displayName ?? p.developerName ?? 'the owner';
}
