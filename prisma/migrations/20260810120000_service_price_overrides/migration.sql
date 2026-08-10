-- Per-property-type pricing for production services.
-- Additive only: no override rows means every service keeps using its existing
-- ServiceCatalogItem.price, so pricing behaviour is unchanged until an admin
-- sets a type-specific price.

CREATE TABLE "ServicePriceOverride" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "propertyType" "PropertyCategory" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePriceOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServicePriceOverride_serviceId_propertyType_key"
    ON "ServicePriceOverride"("serviceId", "propertyType");

CREATE INDEX "ServicePriceOverride_propertyType_idx"
    ON "ServicePriceOverride"("propertyType");

ALTER TABLE "ServicePriceOverride"
    ADD CONSTRAINT "ServicePriceOverride_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalogItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
