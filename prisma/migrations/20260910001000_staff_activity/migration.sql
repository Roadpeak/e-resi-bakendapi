-- CreateTable
CREATE TABLE "StaffActivity" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "area" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffActivity_staffId_createdAt_idx" ON "StaffActivity"("staffId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffActivity" ADD CONSTRAINT "StaffActivity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "DeveloperStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

