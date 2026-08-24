-- Scanner org scope + backfill legacy rows onto a default suite org
ALTER TABLE "scanner_devices" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "scanner_devices_organization_id_idx" ON "scanner_devices"("organization_id");

DO $$ BEGIN
  ALTER TABLE "scanner_devices"
    ADD CONSTRAINT "scanner_devices_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure a default org exists for legacy single-tenant data
INSERT INTO "organizations" ("id", "name", "renverse_org_id", "site_id", "books_mode", "createdAt", "updatedAt")
SELECT
  'org_local_default',
  'Default SmartLoad org',
  COALESCE(NULLIF(current_setting('app.renverse_default_org', true), ''), 'org_demo00000001'),
  'site_default',
  'renbooks',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "organizations" LIMIT 1);

-- If orgs already exist but default missing, still create demo-linked org for backfill
INSERT INTO "organizations" ("id", "name", "renverse_org_id", "site_id", "books_mode", "createdAt", "updatedAt")
SELECT
  'org_local_default',
  'Default SmartLoad org',
  'org_demo00000001',
  'site_org_demo00000001',
  'renbooks',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = 'org_local_default')
  AND NOT EXISTS (SELECT 1 FROM "organizations" WHERE "renverse_org_id" = 'org_demo00000001');

-- Backfill clients / POs / scanners onto first org (prefer org_local_default)
UPDATE "clients" c
SET "organization_id" = COALESCE(
  (SELECT id FROM "organizations" WHERE id = 'org_local_default'),
  (SELECT id FROM "organizations" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE c."organization_id" IS NULL;

UPDATE "purchase_orders" po
SET "organization_id" = COALESCE(
  (SELECT c."organization_id" FROM "clients" c WHERE c.id = po."clientId"),
  (SELECT id FROM "organizations" WHERE id = 'org_local_default'),
  (SELECT id FROM "organizations" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE po."organization_id" IS NULL;

UPDATE "scanner_devices" s
SET "organization_id" = COALESCE(
  (SELECT id FROM "organizations" WHERE id = 'org_local_default'),
  (SELECT id FROM "organizations" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE s."organization_id" IS NULL;
