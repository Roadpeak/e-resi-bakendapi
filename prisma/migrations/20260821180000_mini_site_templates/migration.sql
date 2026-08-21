-- Mini-site template selection.
--
-- Nullable on purpose: an existing development has not chosen one, and NULL
-- resolves to CLASSIC at render — the layout it already has. Nobody's live
-- page changes appearance because this column was added.
ALTER TABLE "Property" ADD COLUMN "templateKey" TEXT;

-- Developer-level default, inherited by that developer's developments unless
-- one of them overrides it.
ALTER TABLE "DeveloperProfile" ADD COLUMN "templateKey" TEXT;
