-- Generalise conversations from customer-to-developer to any two parties.
--
-- Agents talk to tenants, investors and developers, so the party columns can
-- no longer be named after one role. Renames preserve the data in place —
-- every existing conversation and message survives, and no row is rewritten:
--   customerId  -> initiatorId    (whoever started the thread)
--   developerId -> counterpartyId (whoever was contacted)
--
-- Postgres carries indexes and foreign keys through a column rename, so the
-- constraints below only cover the names, plus the new agentId context.

ALTER TABLE "Conversation" RENAME COLUMN "customerId" TO "initiatorId";
ALTER TABLE "Conversation" RENAME COLUMN "developerId" TO "counterpartyId";

-- Keep constraint and index names matching their columns, so future
-- migrations and error messages line up with the schema.
ALTER TABLE "Conversation"
    RENAME CONSTRAINT "Conversation_customerId_fkey" TO "Conversation_initiatorId_fkey";
ALTER TABLE "Conversation"
    RENAME CONSTRAINT "Conversation_developerId_fkey" TO "Conversation_counterpartyId_fkey";

ALTER INDEX "Conversation_customerId_idx" RENAME TO "Conversation_initiatorId_idx";
ALTER INDEX "Conversation_developerId_idx" RENAME TO "Conversation_counterpartyId_idx";

-- Context for agent conversations: an enquiry to an agent is about the agent,
-- not a listing, so it needs its own anchor to stay a single thread.
ALTER TABLE "Conversation" ADD COLUMN "agentId" TEXT;

ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- The uniqueness rule now includes the agent context. Dropped and recreated
-- rather than renamed, because its column list changes.
--
-- Postgres truncates generated identifiers at 63 characters, so the original
-- index is "…rentListingI_key", not the full column list. Dropping the
-- untruncated name would silently match nothing and leave the old constraint
-- enforcing renamed columns.
DROP INDEX IF EXISTS "Conversation_customerId_developerId_propertyId_rentListingI_key";

-- Named explicitly and kept short for the same reason: left to Prisma this
-- would generate a name over the limit and be truncated unpredictably.
CREATE UNIQUE INDEX "Conversation_parties_context_key"
    ON "Conversation"("initiatorId", "counterpartyId", "propertyId", "rentListingId", "agentId");
