-- Monthly listing fee for agents. Additive only.
--
-- Mirrors ListingFeeRun rather than sharing it: an agent's fee is flat and
-- differs by kind, whereas a developer's scales with live developments, so a
-- shared table would carry a listingCount that means nothing for half the rows.

CREATE TABLE "AgentFeeRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "ListingFeeRunStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paymentId" TEXT,
    "failureText" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "chargedAt" TIMESTAMP(3),
    -- Nothing is delisted before this, so one failed charge never silently
    -- removes a paying agent from the directory.
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentFeeRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentFeeRun_reference_key" ON "AgentFeeRun"("reference");
-- One run per agent per month; reruns update rather than duplicate.
CREATE UNIQUE INDEX "AgentFeeRun_agentId_period_key" ON "AgentFeeRun"("agentId", "period");
CREATE INDEX "AgentFeeRun_status_idx" ON "AgentFeeRun"("status");

ALTER TABLE "AgentFeeRun"
    ADD CONSTRAINT "AgentFeeRun_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
