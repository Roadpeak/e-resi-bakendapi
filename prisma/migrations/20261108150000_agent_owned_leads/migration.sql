-- AlterTable
ALTER TABLE "DeveloperLead" ADD COLUMN     "ownerAgentId" TEXT,
ALTER COLUMN "developerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DeveloperLead_ownerAgentId_createdAt_idx" ON "DeveloperLead"("ownerAgentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeveloperLead" ADD CONSTRAINT "DeveloperLead_ownerAgentId_fkey" FOREIGN KEY ("ownerAgentId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One owner per hand-added lead.
ALTER TABLE "DeveloperLead" ADD CONSTRAINT "DeveloperLead_single_owner_chk" CHECK (("developerId" IS NOT NULL) <> ("ownerAgentId" IS NOT NULL));
