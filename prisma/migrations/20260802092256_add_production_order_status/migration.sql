-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('ORDERED', 'SCHEDULED', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ProductionTier" ADD COLUMN     "crewNotes" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "orderStatus" "ProductionOrderStatus" NOT NULL DEFAULT 'ORDERED',
ADD COLUMN     "scheduledAt" TIMESTAMP(3);
