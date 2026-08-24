-- RenVerse suite org tenancy (EP-SL-01) + Connect outbox markers
-- See contracts/sql/010_app_renverse_addon.sql and 152_SMARTLOAD_TENANCY_DESIGN.md

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "renverse_sub" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_renverse_sub_key" ON "users"("renverse_sub");

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "renverse_org_id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "books_mode" TEXT NOT NULL DEFAULT 'renbooks',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_renverse_org_id_key" ON "organizations"("renverse_org_id");
CREATE INDEX IF NOT EXISTS "organizations_site_id_idx" ON "organizations"("site_id");

CREATE TABLE IF NOT EXISTS "org_memberships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
  "renverse_suite_role" TEXT,
  "renverse_floor_role" TEXT,
  "renverse_department_id" TEXT,
  "renverse_team_ids" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "org_memberships_organization_id_user_id_key"
  ON "org_memberships"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "org_memberships_user_id_idx" ON "org_memberships"("user_id");

DO $$ BEGIN
  ALTER TABLE "org_memberships"
    ADD CONSTRAINT "org_memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "org_memberships"
    ADD CONSTRAINT "org_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "clients_organization_id_idx" ON "clients"("organization_id");
DO $$ BEGIN
  ALTER TABLE "clients"
    ADD CONSTRAINT "clients_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
CREATE INDEX IF NOT EXISTS "purchase_orders_organization_id_idx" ON "purchase_orders"("organization_id");
DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS renverse_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,
  org_id          TEXT NOT NULL,
  payload         JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS renverse_processed_events (
  event_id        TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS renverse_id_map_local (
  id              BIGSERIAL PRIMARY KEY,
  org_id          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  source_app      TEXT NOT NULL,
  source_id       TEXT NOT NULL,
  target_app      TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  UNIQUE (org_id, entity_type, source_app, source_id, target_app)
);
