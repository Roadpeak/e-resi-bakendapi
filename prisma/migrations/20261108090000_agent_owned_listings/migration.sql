-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "developerName" TEXT,
ADD COLUMN     "listedByAgentId" TEXT,
ADD COLUMN     "mandateDocUrl" TEXT,
ADD COLUMN     "marketingAuthorityConfirmed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "developerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Property_listedByAgentId_idx" ON "Property"("listedByAgentId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_listedByAgentId_fkey" FOREIGN KEY ("listedByAgentId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exactly one owner per development: a developer or an agent.
ALTER TABLE "Property" ADD CONSTRAINT "Property_single_owner_chk"
  CHECK (("developerId" IS NOT NULL) <> ("listedByAgentId" IS NOT NULL));
