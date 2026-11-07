-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'WAIVED';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedById" TEXT,
ADD COLUMN     "waiverReason" TEXT;

