-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'DOMAIN';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "domainBillingMode" TEXT,
ADD COLUMN     "domainFee" DOUBLE PRECISION,
ADD COLUMN     "domainInvoiceId" TEXT,
ADD COLUMN     "domainPaidAt" TIMESTAMP(3),
ADD COLUMN     "domainPaidThrough" TIMESTAMP(3),
ADD COLUMN     "subdomainActivatedAt" TIMESTAMP(3),
ADD COLUMN     "subdomainInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "domainItem" TEXT;


-- Domains connected before billing existed keep working: treat them as paid.
UPDATE "Property" SET "domainBillingMode" = 'ONE_TIME', "domainFee" = 0, "domainPaidAt" = NOW()
WHERE "customDomain" IS NOT NULL;
