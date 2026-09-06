-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "agentId" TEXT;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_agentId_propertyId_type_idx" ON "AnalyticsEvent"("agentId", "propertyId", "type");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

