-- CreateEnum
CREATE TYPE "ServiceCategoryType" AS ENUM ('CAPTURE', 'IMMERSIVE', 'MARKETING', 'DESIGN');

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "tier" "ProductionTierType" NOT NULL,
    "label" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "features" TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ServiceCategoryType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL DEFAULT 'general',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingPlan_tier_key" ON "PricingPlan"("tier");

-- CreateIndex
CREATE INDEX "PricingPlan_isActive_idx" ON "PricingPlan"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalogItem_key_key" ON "ServiceCatalogItem"("key");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_category_idx" ON "ServiceCatalogItem"("category");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_isActive_idx" ON "ServiceCatalogItem"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateIndex
CREATE INDEX "PlatformSetting_group_idx" ON "PlatformSetting"("group");
