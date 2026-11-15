-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('SUBMITTED', 'QUOTED', 'CHANGES_REQUESTED', 'ACCEPTED', 'PAID', 'IN_PRODUCTION', 'DELIVERED', 'DECLINED', 'CANCELLED');
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_REQUEST_UPDATED';
-- AlterEnum
ALTER TYPE "InvoiceKind" ADD VALUE 'SERVICE_REQUEST';
-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "userId" TEXT NOT NULL,
    "requesterType" TEXT NOT NULL,
    "services" TEXT[],
    "otherService" TEXT,
    "propertyType" "PropertyCategory",
    "location" TEXT NOT NULL,
    "address" TEXT,
    "preferredDate" TIMESTAMP(3),
    "timing" TEXT,
    "scope" TEXT,
    "budget" TEXT,
    "details" TEXT NOT NULL,
    "contactPhone" TEXT,
    "quoteNumber" TEXT,
    "quoteVersion" INTEGER NOT NULL DEFAULT 0,
    "quoteLines" JSONB,
    "quoteSubtotal" DOUBLE PRECISION,
    "quoteTaxPercent" DOUBLE PRECISION,
    "quoteTaxAmount" DOUBLE PRECISION,
    "quoteTotal" DOUBLE PRECISION,
    "quoteCurrency" TEXT,
    "quoteNotes" TEXT,
    "quoteValidUntil" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "quotedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "changeRequest" TEXT,
    "changesRequestedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ServiceRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceRequestEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_number_key" ON "ServiceRequest"("number");
-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_invoiceId_key" ON "ServiceRequest"("invoiceId");
-- CreateIndex
CREATE INDEX "ServiceRequest_userId_idx" ON "ServiceRequest"("userId");
-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");
-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");
-- CreateIndex
CREATE INDEX "ServiceRequestEvent_requestId_createdAt_idx" ON "ServiceRequestEvent"("requestId", "createdAt");
-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ServiceRequestEvent" ADD CONSTRAINT "ServiceRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
