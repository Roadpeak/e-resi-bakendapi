-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "description" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL;

