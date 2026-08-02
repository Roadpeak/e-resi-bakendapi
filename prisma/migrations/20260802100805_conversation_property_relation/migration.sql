-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_rentListingId_fkey" FOREIGN KEY ("rentListingId") REFERENCES "RentListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
