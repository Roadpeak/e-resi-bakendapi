-- AlterTable
ALTER TABLE "SiteVisit" ADD COLUMN     "host" TEXT,
ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "SiteVisit_propertyId_createdAt_idx" ON "SiteVisit"("propertyId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Past visits to e-resi.com/<slug>/… belong to that development.
UPDATE "SiteVisit" v SET "propertyId" = p."id"
FROM "Property" p
WHERE v."propertyId" IS NULL AND split_part(v."path", '/', 2) = p."slug";
