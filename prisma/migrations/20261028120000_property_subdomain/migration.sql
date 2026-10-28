-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "subdomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Property_subdomain_key" ON "Property"("subdomain");

-- Every existing development gets <slug>.e-resi.com, where the slug is a
-- usable DNS label and not one of the addresses e-resi keeps for itself.
UPDATE "Property"
SET "subdomain" = "slug"
WHERE "slug" ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
  AND "slug" NOT IN (
    'www','app','api','admin','dashboard','mail','email','smtp','imap','pop','ftp','cdn','media',
    'static','assets','img','images','files','docs','help','support','status','blog','news',
    'staging','dev','test','qa','preview','beta','demo','auth','login','account','accounts',
    'billing','pay','payments','secure','domains','domain','e-resi','eresi','agent','agents',
    'developer','developers','m','ns1','ns2'
  );
