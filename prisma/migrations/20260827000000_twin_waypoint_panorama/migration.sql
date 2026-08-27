-- A 360° image rendered from a waypoint, so the viewer can stand inside a
-- photograph rather than fly a camera between rooms.
ALTER TABLE "TwinWaypoint" ADD COLUMN "panoramaUrl" TEXT;
ALTER TABLE "TwinWaypoint" ADD COLUMN "panoramaAt" TIMESTAMP(3);
