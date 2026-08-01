-- CreateEnum
CREATE TYPE "MethodVerification" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterEnum
ALTER TYPE "LinkedMethodType" ADD VALUE 'MPESA';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYPAL';

-- AlterTable
ALTER TABLE "LinkedPaymentMethod" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "cardholderName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "mpesaPhone" TEXT,
ADD COLUMN     "paypalAgreementId" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "processorRef" TEXT,
ADD COLUMN     "verification" "MethodVerification" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
