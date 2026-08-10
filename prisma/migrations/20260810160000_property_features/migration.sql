-- On-site amenities for a development (pool, gym, borehole, backup generator).
-- Distinct from the Amenity table, which holds nearby landmarks the
-- development does not own and carries a distance to each.
--
-- The frontend has always read property.features; the column simply never
-- existed, so it was permanently undefined. Additive with a default, so
-- existing rows are unaffected.

ALTER TABLE "Property"
    ADD COLUMN "features" TEXT[] DEFAULT ARRAY[]::TEXT[];
