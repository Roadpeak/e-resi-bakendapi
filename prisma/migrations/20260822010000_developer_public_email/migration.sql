-- Public sales email for a developer's profile page.
-- Nullable and additive: profiles that never set one simply do not show it.
ALTER TABLE "DeveloperProfile" ADD COLUMN "email" TEXT;
