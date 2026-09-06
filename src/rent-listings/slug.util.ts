import { PrismaService } from '../prisma/prisma.service.js';

/** Shared by developer and owner listing creation — one slug policy. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
}

export async function uniqueSlug(prisma: PrismaService, base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (await prisma.rentListing.findUnique({ where: { slug } })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}
