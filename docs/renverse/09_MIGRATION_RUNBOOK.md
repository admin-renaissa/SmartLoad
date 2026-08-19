# Migration Runbook — SmartLoad

Ordered go-live. **EP-SL-01 (tenancy + addon gates) before treating suite join as GA.** EP-SL-02 (POD → RenBooks) follows. See E2E guide: [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md).

## Phase 0 — Platform prerequisites

- [ ] RenIdentity, RenConnect, RenBilling operational
- [ ] Pack `docs/renverse/` + root `renverse.manifest.json` present
- [ ] Policy sign-off: optional addon — Suite SKU works with SmartLoad off
- [ ] Tenancy design vs [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)

## Phase A — EP-SL-01 (BLOCKER)

### A1. Database

```sql
-- Target sketch — apply via packages/db/prisma migrations (do not edit applied migrations)

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
  role TEXT NOT NULL, -- UserRole enum
  renverse_suite_role TEXT,
  renverse_floor_role TEXT,
  renverse_department_id TEXT,
  renverse_team_ids JSONB NOT NULL DEFAULT '[]',
  disabled_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS renverse_sub TEXT UNIQUE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id);
-- Repeat org FK for pod, scan sessions, devices, sites as designed in 152

CREATE TABLE IF NOT EXISTS renverse_outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  org_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS renverse_processed_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Also align with [`010_app_renverse_addon.sql`](../../../contracts/sql/010_app_renverse_addon.sql).

### A2. Backend

1. Install / link `@renverse/auth-sdk`, `@renverse/suite-oidc-adapter`, `@renverse/connect-sdk`
2. Mount `apps/api/src/renverse/renverse.routes.ts` from `apps/api/src/server.ts`
3. Middleware order: auth → **`hasAddon('smartload')`** → resolve `orgId` → `can` / `in_scope`
4. Gate **all** suite module routes (`modules/scan`, `dispatch`, `pod`, …) — SL-01-2
5. JIT + AppLink for operator dashboard — SL-01-3
6. ISSA callbacks — SL-01-4 (`issa-tools.ts`)
7. `GET /renverse/status` returns addon role + blockers

### A3. Env (staging)

```bash
RENVERSE_MODE=suite
RENVERSE_APP_KEY=smartload
RENVERSE_OIDC_ISSUER=https://identity.staging.example
RENVERSE_OIDC_CLIENT_ID=smartload
RENVERSE_OIDC_REDIRECT_URI=https://smartload.staging.example/renverse/auth/callback
RENVERSE_CONNECT_URL=https://connect.staging.example
CONNECT_SERVICE_TOKEN=***
RENVERSE_FLAGS=renverse.connect.emit,renverse.connect.consume
SMARTLOAD_TALLY_MODE=onprem
```

### A4. AppLink (ops)

```sql
-- Identity org → SmartLoad organization
UPDATE organizations
SET renverse_org_id = 'org_identity_abc'
WHERE id = 'org_local_xyz';
```

### A5. Validate EP-SL-01

- [ ] Suite JWT without `smartload` addon → `ADDON_NOT_ENABLED`
- [ ] Cross-org shipment IDOR denied
- [ ] Core suite apps work with SmartLoad off
- [ ] Clear tenancy blocker in `renverse.manifest.json` when verified
- [ ] Update [02](./02_TENANT_AND_USER_MAPPING.md) / [12](./12_DATABASE.md) / app `CODEBASE_GRAPH.md`

## Phase B — EP-SL-02 (POD → RenBooks)

1. Wire `apps/api/src/modules/pod/` → outbox `smartload.pod.confirmed.v1` (same txn)
2. Outbox worker publishes to Connect
3. E2E with RenBooks consumer (depends EP-RB-01-4)
4. QA rows in [11_QA_CHECKLIST.md](./11_QA_CHECKLIST.md)

## Phase C — UI / dual-mode

1. Operator web: suite login + addon denial copy ([14](./14_FRONTEND.md))
2. Launcher: tile only when `hasAddon`
3. Driver handheld: may stay offline / non-OIDC for MVP

## Phase D — Canary → ramp

1. Pilot org with addon SKU  
2. Confirm POD → RenBooks cost path  
3. Ramp; monitor outbox lag / DLQ  

## Tally

Keep `SMARTLOAD_TALLY_MODE=onprem`. Do not force cloud Tally as suite dependency.

## Publish pack branch

```bash
# from RenVerse root
./scripts/push-app-renverse-branch.sh publish --apps SmartLoad
```

## Rollback

```bash
RENVERSE_MODE=standalone
# or disable addon in RenBilling — Suite SKU unaffected
```

- Disable suite mode / addon feature flag  
- Core suite apps unaffected  
- Local scan/POD continue  

## Remaining GA (do not mark complete early)

| Item | Epic |
|------|------|
| Multi-tenant org incomplete | EP-SL-01 |
| Product POD emit | EP-SL-02 |
| RenBooks consume wire | EP-SL-02 + EP-RB-01 |

---

*RenVerse · SmartLoad Migration · 2026-08-19*
