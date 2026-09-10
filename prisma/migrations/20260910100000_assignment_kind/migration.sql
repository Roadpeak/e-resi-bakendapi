-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('SALE', 'RENT');

-- DropIndex
DROP INDEX "PropertyAssignment_partnershipId_propertyId_key";

-- AlterTable
ALTER TABLE "PropertyAssignment" ADD COLUMN     "kind" "AssignmentKind" NOT NULL DEFAULT 'SALE';

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAssignment_partnershipId_propertyId_kind_key" ON "PropertyAssignment"("partnershipId", "propertyId", "kind");

