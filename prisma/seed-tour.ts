/**
 * Seed the guided tour stops for the reference apartment.
 *
 * These seven waypoints are authored data — someone stood at each spot in the
 * model and decided where a visitor should be and which way they should face.
 * That work does not come back from a migration, and until now it lived only in
 * one developer's database, where `prisma migrate reset` would have taken it.
 *
 *   pnpm seed:tour:dev          # development, via tsx
 *   pnpm seed:tour              # compiled, for an image without tsx
 *
 * Idempotent, and safe on a tour that has been edited: an existing stop is
 * matched by label and updated in place, so re-running restores the authored
 * geometry without duplicating rows or disturbing anything else on the twin.
 *
 * What is deliberately NOT seeded is the panorama. `panoramaUrl` points at a
 * baked JPEG under uploads/, which is gitignored — seeding the URL would create
 * rows referring to files a fresh checkout does not have, and a viewer offering
 * an "Inside" mode whose images 404 is worse than one that offers the live
 * model until someone runs the bake. Re-bake after seeding:
 *
 *   POST /api/properties/:slug/twin/:twinId/panoramas
 *
 * The mesh has the same problem and cannot be worked around the same way,
 * because a twin row without meshUrl is not valid. This seeds the stops onto a
 * twin that already exists and skips with an explanation when none does.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** The property whose twin these stops belong to. */
const PROPERTY_SLUG = process.env.TOUR_SLUG ?? 'westlands-heights-1';

/** Matched by label, so the twin is found rather than hardcoded by id. */
const TWIN_LABEL = process.env.TOUR_TWIN_LABEL ?? 'Apartment';

/**
 * The stops, in tour order.
 *
 * Coordinates are in the viewer's world space — centred on x/z with the model
 * resting on the ground — which is the same space the panorama bake renders in.
 * `posY` is eye height; `look` is a point in the room to face, not a direction.
 */
const WAYPOINTS = [
  {
    label: 'Living & dining',
    caption:
      'Open-plan living and dining running the full width of the apartment, with the kitchen kept along one end.',
    pos: [-2.27, 1.55, 4.01],
    look: [2.04, 1.3, 2.03],
  },
  {
    label: 'The kitchen',
    caption:
      'Full-height units and integrated appliances, set along the end wall so the living space stays open.',
    pos: [0.79, 1.55, 3.92],
    look: [2.87, 1.3, 2.6],
  },
  {
    label: 'Dining, looking back',
    caption:
      'The table sits between the kitchen and the seating, under the run of recessed ceiling light.',
    pos: [1.9, 1.55, 1.94],
    look: [-2.48, 1.3, 3.92],
  },
  {
    label: 'Hallway',
    caption: 'The corridor that separates the living space from the bedrooms and the bathroom.',
    pos: [-1.89, 1.55, 0.41],
    look: [-2.33, 1.3, -3.27],
  },
  {
    label: 'Bathroom',
    caption: 'Fully tiled, with a walk-in shower and a vanity set into the wall.',
    pos: [-2.04, 1.55, -1.69],
    look: [-2.18, 1.3, -3.56],
  },
  {
    label: 'Principal bedroom',
    caption: 'Double bed with fitted storage along the wall, set away from the living space.',
    pos: [2.63, 1.55, -1.09],
    // Aimed at the bed. The original authored value pointed at the television
    // on the left wall, which left an arriving visitor facing into the dark
    // half of the room — the bed, its lamps and the headboard are all on the
    // opposite side. Measured off the baked panorama's horizon.
    look: [1.78, 1.3, -0.24],
  },
  {
    label: 'Second bedroom',
    caption: 'At the far end of the plan, served by the same hallway and looking back through it.',
    pos: [0.58, 1.55, -4.39],
    look: [2.71, 1.3, -2.27],
  },
] as const;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const property = await prisma.property.findUnique({
      where: { slug: PROPERTY_SLUG },
      select: { id: true, name: true },
    });
    if (!property) {
      console.log(
        `No property "${PROPERTY_SLUG}" — run the property seed first, or set TOUR_SLUG. Nothing to do.`,
      );
      return;
    }

    const twin = await prisma.digitalTwin.findFirst({
      where: { propertyId: property.id, label: TWIN_LABEL },
      select: { id: true, label: true },
    });
    if (!twin) {
      // A twin is a model upload, not something a seed can conjure: it needs
      // the GLB itself. Saying so is more use than failing with a foreign-key
      // error from three frames down.
      console.log(
        `No twin "${TWIN_LABEL}" on ${property.name}. Upload the model first ` +
          `(POST /api/properties/${PROPERTY_SLUG}/twin), then re-run this. Nothing to do.`,
      );
      return;
    }

    const existing = await prisma.twinWaypoint.findMany({
      where: { twinId: twin.id },
      select: { id: true, label: true },
    });
    const byLabel = new Map(existing.map((w) => [w.label, w.id]));

    let created = 0;
    let updated = 0;

    for (const [order, w] of WAYPOINTS.entries()) {
      const data = {
        label: w.label,
        caption: w.caption,
        posX: w.pos[0],
        posY: w.pos[1],
        posZ: w.pos[2],
        lookX: w.look[0],
        lookY: w.look[1],
        lookZ: w.look[2],
        floor: 0,
        order,
      };

      const id = byLabel.get(w.label);
      if (id) {
        // Leaves panoramaUrl alone: a stop whose geometry is unchanged should
        // keep the image already baked for it rather than re-baking the tour.
        await prisma.twinWaypoint.update({ where: { id }, data });
        updated += 1;
      } else {
        await prisma.twinWaypoint.create({ data: { ...data, twinId: twin.id } });
        created += 1;
      }
    }

    const stale = existing.filter((w) => !WAYPOINTS.some((s) => s.label === w.label));
    if (stale.length) {
      // Reported rather than deleted. A stop this file does not know about is
      // as likely to be someone's work in progress as it is to be a leftover,
      // and a seed script is the wrong thing to be throwing either away.
      console.log(
        `Note: ${stale.length} stop(s) not in this seed and left untouched: ` +
          stale.map((w) => `"${w.label}"`).join(', '),
      );
    }

    console.log(
      `Seeded tour for ${property.name} / ${twin.label}: ` +
        `${created} created, ${updated} updated.`,
    );

    const unbaked = await prisma.twinWaypoint.count({
      where: { twinId: twin.id, panoramaUrl: null },
    });
    if (unbaked) {
      console.log(
        `${unbaked} stop(s) have no panorama. To render them:\n` +
          `  POST /api/properties/${PROPERTY_SLUG}/twin/${twin.id}/panoramas?stale=true`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`Tour seed failed: ${(err as Error).message}`);
  process.exit(1);
});
