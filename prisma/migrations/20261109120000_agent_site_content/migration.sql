-- CreateEnum
CREATE TYPE "AgentSiteItemType" AS ENUM ('TEAM', 'TESTIMONIAL', 'PAST_SALE', 'FAQ', 'SERVICE', 'STEP', 'POST', 'AWARD');

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "siteFooterNote" TEXT,
ADD COLUMN     "siteLicenceNo" TEXT;

-- CreateTable
CREATE TABLE "AgentSiteItem" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentSiteItemType" NOT NULL,
    "data" JSONB NOT NULL,
    "slug" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSiteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSiteItem_agentId_type_sortOrder_idx" ON "AgentSiteItem"("agentId", "type", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSiteItem_agentId_slug_key" ON "AgentSiteItem"("agentId", "slug");

-- AddForeignKey
ALTER TABLE "AgentSiteItem" ADD CONSTRAINT "AgentSiteItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

