-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "unitTypeId" TEXT;

-- AlterTable
ALTER TABLE "RentListing" ADD COLUMN     "listedByAgentId" TEXT,
ALTER COLUMN "developerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "unitTypeId" TEXT;

-- CreateTable
CREATE TABLE "UnitType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "sqm" DOUBLE PRECISION,
    "sqft" DOUBLE PRECISION,
    "priceFrom" DOUBLE PRECISION,
    "priceTo" DOUBLE PRECISION,
    "features" TEXT[],
    "floorPlanUrl" TEXT,
    "coverImageUrl" TEXT,
    "availableCount" INTEGER NOT NULL DEFAULT 0,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "cinematicSceneIds" TEXT[],
    "tourSection3DIds" TEXT[],
    "vrSceneIds" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitType_propertyId_idx" ON "UnitType"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_unitTypeId_idx" ON "Unit"("unitTypeId");

-- CreateIndex
CREATE INDEX "RentListing_listedByAgentId_idx" ON "RentListing"("listedByAgentId");

-- CreateIndex
CREATE INDEX "MediaAsset_unitTypeId_idx" ON "MediaAsset"("unitTypeId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitType" ADD CONSTRAINT "UnitType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentListing" ADD CONSTRAINT "RentListing_listedByAgentId_fkey" FOREIGN KEY ("listedByAgentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

