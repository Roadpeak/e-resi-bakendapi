-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "unitId" TEXT;

-- CreateIndex
CREATE INDEX "MediaAsset_unitId_idx" ON "MediaAsset"("unitId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

