-- CreateEnum
CREATE TYPE "ListingPlan" AS ENUM ('MONTHLY', 'ONE_TIME');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PropertyStatus" ADD VALUE 'PENDING_PAYMENT';
ALTER TYPE "PropertyStatus" ADD VALUE 'PAUSED';

-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'LISTING';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "listingGraceEndsAt" TIMESTAMP(3),
ADD COLUMN     "listingInvoiceId" TEXT,
ADD COLUMN     "listingOneTimePaidAt" TIMESTAMP(3),
ADD COLUMN     "listingPaidThrough" TIMESTAMP(3),
ADD COLUMN     "listingPendingPlan" "ListingPlan",
ADD COLUMN     "listingPendingPlanAt" TIMESTAMP(3),
ADD COLUMN     "listingPlan" "ListingPlan",
ADD COLUMN     "listingPlanOverride" "ListingPlan";


-- Existing live developer listings move to per-listing monthly billing on
-- 1 Dec 2026: November is still charged in arrears by the old run, and their
-- first per-listing cycle falls due on the 1st.
UPDATE "Property"
   SET "listingPlan" = 'MONTHLY', "listingPaidThrough" = TIMESTAMP '2026-12-01 00:00:00'
 WHERE "status" IN ('ACTIVE', 'OFF_PLAN', 'SOLD_OUT') AND "developerId" IS NOT NULL;
