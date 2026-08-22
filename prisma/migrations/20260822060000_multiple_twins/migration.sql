-- Several models per property: the whole building, a show unit, the amenity
-- deck, each unit type. A buyer picks which one to tour rather than being
-- given a single capture of everything.

CREATE TYPE "TwinKind" AS ENUM ('BUILDING', 'UNIT', 'AMENITY', 'ROOM');

ALTER TABLE "DigitalTwin" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'Full building';
ALTER TABLE "DigitalTwin" ADD COLUMN "kind" "TwinKind" NOT NULL DEFAULT 'BUILDING';
ALTER TABLE "DigitalTwin" ADD COLUMN "posterUrl" TEXT;
ALTER TABLE "DigitalTwin" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DigitalTwin" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Whatever exists today is that property's primary model.
UPDATE "DigitalTwin" SET "isPrimary" = true;

-- One model per property was the old constraint; several is the point now.
DROP INDEX IF EXISTS "DigitalTwin_propertyId_key";
CREATE INDEX "DigitalTwin_propertyId_idx" ON "DigitalTwin"("propertyId");
