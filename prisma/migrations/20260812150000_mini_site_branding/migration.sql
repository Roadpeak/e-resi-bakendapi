-- Mini-site branding: the public development page is the developer's own
-- sales site, so it carries their identity. Property-level values override
-- the developer defaults; everything is nullable so existing rows keep
-- rendering exactly as before until someone opts in.

ALTER TABLE "DeveloperProfile"
  ADD COLUMN IF NOT EXISTS "brandColor" TEXT,
  ADD COLUMN IF NOT EXISTS "brandFont"  TEXT;

ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "brandColor"     TEXT,
  ADD COLUMN IF NOT EXISTS "brandFont"      TEXT,
  ADD COLUMN IF NOT EXISTS "heroStyle"      TEXT,
  ADD COLUMN IF NOT EXISTS "sectionOrder"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "hiddenSections" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "ctaLabel"       TEXT,
  ADD COLUMN IF NOT EXISTS "customDomain"   TEXT,
  ADD COLUMN IF NOT EXISTS "whiteLabel"     BOOLEAN NOT NULL DEFAULT false;

-- Custom domains route requests, so collisions must be impossible.
CREATE UNIQUE INDEX IF NOT EXISTS "Property_customDomain_key"
  ON "Property"("customDomain");
