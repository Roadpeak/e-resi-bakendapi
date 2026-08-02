-- AlterTable
ALTER TABLE "RentUnit" ADD COLUMN     "show3DTour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showCinematicTour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showVRTour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitId" TEXT,
ADD COLUMN     "unitType" TEXT;

-- CreateIndex
CREATE INDEX "RentUnit_unitId_idx" ON "RentUnit"("unitId");

-- AddForeignKey
ALTER TABLE "RentUnit" ADD CONSTRAINT "RentUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
