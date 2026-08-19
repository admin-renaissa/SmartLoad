# Database — SmartLoad

SmartLoad owns ops SoR (shipments, POD, scan, stock modules). Suite columns are **nullable add-ons** — standalone must keep working.

**Canon DDL:** [`contracts/sql/010_app_renverse_addon.sql`](../../../contracts/sql/010_app_renverse_addon.sql)  
**Tenancy design:** [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)  
**Prisma:** `packages/db/prisma/schema.prisma` (+ `migrations/`)

## Existing SoR — do not move

| Domain | Local tables / modules | Not SoR here |
|--------|------------------------|--------------|
| Shipments / POD | `modules/pod`, shipments | RenBooks invoices |
| Scan / dispatch | `modules/scan`, `dispatch` | Renexus work items |
| Stock / barcode | `modules/inventory` (within ban) | Full WMS/ERP |
| Vehicles / devices | `modules/vehicles`, `devices` | — |
| Counterparties | `Client` | Suite org (Identity) |
| Tally bridge | `apps/tally-bridge` (on-prem) | Cloud suite dependency |

## Current vs target (EP-SL-01)

| Today | Target |
|-------|--------|
| Global users + `UserRole` | `organizations` + `org_memberships` |
| Site-centric without suite org | Org owns sites / shipments (`organization_id`) |
| Suite smoke in `renverse.routes` | DB AppLink `organizations.renverse_org_id` |
| Counterparty `Client` confused with tenant | `Client` stays counterparty; suite tenant = org |

## Suite columns (purpose)

| Column | Table | Purpose |
|--------|-------|---------|
| `renverse_sub` | `users` | Identity subject |
| `renverse_org_id` | `organizations` | AppLink to Identity org |
| `renverse_suite_role` | `org_memberships` | Last seen suite floor |
| `renverse_floor_role` | `org_memberships` | Mapped local floor |
| `renverse_department_id` / `renverse_team_ids` | memberships | Directory hints only |
| `organization_id` | shipments, pod, … | Tenant scope |

## DDL sketch

```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  renverse_org_id TEXT UNIQUE,
  books_mode TEXT DEFAULT 'renbooks', -- or 'tally'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL, -- ADMIN|SUPERVISOR|OPERATOR|ACCOUNTS|DRIVER|CLIENT
  renverse_suite_role TEXT,
  renverse_floor_role TEXT,
  renverse_department_id TEXT,
  renverse_team_ids JSONB NOT NULL DEFAULT '[]',
  disabled_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS renverse_sub TEXT UNIQUE;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS shipments_org_idx ON shipments (organization_id);

-- Apply same org FK pattern to pod, scan_sessions, devices, sites per 152
```

## Outbox + processed events

```sql
CREATE TABLE IF NOT EXISTS renverse_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  org_id TEXT NOT NULL,          -- Identity org id on envelope
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS renverse_outbox_unpublished_idx
  ON renverse_outbox (created_at) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS renverse_processed_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Table | Purpose |
|-------|---------|
| `renverse_outbox` | Same-txn POD emit → Connect relay |
| `renverse_processed_events` | Identity consume idempotency |

## Optional local IdMap cache

```sql
CREATE TABLE IF NOT EXISTS renverse_id_map_local (
  id BIGSERIAL PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  source_app TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_app TEXT NOT NULL,
  target_id TEXT NOT NULL,
  UNIQUE (org_id, entity_type, source_app, source_id, target_app)
);
```

Semantics: cache only — Connect IdMap remains SoR for cross-app ids.

## Migrations layout

```
packages/db/prisma/
  schema.prisma
  migrations/
    <timestamp>_renverse_org_tenancy/
    <timestamp>_renverse_outbox/
```

Never edit a migration that may already be applied — add a follow-up.

## Rules

- No platform Identity / Billing / Connect DB migrations from this app  
- No cross-app DB reads (RenBooks, etc.)  
- Entitlement remains **addon-only** (not a DB flag that replaces JWT)  
- Nullable suite columns for standalone  

## Ban

Do not grow schema into full WMS/ERP (ASN waves, slotting engines, multi-warehouse ERP). Stay scan / dispatch / POD (+ existing stock within policy).

---

*RenVerse · SmartLoad Database · 2026-08-19*
