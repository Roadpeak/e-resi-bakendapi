-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "domainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "domainError" TEXT,
ADD COLUMN     "domainExternalId" TEXT,
ADD COLUMN     "domainNameservers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "domainProvider" TEXT,
ADD COLUMN     "domainStatus" TEXT,
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3);

-- Domains attached before automation existed were connected by hand.
UPDATE "Property" SET "domainProvider" = 'MANUAL', "domainStatus" = 'MANUAL'
WHERE "customDomain" IS NOT NULL;
