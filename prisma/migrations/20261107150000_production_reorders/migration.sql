-- DropIndex
DROP INDEX "ProductionOrder_propertyId_serviceKey_key";

-- CreateIndex
CREATE INDEX "ProductionOrder_propertyId_serviceKey_idx" ON "ProductionOrder"("propertyId", "serviceKey");

