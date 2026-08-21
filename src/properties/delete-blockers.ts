import type { Prisma } from '@prisma/client';

/**
 * Clear the rows that stop a Property being deleted.
 *
 * Most of a listing cascades — media, units, floor plans, amenities, scenes.
 * These do not, by design: a booking or an enquiry is a record of something a
 * real person did, and it should not vanish because someone tidied up a
 * listing. Postgres therefore refuses the delete, with a foreign key error
 * that names a constraint rather than anything an admin could act on.
 *
 * For a draft that trade-off inverts. A draft was never published, so anything
 * attached to it came from the developer's own testing — and since no screen
 * anywhere can delete a booking or an enquiry, refusing left those listings
 * permanently undeletable.
 *
 * Kept in one place because the set is not obvious and is easy to get wrong:
 * Reservation hangs off Unit rather than Property, so it is invisible when
 * reading Property's own relations, and a delete that clears only the obvious
 * three still fails on it.
 *
 * Callers must have established that deleting is allowed. This only removes
 * what is in the way.
 */
export async function clearDeleteBlockers(
  tx: Prisma.TransactionClient,
  propertyId: string,
): Promise<void> {
  // Reservations reference Unit, and Unit cascades from Property — but the
  // cascade cannot run while a Reservation still points at the unit, so these
  // have to go first.
  const units = await tx.unit.findMany({
    where: { propertyId },
    select: { id: true },
  });
  if (units.length) {
    await tx.reservation.deleteMany({
      where: { unitId: { in: units.map((u) => u.id) } },
    });
  }

  await tx.booking.deleteMany({ where: { propertyId } });
  await tx.inquiry.deleteMany({ where: { propertyId } });
  await tx.rentListing.deleteMany({ where: { propertyId } });
  // Page views and tour opens for a listing nobody could see. Retaining them
  // would also break the delete, since they do not cascade either.
  await tx.analyticsEvent.deleteMany({ where: { propertyId } });
}
