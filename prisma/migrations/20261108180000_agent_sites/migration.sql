-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'AGENT_SITE';

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "siteAccent" TEXT,
ADD COLUMN     "siteActivatedAt" TIMESTAMP(3),
ADD COLUMN     "siteCustomDomain" TEXT,
ADD COLUMN     "siteDomainCheckedAt" TIMESTAMP(3),
ADD COLUMN     "siteDomainError" TEXT,
ADD COLUMN     "siteDomainExternalId" TEXT,
ADD COLUMN     "siteDomainInvoiceId" TEXT,
ADD COLUMN     "siteDomainNameservers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "siteDomainPaidAt" TIMESTAMP(3),
ADD COLUMN     "siteDomainProvider" TEXT,
ADD COLUMN     "siteDomainStatus" TEXT,
ADD COLUMN     "siteHandle" TEXT,
ADD COLUMN     "siteHeroUrl" TEXT,
ADD COLUMN     "siteInvoiceId" TEXT,
ADD COLUMN     "siteTagline" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_siteHandle_key" ON "AgentProfile"("siteHandle");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_siteCustomDomain_key" ON "AgentProfile"("siteCustomDomain");

