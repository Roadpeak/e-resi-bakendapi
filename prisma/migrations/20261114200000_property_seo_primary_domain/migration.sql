-- Which address search engines treat as the original: e-resi.com (false) or the custom domain (true).
ALTER TABLE "Property" ADD COLUMN "seoPrimaryDomain" BOOLEAN NOT NULL DEFAULT false;
