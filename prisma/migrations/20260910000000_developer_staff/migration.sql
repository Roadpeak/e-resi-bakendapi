-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "DeveloperStaff" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "pages" TEXT[],
    "status" "StaffStatus" NOT NULL DEFAULT 'INVITED',
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperStaff_userId_key" ON "DeveloperStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperStaff_inviteToken_key" ON "DeveloperStaff"("inviteToken");

-- CreateIndex
CREATE INDEX "DeveloperStaff_developerId_idx" ON "DeveloperStaff"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperStaff_developerId_email_key" ON "DeveloperStaff"("developerId", "email");

-- AddForeignKey
ALTER TABLE "DeveloperStaff" ADD CONSTRAINT "DeveloperStaff_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperStaff" ADD CONSTRAINT "DeveloperStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

