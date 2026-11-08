-- CreateEnum
CREATE TYPE "AgentSiteLeadType" AS ENUM ('CONTACT', 'VALUATION', 'VIEWING', 'CAREER', 'NEWSLETTER');

-- AlterEnum
ALTER TYPE "AgentSiteItemType" ADD VALUE 'ROLE';

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "siteForms" JSONB;

-- CreateTable
CREATE TABLE "AgentSiteLead" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentSiteLeadType" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "propertyId" TEXT,
    "slotAt" TIMESTAMP(3),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSiteLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSiteLead_agentId_createdAt_idx" ON "AgentSiteLead"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSiteLead_agentId_type_slotAt_idx" ON "AgentSiteLead"("agentId", "type", "slotAt");

-- AddForeignKey
ALTER TABLE "AgentSiteLead" ADD CONSTRAINT "AgentSiteLead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSiteLead" ADD CONSTRAINT "AgentSiteLead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

