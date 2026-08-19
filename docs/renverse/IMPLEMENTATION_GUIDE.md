# SmartLoad — RenVerse Complete Implementation Guide

> **Open this file first.** Follow steps in order. Links go deeper; you do not need to hunt for other entry points.
>
> | | |
> |--|--|
> | **appKey** | `smartload` |
> | **SoR** | Ops stock, barcode dispatch, POD |
> | **suiteRole** | **Optional add-on** — `hasAddon('smartload')` only · **not** `hasApp('smartload')` · **not** core Suite SKU |
> | **Manifest** | [`../../renverse.manifest.json`](../../renverse.manifest.json) |
> | **Host** | `smartload.renaissa.ai` (product) · suite-host smoke `:9203` |

**Platform epic canon:** [`EP-SMARTLOAD.md`](../../../docs/revamp/110-program/implement/EP-SMARTLOAD.md) · **Backlog:** [`17_SUITE_GA_BACKLOG.md`](./17_SUITE_GA_BACKLOG.md) · **Cursor prompts:** [`README.md#cursor-prompts-copy-paste`](./README.md#cursor-prompts-copy-paste)

> **Order locked:** **EP-SL-01 before EP-SL-02.** Entitlement is **`hasAddon('smartload')` only**.

**Policy (locked):** [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md)  
**Tenancy:** [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)  
**Ban:** No full WMS / ERP / e-commerce — stay scan + dispatch + POD. Tally stays on-prem (`SMARTLOAD_TALLY_MODE=onprem`).

---

## 0. Prerequisites

- [ ] Nested under RenVerse (`RenVerse/SmartLoad/`) **or** sibling contracts / packages / revamp access
- [ ] Join guide: [`76_SMARTLOAD_JOIN_GUIDE.md`](../../../docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md)
- [ ] Core suite apps must work **without** SmartLoad enabled
- [ ] Do not invent events — POD event already in catalog

### Local stack

```bash
./run-renverse.sh start
```

| Service | Port (typical) |
|---------|----------------|
| RenIdentity | `9100` |
| Connect | `9110` |
| ISSA | `9120` |
| Suite-host SmartLoad | `9203` |

| Link | Why |
|------|-----|
| [`10_LOCAL_DEV.md`](./10_LOCAL_DEV.md) | Env, Tally on-prem, ports |
| [`126`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md) | POD → RenBooks |
| [`ECOSYSTEM_GRAPH.md`](../../../docs/ECOSYSTEM_GRAPH.md) | Optional addon edges |
| Addon policy | [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md) |

---

## 1. Read map (5 minutes)

| Doc | Skim for |
|-----|----------|
| [`00_SUITE_MEMBERSHIP.md`](./00_SUITE_MEMBERSHIP.md) | Addon role + bans |
| [`01_OIDC_INTEGRATION.md`](./01_OIDC_INTEGRATION.md) | OIDC (operator dashboard) |
| [`08_ENTITLEMENTS_AND_GATES.md`](./08_ENTITLEMENTS_AND_GATES.md) | **`hasAddon` only** |
| [`15_RBAC.md`](./15_RBAC.md) | UserRole catalog |
| [`17_SUITE_GA_BACKLOG.md`](./17_SUITE_GA_BACKLOG.md) | EP-SL stories |
| [`18_GA_IMPLEMENTATION_SPECS.md`](./18_GA_IMPLEMENTATION_SPECS.md) | Epic mirror |
| [`../CODEBASE_GRAPH.md`](../CODEBASE_GRAPH.md) | Wiring honesty |
| [`../../renverse.manifest.json`](../../renverse.manifest.json) | produces / tools |

---

## 2. Honest status (what is already done vs open)

| Surface | Status (2026-08) |
|---------|------------------|
| Multi-tenant org / AppLink | ❌ **BLOCKER** |
| `hasAddon('smartload')` on all APIs | Partial / target |
| OIDC operator dashboard | Scaffold under `apps/api/src/renverse/` |
| ISSA tools + persona | Not GA |
| POD emit | Smoke: `emit-pod-confirmed.ts` + `POST /renverse/shipments/:id/pod` — not product POD module GA |
| RenBooks POD consume | Depends EP-RB-01-4 |
| Tally | Stays on-prem |

### Optional addon policy (non-negotiable)

| Rule | Implication |
|------|-------------|
| Not core Suite SKU | Core apps must work without SmartLoad |
| Entitlement | **`hasAddon('smartload')` only** — never `hasApp('smartload')` |
| Launcher | Tile only when addon entitled |
| Sync pack 47 | Optional; after core packs |
| Messaging | Suite story needs no “Ship” |

---

## 3. Implementation order (do in sequence)

### Phase 1 — EP-SL-01: Multi-tenant org + addon gates (P2 · 21 SP)

**Goal:** Org/site tenancy + `hasAddon` on all suite APIs + OIDC/AppLink + ISSA tools.

**Stories:** SL-01-1 … SL-01-4  
**Blocks:** Meaningful EP-SL-02 GA and RenBooks POD E2E. Must **not** block core Suite SKU release.

#### Primary file paths

| Area | Path |
|------|------|
| Renverse scaffold | `apps/api/src/renverse/renverse.routes.ts` |
| POD emit helper | `apps/api/src/renverse/emit-pod-confirmed.ts` (+ `.test.ts`) |
| DB packages | `packages/db` (+ API modules) |
| Roles | `packages/shared/src/types/enums.ts` (`UserRole`) |
| Pack | [`02`](./02_TENANT_AND_USER_MAPPING.md) · [`08`](./08_ENTITLEMENTS_AND_GATES.md) · [`12`](./12_DATABASE.md) · [`13`](./13_BACKEND.md) · [`15`](./15_RBAC.md) |

#### Contracts

| Artifact | Link |
|----------|------|
| Addon SQL markers | [`010_app_renverse_addon.sql`](../../../contracts/sql/010_app_renverse_addon.sql) |
| Auth SDK | `packages/auth-sdk` — `hasAddon('smartload')` |
| Billing claims | `addons[]` in JWT / `billing.entitlements.updated.v1` |
| Dual mode | [`dual-mode.md`](../../../contracts/flags/dual-mode.md) |
| Tenancy design | [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md) |

#### Acceptance checklist (inline from EP-SMARTLOAD)

**SL-01-1 — Tenancy**

- [ ] Organization + OrgMembership (or equivalent per `152`)
- [ ] Shipments / POD / scanners scoped by `orgId`
- [ ] AppLink-compatible org mapping

**SL-01-2 — Addon entitlement**

- [ ] **403** when org lacks `addons[]` smartload (e.g. `ADDON_NOT_ENABLED`)
- [ ] Core suite apps work without SmartLoad enabled
- [ ] Launcher shows addon tile only when entitled
- [ ] **Never** gate with `hasApp('smartload')`

**SL-01-3 — OIDC**

- [ ] Full OIDC + AppLink in product `apps/api/src/renverse/`
- [ ] Dual-mode standalone preserved

**SL-01-4 — ISSA**

- [ ] Tools: `smartload.shipment.get`, `smartload.pod.status`
- [ ] Persona: `smartload.ops_assistant`
- [ ] Local RBAC on callbacks; mutating tools → SmartLoad API only

#### Pack chapters

[`00`](./00_SUITE_MEMBERSHIP.md) · [`02`](./02_TENANT_AND_USER_MAPPING.md) · [`08`](./08_ENTITLEMENTS_AND_GATES.md) · [`12`](./12_DATABASE.md) · [`13`](./13_BACKEND.md) · [`15`](./15_RBAC.md) · [`07`](./07_ISSA_TOOLS.md)

#### Cursor prompt

[`README.md` → EP-SL-01](./README.md#ep-sl-01--multi-tenant-org--addon-gates-blocker)

---

### Phase 2 — EP-SL-02: POD → RenBooks product wire (**after EP-SL-01** · P2 · 8 SP)

**Goal:** Emit `smartload.pod.confirmed.v1` from the **product** POD module; E2E with RenBooks consumer.

**Stories:** SL-02-1 … SL-02-2  
**Depends:** EP-SL-01 preferred; **EP-RB-01-4** RenBooks consume for E2E complete

#### Primary file paths

| Area | Path |
|------|------|
| Product POD module | `apps/api/src/modules/pod/` (`pod.routes.ts`, `pod-pdf.service.ts`, …) |
| Emit helper | `apps/api/src/renverse/emit-pod-confirmed.ts` |
| Smoke route (replace as SoR path) | `POST /renverse/shipments/:id/pod` → wire real POD confirm |

#### Contracts

| Artifact | Link |
|----------|------|
| Event | [`smartload.pod.confirmed.v1.json`](../../../contracts/events/schemas/smartload.pod.confirmed.v1.json) |
| Field map | [`field-maps-smartload-renbooks.md`](../../../contracts/events/field-maps-smartload-renbooks.md) |
| Sync pack | [`47_SYNC_PACK_SMARTLOAD_RENBOOKS.md`](../../../docs/revamp/40-connect/47_SYNC_PACK_SMARTLOAD_RENBOOKS.md) |

#### Acceptance checklist

**SL-02-1 — Product emit**

- [ ] POD confirm in product module inserts outbox / calls emit helper atomically
- [ ] Schema-valid `smartload.pod.confirmed.v1`
- [ ] Idempotency key stable on shipment/POD version
- [ ] Flag-gated; Connect down does not break POD CRUD

**SL-02-2 — E2E**

- [ ] With RenBooks **EP-RB-01-4** consumer: finance receipt/link when sales order mapped
- [ ] Document product URLs (not suite-host-only)

#### Pack chapters

[`04_EVENTS_PRODUCED.md`](./04_EVENTS_PRODUCED.md) · [`13_BACKEND.md`](./13_BACKEND.md) · [`11_QA_CHECKLIST.md`](./11_QA_CHECKLIST.md)

#### Cursor prompt

[`README.md` → EP-SL-02](./README.md#ep-sl-02--pod--renbooks)

---

## 4. Cross-app (SAML / migration) — short

Canon: [`EP-CROSS_APP.md`](../../../docs/revamp/110-program/implement/EP-CROSS_APP.md)

- [ ] Operator dashboard login participates in dual-mode / EP-X-01 as applicable (addon; dual-mode)
- [ ] No per-app enterprise SAML after Identity for suite orgs
- [ ] Update [`09_MIGRATION_RUNBOOK.md`](./09_MIGRATION_RUNBOOK.md) when migration UX lands
- [ ] Core suite smoke **without** SmartLoad must remain green

---

## 5. Verify complete (Definition of Done)

- [ ] Addon policy unbroken (`hasAddon` only)
- [ ] Tenancy + OIDC in product (EP-SL-01)
- [ ] POD emit from product module (EP-SL-02)
- [ ] Pack 00/02/04/08/11/12/13 + graph updated
- [ ] Platform [`06_SMARTLOAD.md`](../../../docs/revamp/110-program/backlog/06_SMARTLOAD.md) + app [`17`](./17_SUITE_GA_BACKLOG.md) updated
- [ ] No full WMS/ERP scope creep; Tally remains on-prem
- [ ] Policy: core suite smoke **without** SmartLoad still green
- [ ] E2E POD → RenBooks per [`126`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)

---

## 6. Publish

```bash
./scripts/push-app-renverse-branch.sh publish --apps SmartLoad
```

---

## 7. Deep links / contracts index

| Kind | Links |
|------|-------|
| Pack | [`00`](./00_SUITE_MEMBERSHIP.md) … [`18`](./18_GA_IMPLEMENTATION_SPECS.md) · [`README`](./README.md) |
| Platform | [`EP-SMARTLOAD.md`](../../../docs/revamp/110-program/implement/EP-SMARTLOAD.md) · [`EP-CROSS_APP.md`](../../../docs/revamp/110-program/implement/EP-CROSS_APP.md) · [`114`](../../../docs/revamp/110-program/114_SUITE_GA_EXECUTION_PLAN.md) · [`126`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md) |
| Policy / join | [`07 addon policy`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md) · [`152`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md) · [`76`](../../../docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md) |
| Contracts | [`catalog.md`](../../../contracts/events/catalog.md) · [`deeplink/`](../../../contracts/deeplink/) · [`smartload.pod.confirmed.v1.json`](../../../contracts/events/schemas/smartload.pod.confirmed.v1.json) |

---

*SmartLoad · follow-along guide · 2026-08-19*
