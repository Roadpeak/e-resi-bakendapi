-- Mini-site customisation, second pass: navbar presentation and the hero
-- overlay toggle. Nullable/defaulted so existing developments render exactly
-- as before until a developer changes something.

ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "navbarStyle" TEXT,
  ADD COLUMN IF NOT EXISTS "navbarTheme" TEXT,
  -- Defaults true: the overlay is what keeps the overlaid status chips
  -- legible, so removing it is a deliberate choice, not the starting state.
  ADD COLUMN IF NOT EXISTS "heroOverlay" BOOLEAN NOT NULL DEFAULT true;
