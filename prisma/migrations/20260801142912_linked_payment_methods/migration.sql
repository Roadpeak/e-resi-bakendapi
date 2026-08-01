-- CreateEnum
CREATE TYPE "LinkedMethodType" AS ENUM ('CARD', 'PAYPAL');

-- CreateTable
CREATE TABLE "LinkedPaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LinkedMethodType" NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "paypalEmail" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedPaymentMethod_userId_idx" ON "LinkedPaymentMethod"("userId");

-- AddForeignKey
ALTER TABLE "LinkedPaymentMethod" ADD CONSTRAINT "LinkedPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
