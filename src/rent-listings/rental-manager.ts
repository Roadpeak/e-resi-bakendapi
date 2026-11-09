import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Who runs a rental day to day — the person its leads belong to.
 *
 * The engaged letting agent, the owner running it themselves, or the
 * building's developer (their own listings and ones delegated to them).
 */
export async function rentalManager(prisma: PrismaService, rentListingId: string) {
  const l = await prisma.rentListing.findUnique({
    where: { id: rentListingId },
    select: {
      name: true, managerKind: true, ownerId: true,
      managingAgent: { select: { userId: true } },
      developer: { select: { userId: true } },
    },
  });
  if (!l) return null;
  if (l.managerKind === 'AGENT' && l.managingAgent) return { userId: l.managingAgent.userId, agent: true, name: l.name };
  if (l.managerKind === 'OWNER' && l.ownerId) return { userId: l.ownerId, agent: false, name: l.name };
  if (l.developer) return { userId: l.developer.userId, agent: false, name: l.name };
  return null;
}

/** Prisma filter for the rentals a developer or agent runs. */
export function managedRentalsWhere(owner: { kind: 'DEVELOPER' | 'AGENT'; id: string }) {
  return owner.kind === 'AGENT'
    ? { OR: [{ managingAgentId: owner.id, managerKind: 'AGENT' as const }, { listedByAgentId: owner.id }] }
    : {
      developerId: owner.id,
      listedByAgentId: null,
      OR: [{ ownerId: null }, { managerKind: 'DEVELOPER' as const }],
    };
}
