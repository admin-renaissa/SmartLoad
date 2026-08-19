# SmartLoad RenVerse Documentation Index

Complete guide to SmartLoad **optional add-on** suite integration. Each file links to platform canons.

**Status:** Pack implementation-ready · **Product BLOCKER:** multi-tenant org (**EP-SL-01**) · **Policy:** optional add-on — **not** core Suite SKU.  
**Join:** [`76_SMARTLOAD_JOIN_GUIDE.md`](../../../docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md) · **Policy:** [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md) · **Tenancy:** [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md).

| File | Purpose | Audience |
|------|---------|----------|
| [00_SUITE_MEMBERSHIP.md](./00_SUITE_MEMBERSHIP.md) | Addon role; bans; tenancy blocker | Product, architects |
| [01_OIDC_INTEGRATION.md](./01_OIDC_INTEGRATION.md) | OIDC (operator dashboard) | Backend, DevOps |
| [02_TENANT_AND_USER_MAPPING.md](./02_TENANT_AND_USER_MAPPING.md) | **Org model + AppLink + JIT** | Backend, Data |
| [03_RBAC_MAPPING.md](./03_RBAC_MAPPING.md) | Suite floors → UserRole | Backend, Product |
| [04_EVENTS_PRODUCED.md](./04_EVENTS_PRODUCED.md) | `smartload.pod.confirmed.v1` | Backend, Connect |
| [05_EVENTS_CONSUMED.md](./05_EVENTS_CONSUMED.md) | `identity.*` only | Backend, Connect |
| [06_DEEP_LINKS.md](./06_DEEP_LINKS.md) | `shipment` + `/suite/open` | Frontend |
| [07_ISSA_TOOLS.md](./07_ISSA_TOOLS.md) | Manifest tools + persona | Backend, ISSA |
| [08_ENTITLEMENTS_AND_GATES.md](./08_ENTITLEMENTS_AND_GATES.md) | **`hasAddon('smartload')` only** | Backend, Frontend |
| [09_MIGRATION_RUNBOOK.md](./09_MIGRATION_RUNBOOK.md) | EP-SL-01 then EP-SL-02 | DevOps, leads |
| [10_LOCAL_DEV.md](./10_LOCAL_DEV.md) | Env, Tally on-prem, ports | Developers |
| [11_QA_CHECKLIST.md](./11_QA_CHECKLIST.md) | Addon deny + POD scenarios | QA |
| [12_DATABASE.md](./12_DATABASE.md) | Target org schema | Backend, Data |
| [13_BACKEND.md](./13_BACKEND.md) | `apps/api/src/renverse/` | Backend |
| [14_FRONTEND.md](./14_FRONTEND.md) | Addon gates + ban UX | Frontend |
| [15_RBAC.md](./15_RBAC.md) | Live UserRole catalog | Backend, Product |
| [16_PHASE_PLAN.md](./16_PHASE_PLAN.md) | Phase 6 optional addon | Product, leads |
| [17_SUITE_GA_BACKLOG.md](./17_SUITE_GA_BACKLOG.md) | **EP-SL-01 / EP-SL-02** | Engineering, PM |
| [18_GA_IMPLEMENTATION_SPECS.md](./18_GA_IMPLEMENTATION_SPECS.md) | **GA implement specs** (mirror) → platform `implement/EP-SMARTLOAD.md` | Engineers implementing GA |

## For a developer

- **Start here → [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)**

## Quick reference

1. **Never** require SmartLoad for Suite SKU — entitlement is `hasAddon('smartload')`, **not** `hasApp`
2. **EP-SL-01 first** — Multi-tenant org + addon gates on all APIs (BLOCKER)
3. **EP-SL-02** — Emit `smartload.pod.confirmed.v1` from product POD module → RenBooks
4. Tally bridge stays **on-prem** (`SMARTLOAD_TALLY_MODE=onprem`)
5. Ban: not full WMS / e-commerce / ERP — stay scan / dispatch / POD

**Developer path:** [10](./10_LOCAL_DEV.md) → [18_GA_IMPLEMENTATION_SPECS.md](./18_GA_IMPLEMENTATION_SPECS.md) / platform [`EP-SMARTLOAD.md`](../../../docs/revamp/110-program/implement/EP-SMARTLOAD.md) → [13](./13_BACKEND.md) / [14](./14_FRONTEND.md) → [11](./11_QA_CHECKLIST.md) → [09](./09_MIGRATION_RUNBOOK.md)

## Honest GA status

| Surface | Status | Epic |
|---------|--------|------|
| Multi-tenant org / AppLink | **BLOCKER** | EP-SL-01 |
| `hasAddon` on all suite APIs | Partial / target | EP-SL-01-2 |
| OIDC operator dashboard | Scaffold | EP-SL-01-3 |
| ISSA tools + persona | Not GA | EP-SL-01-4 |
| POD emit from product module | Smoke only | EP-SL-02 |
| E2E RenBooks consume POD | Blocked on SL-01 + RB-01 | EP-SL-02-2 |

Program hub: [`114_SUITE_GA_EXECUTION_PLAN.md`](../../../docs/revamp/110-program/114_SUITE_GA_EXECUTION_PLAN.md) · Owner stories: [`17_SUITE_GA_BACKLOG.md`](./17_SUITE_GA_BACKLOG.md) · E2E guide: [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)

## Cursor prompts (copy-paste)

Paste **one epic at a time** from `SmartLoad/` with RenVerse sibling open for contracts. Always read the E2E guide.

### EP-SL-01 — Multi-tenant org + addon gates (BLOCKER)

```
You are implementing RenVerse optional add-on integration for SmartLoad
(appKey: smartload, suiteRole: addon).

Read first:
- docs/renverse/README.md, 00, 02, 08, 12, 13, 15, 17_SUITE_GA_BACKLOG.md
- renverse.manifest.json (suiteRole addon, blockers, produces)
- docs/CODEBASE_GRAPH.md
- RenVerse docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md
- RenVerse docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md
- RenVerse docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md
- RenVerse docs/revamp/110-program/backlog/06_SMARTLOAD.md
- RenVerse docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md
- Live roles: packages/shared/src/types/enums.ts (UserRole)
- Scaffold: apps/api/src/renverse/

Epic EP-SL-01 (P2 · 21 SP):
1. SL-01-1: Org/site tenancy — Organization + OrgMembership; scope shipments/POD/scanners by orgId
2. SL-01-2: Gate ALL API routes with hasAddon('smartload') in suite mode (403 ADDON_NOT_ENABLED);
   core suite apps must work without SmartLoad
3. SL-01-3: Full OIDC + AppLink in product (apps/api/src/renverse/)
4. SL-01-4: ISSA tools smartload.shipment.get + smartload.pod.status + persona smartload.ops_assistant

Constraints: NEVER use hasApp('smartload'); do not weaken optional-addon policy;
no full WMS/ERP; Tally remains on-prem.
Update 02/08/12/13/CODEBASE_GRAPH. Output Change Summary per definition-of-done.
```

### EP-SL-02 — POD → RenBooks

```
SmartLoad EP-SL-02: POD confirmed → RenBooks.

Prerequisite: EP-SL-01 org tenancy + addon gates (or emit still scoped + flagged).

Read:
- docs/renverse/04_EVENTS_PRODUCED.md, 11, 13_BACKEND.md
- contracts/events/schemas/smartload.pod.confirmed.v1.json
- contracts/events/field-maps-smartload-renbooks.md
- RenVerse docs/revamp/40-connect/47_SYNC_PACK_SMARTLOAD_RENBOOKS.md
- RenVerse docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md
- apps/api/src/modules/pod/ + apps/api/src/renverse/emit-pod-confirmed.ts

1. SL-02-1: Emit smartload.pod.confirmed.v1 from real POD confirmation (atomic outbox),
   not smoke-only POST /renverse/shipments/:id/pod
2. SL-02-2: E2E with RenBooks consumer (depends EP-RB-01-4)

Do not invent smartload.delivery.completed.v1 — catalog/manifest use pod.confirmed only.
Stay scan/dispatch/POD. Update 04/11/CODEBASE_GRAPH. Output Change Summary.
```

## Canonical references

- **E2E implementation:** [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)
- **Policy:** [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md)
- **Join:** [`76_SMARTLOAD_JOIN_GUIDE.md`](../../../docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md)
- **Tenancy:** [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)
- **Events:** [`catalog.md`](../../../contracts/events/catalog.md)
- **SQL DDL:** [`010_app_renverse_addon.sql`](../../../contracts/sql/010_app_renverse_addon.sql)
- **GA:** [`06_SMARTLOAD.md`](../../../docs/revamp/110-program/backlog/06_SMARTLOAD.md)
- **Ecosystem hub:** [`ECOSYSTEM_GRAPH.md`](../../../docs/ECOSYSTEM_GRAPH.md)

---

*RenVerse · SmartLoad · 2026-08-19*
