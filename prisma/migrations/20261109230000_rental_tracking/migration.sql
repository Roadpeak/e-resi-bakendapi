-- AlterEnum
ALTER TYPE "AnalyticsEventType" ADD VALUE 'CONTACT_CLICK';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "rentListingId" TEXT;

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "rentListingId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_rentListingId_idx" ON "Booking"("rentListingId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_rentListingId_type_createdAt_idx" ON "AnalyticsEvent"("rentListingId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_rentListingId_fkey" FOREIGN KEY ("rentListingId") REFERENCES "RentListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_rentListingId_fkey" FOREIGN KEY ("rentListingId") REFERENCES "RentListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

