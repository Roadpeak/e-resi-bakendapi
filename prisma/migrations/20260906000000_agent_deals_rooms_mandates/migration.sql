-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('LEAD', 'VIEWING', 'RESERVED', 'SPA_SIGNED', 'COMPLETED', 'LOST');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('NONE', 'ACCRUED', 'DUE', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MandateRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DEAL_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'MANDATE_UPDATED';

-- DropIndex
DROP INDEX "Booking_agentId_idx";

-- DropIndex
DROP INDEX "Inquiry_agentId_idx";

-- DropIndex
DROP INDEX "Reservation_agentId_idx";

-- AlterTable
ALTER TABLE "AgentProfile" ADD COLUMN     "closedVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dealsCompleted" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "specialties" DROP DEFAULT,
ALTER COLUMN "serviceAreas" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Property" ALTER COLUMN "features" DROP DEFAULT,
ALTER COLUMN "sectionOrder" DROP DEFAULT,
ALTER COLUMN "hiddenSections" DROP DEFAULT,
ALTER COLUMN "unitFeatures" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "partnershipId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "stage" "DealStage" NOT NULL DEFAULT 'LEAD',
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lostReason" TEXT,
    "inquiryId" TEXT,
    "bookingId" TEXT,
    "reservationId" TEXT,
    "saleValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "commissionPercent" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "commissionStatus" "CommissionStatus" NOT NULL DEFAULT 'NONE',
    "commissionDueAt" TIMESTAMP(3),
    "commissionPaidAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRoom" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRoomItem" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "ClientRoomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRoomView" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "propertyId" TEXT,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRoomView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" "MandateStatus" NOT NULL DEFAULT 'OPEN',
    "maxAgents" INTEGER,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateRequest" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "message" TEXT,
    "status" "MandateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MandateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_inquiryId_key" ON "Deal"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_bookingId_key" ON "Deal"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_reservationId_key" ON "Deal"("reservationId");

-- CreateIndex
CREATE INDEX "Deal_agentId_stage_idx" ON "Deal"("agentId", "stage");

-- CreateIndex
CREATE INDEX "Deal_developerId_stage_idx" ON "Deal"("developerId", "stage");

-- CreateIndex
CREATE INDEX "Deal_partnershipId_idx" ON "Deal"("partnershipId");

-- CreateIndex
CREATE INDEX "Deal_commissionStatus_idx" ON "Deal"("commissionStatus");

-- CreateIndex
CREATE INDEX "DealEvent_dealId_idx" ON "DealEvent"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRoom_token_key" ON "ClientRoom"("token");

-- CreateIndex
CREATE INDEX "ClientRoom_agentId_idx" ON "ClientRoom"("agentId");

-- CreateIndex
CREATE INDEX "ClientRoomItem_roomId_idx" ON "ClientRoomItem"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRoomItem_roomId_propertyId_key" ON "ClientRoomItem"("roomId", "propertyId");

-- CreateIndex
CREATE INDEX "ClientRoomView_roomId_idx" ON "ClientRoomView"("roomId");

-- CreateIndex
CREATE INDEX "Mandate_status_idx" ON "Mandate"("status");

-- CreateIndex
CREATE INDEX "Mandate_developerId_idx" ON "Mandate"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_propertyId_key" ON "Mandate"("propertyId");

-- CreateIndex
CREATE INDEX "MandateRequest_agentId_idx" ON "MandateRequest"("agentId");

-- CreateIndex
CREATE INDEX "MandateRequest_mandateId_status_idx" ON "MandateRequest"("mandateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MandateRequest_mandateId_agentId_key" ON "MandateRequest"("mandateId", "agentId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_partnershipId_fkey" FOREIGN KEY ("partnershipId") REFERENCES "AgentPartnership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealEvent" ADD CONSTRAINT "DealEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRoom" ADD CONSTRAINT "ClientRoom_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRoomItem" ADD CONSTRAINT "ClientRoomItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ClientRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRoomItem" ADD CONSTRAINT "ClientRoomItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRoomView" ADD CONSTRAINT "ClientRoomView_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ClientRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateRequest" ADD CONSTRAINT "MandateRequest_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateRequest" ADD CONSTRAINT "MandateRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

