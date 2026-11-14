-- Where playback starts when the browser could not trim the upload.
ALTER TABLE "Reel" ADD COLUMN "trimStartSec" DOUBLE PRECISION;
