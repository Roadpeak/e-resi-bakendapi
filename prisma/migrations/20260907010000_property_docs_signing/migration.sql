-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'UNIT_OWNERSHIP_GRANTED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_SHARED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "propertyId" TEXT,
ADD COLUMN     "requiresSignature" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Document_propertyId_idx" ON "Document"("propertyId");

-- CreateIndex
CREATE INDEX "Document_parentId_idx" ON "Document"("parentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

