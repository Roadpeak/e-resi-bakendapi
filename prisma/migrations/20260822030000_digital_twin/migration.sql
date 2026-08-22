-- Real building geometry for the 3D tour: a glTF binary plus the waypoints and
-- tags placed against it. Additive — properties without a twin are unaffected.

CREATE TABLE "DigitalTwin" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "meshUrl" TEXT NOT NULL,
    "proxyUrl" TEXT,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scaleVerified" BOOLEAN NOT NULL DEFAULT false,
    "triangles" INTEGER,
    "fileSizeBytes" INTEGER,
    "originX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floors" TEXT[],
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DigitalTwin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalTwin_propertyId_key" ON "DigitalTwin"("propertyId");

CREATE TABLE "TwinWaypoint" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "caption" TEXT,
    "route" TEXT,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "posZ" DOUBLE PRECISION NOT NULL,
    "lookX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lookY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lookZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinWaypoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TwinWaypoint_twinId_idx" ON "TwinWaypoint"("twinId");

CREATE TABLE "TwinTag" (
    "id" TEXT NOT NULL,
    "twinId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "posZ" DOUBLE PRECISION NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwinTag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TwinTag_twinId_idx" ON "TwinTag"("twinId");

ALTER TABLE "DigitalTwin" ADD CONSTRAINT "DigitalTwin_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwinWaypoint" ADD CONSTRAINT "TwinWaypoint_twinId_fkey"
    FOREIGN KEY ("twinId") REFERENCES "DigitalTwin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwinTag" ADD CONSTRAINT "TwinTag_twinId_fkey"
    FOREIGN KEY ("twinId") REFERENCES "DigitalTwin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
