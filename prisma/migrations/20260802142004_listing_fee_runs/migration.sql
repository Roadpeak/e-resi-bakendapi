-- CreateEnum
-- Guarded so the migration is safe to re-run after a partial failure.
DO $$ BEGIN
  CREATE TYPE "ListingFeeRunStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "ListingFeeRun" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "listingCount" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "ListingFeeRunStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paymentId" TEXT,
    "failureText" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "chargedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingFeeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingFeeRun_reference_key" ON "ListingFeeRun"("reference");

-- CreateIndex
CREATE INDEX "ListingFeeRun_status_idx" ON "ListingFeeRun"("status");

-- CreateIndex
CREATE INDEX "ListingFeeRun_period_idx" ON "ListingFeeRun"("period");

-- CreateIndex
CREATE UNIQUE INDEX "ListingFeeRun_developerId_period_key" ON "ListingFeeRun"("developerId", "period");

-- AddForeignKey
ALTER TABLE "ListingFeeRun" ADD CONSTRAINT "ListingFeeRun_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
