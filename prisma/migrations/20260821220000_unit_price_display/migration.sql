-- Per-unit-type price presentation for a development's mini-site.
-- Nullable and unread by any existing query, so this is additive: properties
-- that never set it fall back to the frontend's default ("from").
ALTER TABLE "Property" ADD COLUMN "unitPriceDisplay" JSONB;
