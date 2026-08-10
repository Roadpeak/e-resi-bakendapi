-- Developer↔agent partnerships, property assignments and shared agreements.
-- Additive only: no existing table or column is touched.

CREATE TYPE "PartnershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'ENDED');

CREATE TABLE "AgentPartnership" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "message" TEXT,
    "commissionPercent" DOUBLE PRECISION,
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPartnership_pkey" PRIMARY KEY ("id")
);

-- One partnership per pair: re-requesting reuses the row rather than stacking
-- duplicates that would each need answering.
CREATE UNIQUE INDEX "AgentPartnership_developerId_agentId_key"
    ON "AgentPartnership"("developerId", "agentId");
CREATE INDEX "AgentPartnership_status_idx" ON "AgentPartnership"("status");
CREATE INDEX "AgentPartnership_agentId_idx" ON "AgentPartnership"("agentId");

ALTER TABLE "AgentPartnership"
    ADD CONSTRAINT "AgentPartnership_developerId_fkey"
    FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentPartnership"
    ADD CONSTRAINT "AgentPartnership_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentPartnership"
    ADD CONSTRAINT "AgentPartnership_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PropertyAssignment" (
    "id" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "commissionPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyAssignment_pkey" PRIMARY KEY ("id")
);

-- Ending and reassigning reuses the row, so its history is not lost.
CREATE UNIQUE INDEX "PropertyAssignment_partnershipId_propertyId_key"
    ON "PropertyAssignment"("partnershipId", "propertyId");
CREATE INDEX "PropertyAssignment_propertyId_idx" ON "PropertyAssignment"("propertyId");
CREATE INDEX "PropertyAssignment_isActive_idx" ON "PropertyAssignment"("isActive");

ALTER TABLE "PropertyAssignment"
    ADD CONSTRAINT "PropertyAssignment_partnershipId_fkey"
    FOREIGN KEY ("partnershipId") REFERENCES "AgentPartnership"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyAssignment"
    ADD CONSTRAINT "PropertyAssignment_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PartnershipDocument" (
    "id" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnershipDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnershipDocument_partnershipId_idx" ON "PartnershipDocument"("partnershipId");

ALTER TABLE "PartnershipDocument"
    ADD CONSTRAINT "PartnershipDocument_partnershipId_fkey"
    FOREIGN KEY ("partnershipId") REFERENCES "AgentPartnership"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartnershipDocument"
    ADD CONSTRAINT "PartnershipDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
