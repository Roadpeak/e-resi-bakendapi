-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifyToken" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetExpiry" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT;
