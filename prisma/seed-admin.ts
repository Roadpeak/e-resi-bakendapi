/**
 * Seed (or repair) the superadmin account.
 *
 * Registration deliberately refuses role: ADMIN, so the first administrator has
 * to be created out of band. Run this once per environment:
 *
 *   ADMIN_EMAIL=info@e-resi.com ADMIN_PASSWORD='<from your secrets manager>' \
 *     npx tsx prisma/seed-admin.ts
 *
 * Idempotent: on an existing account it promotes to ADMIN and marks the email
 * verified, and only sets the password when ADMIN_PASSWORD is supplied. It
 * never prints the password.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const DEFAULT_EMAIL = 'info@e-resi.com';

/** Rejects the passwords people reach for when they're in a hurry. */
function assertStrong(password: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push('at least 12 characters');
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a digit');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');
  if (problems.length) {
    throw new Error(`ADMIN_PASSWORD needs ${problems.join(', ')}.`);
  }
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME ?? 'e-resi';
  const lastName = process.env.ADMIN_LAST_NAME ?? 'Admin';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing) {
      if (!password) {
        throw new Error(
          `No account for ${email}. Set ADMIN_PASSWORD to create it (it is never logged).`,
        );
      }
      assertStrong(password);

      await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash(password, 12),
          firstName,
          lastName,
          role: UserRole.ADMIN,
          // No inbox round-trip: this account has to be able to sign in
          // immediately, and SMTP may not be configured yet.
          emailVerified: true,
          isActive: true,
        },
      });
      console.log(`Created superadmin ${email}.`);
      return;
    }

    const data: Record<string, unknown> = {};
    if (existing.role !== UserRole.ADMIN) data.role = UserRole.ADMIN;
    if (!existing.emailVerified) data.emailVerified = true;
    if (!existing.isActive) {
      data.isActive = true;
      data.suspendedAt = null;
      data.suspendedReason = null;
    }
    if (password) {
      assertStrong(password);
      data.password = await bcrypt.hash(password, 12);
    }

    if (Object.keys(data).length === 0) {
      console.log(`${email} is already an active, verified admin. Nothing to do.`);
      return;
    }

    await prisma.user.update({ where: { email }, data });
    console.log(
      `Updated ${email}: ${Object.keys(data)
        .map((k) => (k === 'password' ? 'password reset' : k))
        .join(', ')}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`Seed failed: ${(err as Error).message}`);
  process.exit(1);
});
