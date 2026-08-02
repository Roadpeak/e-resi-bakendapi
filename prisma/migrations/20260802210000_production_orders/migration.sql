-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductionOrder" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "preferredDate" TEXT,
    "instructions" TEXT,
    "accessInfo" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "crewNotes" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionOrder_propertyId_serviceKey_key" ON "ProductionOrder"("propertyId", "serviceKey");
CREATE INDEX IF NOT EXISTS "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX IF NOT EXISTS "ProductionOrder_propertyId_idx" ON "ProductionOrder"("propertyId");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
