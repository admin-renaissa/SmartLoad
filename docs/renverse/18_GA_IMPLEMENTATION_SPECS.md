Prefer [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for follow-along; this file mirrors platform epic IDs.

# GA Implementation Specs — SmartLoad (mirror)

> **Canonical (full):** [RenVerse `implement/EP-SMARTLOAD.md`](../../../docs/revamp/110-program/implement/EP-SMARTLOAD.md)  
> **Cross-app:** [`EP-CROSS_APP.md`](../../../docs/revamp/110-program/implement/EP-CROSS_APP.md) (as applicable)  
> **Backlog:** [`17_SUITE_GA_BACKLOG.md`](./17_SUITE_GA_BACKLOG.md) · Platform [`06_SMARTLOAD.md`](../../../docs/revamp/110-program/backlog/06_SMARTLOAD.md)  
> **E2E:** [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)  
> **Addon policy:** [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md)  
> **Tenancy:** [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)

## Goal

**Optional add-on** readiness: multi-tenant org + **`hasAddon('smartload')`** everywhere; POD emit from product module → RenBooks.

**Never** use `hasApp('smartload')`. Core Suite SKU must work without SmartLoad.

## Honest status

| Surface | Status |
|---------|--------|
| Multi-tenant org | ❌ BLOCKER (EP-SL-01) |
| Addon API gates | Partial / target |
| POD emit | Smoke `apps/api/src/renverse/emit-pod-confirmed.ts` — not product GA |
| Tally | On-prem only |

## Stories (IDs)

| Epic | IDs |
|------|-----|
| EP-SL-01 | SL-01-1 … SL-01-4 |
| EP-SL-02 | SL-02-1 … SL-02-2 |

## App-local primary paths

| Work | Path |
|------|------|
| Renverse | `apps/api/src/renverse/` |
| POD emit helper | `apps/api/src/renverse/emit-pod-confirmed.ts` |
| Product POD | `apps/api/src/modules/pod/` |
| DB / roles | `packages/db`, `packages/shared/src/types/enums.ts` |
| Manifest | `renverse.manifest.json` (`suiteRole: addon`) |

## Contracts

- Emit: `smartload.pod.confirmed.v1`
- Field map: `field-maps-smartload-renbooks.md` · sync pack `47`
- ISSA: `smartload.shipment.get`, `smartload.pod.status` · persona `smartload.ops_assistant`
- Entitlement: JWT `addons[]` / `hasAddon('smartload')`

## Depends

- E2E POD → RenBooks needs **EP-RB-01-4** consume
- Prefer EP-SL-01 before claiming SL-02 GA

## Acceptance / DoD

Full checklists: platform **EP-SMARTLOAD.md**.

- [ ] Org/site tenancy + AppLink
- [ ] 403 without addon; launcher tile only when entitled
- [ ] OIDC + ISSA tools
- [ ] Product POD → Connect emit; E2E with RenBooks
- [ ] Ban: no full WMS/ERP; Tally on-prem
- [ ] Pack `00`/`02`/`04`/`08`/`11`–`13` + graph updated

## Pack chapters

`00` · `02` · `04` · `07` · `08` · `09` · `11` · `12` · `13` · `17`

---

*Mirror · SmartLoad · 2026-08-19 — full detail in platform EP-SMARTLOAD.md*
