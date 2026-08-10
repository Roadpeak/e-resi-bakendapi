-- Agents: letting/sales agents, either registered companies or individuals.
-- Additive throughout — no existing table or column is altered, so developer
-- and marketplace behaviour is untouched until agent features are used.

-- New role. Postgres cannot add an enum value inside a transaction that also
-- uses it, but Prisma runs each migration file in its own transaction and the
-- value is not referenced by DML here, so this is safe on its own.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AGENT';

CREATE TYPE "AgentKind" AS ENUM ('COMPANY', 'INDIVIDUAL');

CREATE TYPE "AgentSpecialty" AS ENUM (
    'APARTMENT_RENTAL',
    'APARTMENT_PURCHASE',
    'VILLA_RENTAL',
    'VILLA_PURCHASE',
    'COMMERCIAL_RENTAL',
    'COMMERCIAL_PURCHASE',
    'LAND_SALE'
);

CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AgentKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "logoUrl" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "yearsExperience" INTEGER,
    "website" TEXT,
    "specialties" "AgentSpecialty"[] DEFAULT ARRAY[]::"AgentSpecialty"[],
    "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kybStatus" "KybStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "kybDocuments" JSONB,
    "kybReviewedAt" TIMESTAMP(3),
    "kybReviewedBy" TEXT,
    "kybRejectionReason" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "officeAddress" TEXT,
    "location" TEXT,
    "socials" JSONB,
    "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentProfile_userId_key" ON "AgentProfile"("userId");
CREATE INDEX "AgentProfile_kybStatus_idx" ON "AgentProfile"("kybStatus");
CREATE INDEX "AgentProfile_kind_idx" ON "AgentProfile"("kind");
CREATE INDEX "AgentProfile_isListed_idx" ON "AgentProfile"("isListed");

ALTER TABLE "AgentProfile"
    ADD CONSTRAINT "AgentProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentReview" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentReview_pkey" PRIMARY KEY ("id")
);

-- One review per person per agent; editing replaces rather than stacks.
CREATE UNIQUE INDEX "AgentReview_agentId_authorId_key" ON "AgentReview"("agentId", "authorId");
CREATE INDEX "AgentReview_agentId_idx" ON "AgentReview"("agentId");

ALTER TABLE "AgentReview"
    ADD CONSTRAINT "AgentReview_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentReview"
    ADD CONSTRAINT "AgentReview_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
