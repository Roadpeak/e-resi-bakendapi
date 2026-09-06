-- CreateEnum
CREATE TYPE "RentManagerKind" AS ENUM ('OWNER', 'DEVELOPER', 'AGENT');

-- CreateEnum
CREATE TYPE "LettingStatus" AS ENUM ('PENDING', 'ACTIVE', 'DECLINED', 'ENDED');

-- AlterTable
ALTER TABLE "RentListing" ADD COLUMN     "managerKind" "RentManagerKind" NOT NULL DEFAULT 'DEVELOPER',
ADD COLUMN     "managingAgentId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "unitOwnershipId" TEXT;

-- CreateTable
CREATE TABLE "UnitOwnership" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "reservationId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LettingEngagement" (
    "id" TEXT NOT NULL,
    "rentListingId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "LettingStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LettingEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitOwnership_unitId_key" ON "UnitOwnership"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOwnership_reservationId_key" ON "UnitOwnership"("reservationId");

-- CreateIndex
CREATE INDEX "UnitOwnership_ownerId_idx" ON "UnitOwnership"("ownerId");

-- CreateIndex
CREATE INDEX "LettingEngagement_agentId_status_idx" ON "LettingEngagement"("agentId", "status");

-- CreateIndex
CREATE INDEX "LettingEngagement_rentListingId_idx" ON "LettingEngagement"("rentListingId");

-- CreateIndex
CREATE UNIQUE INDEX "LettingEngagement_rentListingId_agentId_key" ON "LettingEngagement"("rentListingId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "RentListing_unitOwnershipId_key" ON "RentListing"("unitOwnershipId");

-- AddForeignKey
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LettingEngagement" ADD CONSTRAINT "LettingEngagement_rentListingId_fkey" FOREIGN KEY ("rentListingId") REFERENCES "RentListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LettingEngagement" ADD CONSTRAINT "LettingEngagement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LettingEngagement" ADD CONSTRAINT "LettingEngagement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentListing" ADD CONSTRAINT "RentListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentListing" ADD CONSTRAINT "RentListing_managingAgentId_fkey" FOREIGN KEY ("managingAgentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentListing" ADD CONSTRAINT "RentListing_unitOwnershipId_fkey" FOREIGN KEY ("unitOwnershipId") REFERENCES "UnitOwnership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

