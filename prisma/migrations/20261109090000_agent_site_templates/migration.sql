-- CreateEnum
CREATE TYPE "SiteTemplateTier" AS ENUM ('FREE', 'PREMIUM');

-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'AGENT_TEMPLATE';

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "siteSections" JSONB,
ADD COLUMN     "siteTemplate" TEXT NOT NULL DEFAULT 'CLASSIC';

-- CreateTable
CREATE TABLE "AgentSiteTemplate" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" "SiteTemplateTier" NOT NULL DEFAULT 'FREE',
    "unlockPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSiteTemplate_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AgentTemplateUnlock" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTemplateUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTemplateUnlock_templateKey_idx" ON "AgentTemplateUnlock"("templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplateUnlock_agentId_templateKey_key" ON "AgentTemplateUnlock"("agentId", "templateKey");

-- AddForeignKey
ALTER TABLE "AgentTemplateUnlock" ADD CONSTRAINT "AgentTemplateUnlock_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTemplateUnlock" ADD CONSTRAINT "AgentTemplateUnlock_templateKey_fkey" FOREIGN KEY ("templateKey") REFERENCES "AgentSiteTemplate"("key") ON DELETE CASCADE ON UPDATE CASCADE;

