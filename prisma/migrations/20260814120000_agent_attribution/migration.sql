-- Agent attribution on leads, plus the inquiry → conversation link.
--
-- A partnered agent had no way to prove they introduced anyone, which is the
-- one thing both sides need to see. All columns are nullable: existing leads
-- simply have no attributed agent, which is accurate rather than a guess.
--
-- SetNull, not Cascade: removing an agent must never delete a developer's
-- bookings, inquiries or reservations.

ALTER TABLE "Inquiry"
  ADD COLUMN IF NOT EXISTS "agentId" TEXT,
  ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "agentId" TEXT;

ALTER TABLE "Reservation"
  ADD COLUMN IF NOT EXISTS "agentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Inquiry_agentId_idx"     ON "Inquiry"("agentId");
CREATE INDEX IF NOT EXISTS "Booking_agentId_idx"     ON "Booking"("agentId");
CREATE INDEX IF NOT EXISTS "Reservation_agentId_idx" ON "Reservation"("agentId");
