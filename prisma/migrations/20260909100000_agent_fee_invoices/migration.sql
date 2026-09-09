-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "agentFeeRunId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_agentFeeRunId_key" ON "Invoice"("agentFeeRunId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_agentFeeRunId_fkey" FOREIGN KEY ("agentFeeRunId") REFERENCES "AgentFeeRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

