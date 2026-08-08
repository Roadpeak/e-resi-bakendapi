-- AlterTable
ALTER TABLE "DeveloperProfile"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "socials" JSONB;
