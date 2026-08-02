-- AlterEnum
-- Split into its own migration: Postgres cannot use a new enum value in the
-- same transaction that adds it, and the next migration references it.
-- IF NOT EXISTS keeps this idempotent across environments where it already ran.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PAYSTACK_CARD';
