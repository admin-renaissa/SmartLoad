# Codebase graph

> Last updated: 2026-08-19 — RenVerse pack expanded to implementation-ready; EP-SL-01 tenancy + addon policy documented  
> Hub: RenVerse `docs/ECOSYSTEM_GRAPH.md`

## Suite bridge

| Field | Value |
|-------|-------|
| appKey | `smartload` |
| displayName | SmartLoad |
| suiteRole | **`addon`** (optional — not core Suite SKU) |
| SoR | Ops stock, barcode scan, dispatch, POD |
| tenantKey | `orgId` (**target**; BLOCKER until EP-SL-01) |
| host | `smartload.renaissa.ai` |
| contractsVersion | `1.0.0` |
| hub | RenVerse `docs/ECOSYSTEM_GRAPH.md` |
| pack | `docs/renverse/` |
| manifest | `renverse.manifest.json` |
| blocker | Multi-tenant org incomplete; suite smoke via `apps/api/src/renverse/` · Tally on-prem |

### Membership

- Modes: `RENVERSE_MODE=standalone|suite` + `RENVERSE_APP_KEY=smartload`
- Entitlement: **`hasAddon('smartload')`** — never `hasApp`
- Health: `GET /renverse/status` · POD smoke: `POST /renverse/shipments/:id/pod`
- Tally: `SMARTLOAD_TALLY_MODE=onprem`
- Policy: RenVerse `docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`
- Join guide: `docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md`
- Tenancy design: `docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md`

### Events produced / consumed

| Direction | Event | Peer |
|-----------|-------|------|
| Out | `smartload.pod.confirmed.v1` | RenBooks |
| In | `identity.user.provisioned.v1`, `identity.membership.changed.v1` | Identity |

### ISSA

| Tool / persona | Mutates? | Local permission |
|----------------|----------|------------------|
| `smartload.shipment.get` | no | `shipment:read` |
| `smartload.pod.status` | no | `pod:read` |
| persona `smartload.ops_assistant` | — | — |

### Deep links

| type | Native route |
|------|----------------|
| `shipment` | `/suite/open?type=shipment` → shipment / POD view |

### Bans (this app)

- No full WMS/ERP/e-commerce — stay scan + dispatch + POD  
- Optional add-on only — Suite SKU must work without SmartLoad  
- ISSA tools → this app API only · No cross-app DB · Tally on-prem

### Spoke map

Local features → sections below. Pack Cursor prompts: `docs/renverse/README.md` (EP-SL-01, EP-SL-02).

---

## Repo map

| Path | Role |
|------|------|
| `apps/web` | Vite + React UI |
| `apps/api` | API (`src/modules/*`, workers) |
| `apps/api/src/renverse/` | Suite addon OIDC + status + POD emit |
| `apps/tally-bridge` | Tally integration bridge (on-prem) |
| `packages/db`, `shared`, `ui` | Shared packages (`UserRole` in `packages/shared`) |
| `docs/renverse/` | Suite pack (00–17) |
| `.cursor/rules/` | Suite + DoD/testing/security baseline |

## Features

| Feature | UI (`apps/web/src/pages`) | API (`apps/api/src/modules`) |
|---------|---------------------------|------------------------------|
| Auth / users | `login`, `users` | `auth`, `users` |
| Dashboard | `dashboard` | `dashboard` |
| Products / barcode catalog | `products` | `products` |
| Inventory / stock | `inventory` | `inventory` |
| Orders | `orders` | `orders` |
| Scan | `scan` | `scan` |
| Dispatch | `dispatch` | `dispatch` |
| Vehicles / devices | `vehicles`, `devices` | `vehicles`, `devices` |
| POD | `pod` | `pod` → emit `pod.confirmed` |
| Clients | `clients` | `clients` |
| Tally | `tally` | `tally` + `apps/tally-bridge` |
| Reports / audit / settings | `reports`, `audit`, `settings` | `reports`, `audit`, `settings` |
| Suite (scaffold) | — | `apps/api/src/renverse/*` |

## Frontend hot paths

- Router: `apps/web/src/App.tsx`
- Pages: `apps/web/src/pages/{scan,dispatch,pod,inventory,…}`

## Backend hot paths

- Server: `apps/api/src/server.ts`
- RenVerse: `apps/api/src/renverse/renverse.routes.ts`, `emit-pod-confirmed.ts`
- Modules: `apps/api/src/modules/*`
- Workers: `apps/api/src/workers/`

## Edges

```mermaid
flowchart LR
  Web --> API
  API --> DB[(orgId DB target)]
  Scan --> Dispatch --> POD
  POD -->|pod.confirmed| RenBooks
  TallyBridge[apps/tally-bridge] --> API
  Identity -->|identity.*| API
```

## Hotspots

- `apps/api/src/renverse/` (EP-SL-01 OIDC/org; EP-SL-02 product POD wire)
- `apps/api/src/modules/{scan,dispatch,pod,inventory,tally}`
- `apps/web/src/pages/{scan,dispatch,pod,inventory}`
- `apps/tally-bridge/`
- `docs/renverse/` · GA: `17_SUITE_GA_BACKLOG.md`
'''

