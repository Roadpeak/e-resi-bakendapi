-- Per-section copy overrides for the mini-site.
--
-- Nullable, and every field inside it optional: a development that has not set
-- any copy falls back to the template's own wording, so no live page changes
-- appearance because this column was added.
ALTER TABLE "Property" ADD COLUMN "sectionCopy" JSONB;
