-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WALK_IN', 'PHONE_CALL', 'REFERRAL', 'EVENT', 'SOCIAL_MEDIA', 'EMAIL', 'WEBSITE', 'AGENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "DeveloperLead" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "propertyId" TEXT,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "interest" TEXT,
    "budget" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperLead_developerId_createdAt_idx" ON "DeveloperLead"("developerId", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperLead_propertyId_idx" ON "DeveloperLead"("propertyId");

-- AddForeignKey
ALTER TABLE "DeveloperLead" ADD CONSTRAINT "DeveloperLead_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperLead" ADD CONSTRAINT "DeveloperLead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperLead" ADD CONSTRAINT "DeveloperLead_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

