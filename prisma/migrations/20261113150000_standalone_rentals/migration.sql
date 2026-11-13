-- Standalone rentals: a rent listing no longer needs a development.
ALTER TABLE "RentListing" DROP CONSTRAINT "RentListing_propertyId_fkey";
ALTER TABLE "RentListing" ALTER COLUMN "propertyId" DROP NOT NULL;
ALTER TABLE "RentListing" ADD CONSTRAINT "RentListing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RentListing" ADD COLUMN "category" "PropertyCategory";
ALTER TABLE "RentListing" ADD COLUMN "hideExactLocation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RentListing" ADD COLUMN "features" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A viewing booked on a standalone rental has no development to point at.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_propertyId_fkey";
ALTER TABLE "Booking" ALTER COLUMN "propertyId" DROP NOT NULL;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
