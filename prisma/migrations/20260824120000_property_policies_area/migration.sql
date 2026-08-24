-- Unit-level facilities, kept apart from the development's own.
ALTER TABLE "Property" ADD COLUMN "unitFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- House rules. Nullable throughout: "not stated" and "not allowed" are
-- different answers, and a default would publish the wrong one.
ALTER TABLE "Property" ADD COLUMN "petsAllowed" BOOLEAN;
ALTER TABLE "Property" ADD COLUMN "petPolicy" TEXT;
ALTER TABLE "Property" ADD COLUMN "leaseTerms" TEXT;

-- The neighbourhood in the developer's own words.
ALTER TABLE "Property" ADD COLUMN "areaDescription" TEXT;
