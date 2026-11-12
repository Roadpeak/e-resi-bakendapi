-- CreateEnum
CREATE TYPE "PartnerInviteKind" AS ENUM ('AGENT', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "PartnerInviteStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "PartnerInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PartnerInviteKind" NOT NULL,
    "status" "PartnerInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "message" TEXT NOT NULL,
    "agentKind" "AgentKind",
    "referrer" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "signedUpAt" TIMESTAMP(3),
    "signedUpUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerInvite_code_key" ON "PartnerInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerInvite_signedUpUserId_key" ON "PartnerInvite"("signedUpUserId");

-- CreateIndex
CREATE INDEX "PartnerInvite_referrer_idx" ON "PartnerInvite"("referrer");

-- CreateIndex
CREATE INDEX "PartnerInvite_kind_status_idx" ON "PartnerInvite"("kind", "status");

-- CreateIndex
CREATE INDEX "PartnerInvite_createdAt_idx" ON "PartnerInvite"("createdAt");

-- AddForeignKey
ALTER TABLE "PartnerInvite" ADD CONSTRAINT "PartnerInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerInvite" ADD CONSTRAINT "PartnerInvite_signedUpUserId_fkey" FOREIGN KEY ("signedUpUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
