-- AlterTable: staff may belong to an agency instead of a developer
ALTER TABLE "DeveloperStaff" ALTER COLUMN "developerId" DROP NOT NULL;
ALTER TABLE "DeveloperStaff" ADD COLUMN "agentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperStaff_agentId_email_key" ON "DeveloperStaff"("agentId", "email");

-- CreateIndex
CREATE INDEX "DeveloperStaff_agentId_idx" ON "DeveloperStaff"("agentId");

-- AddForeignKey
ALTER TABLE "DeveloperStaff" ADD CONSTRAINT "DeveloperStaff_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
