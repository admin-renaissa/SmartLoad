# QA Checklist — SmartLoad

Use with [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md). Mark EP-SL-01 suite rows **blocked** until tenancy ships.

## Pre-flight

- [ ] `renverse.manifest.json`: `suiteRole: addon`; produces only `smartload.pod.confirmed.v1`
- [ ] Pack links policy `07` + tenancy `152`
- [ ] Migrations / Prisma schema reviewed for org scoping ([12](./12_DATABASE.md))
- [ ] SDKs: auth-sdk, connect-sdk (when suite)
- [ ] Policy understood: optional add-on — Suite SKU without SmartLoad

## Standalone (always)

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Local login | Session without Identity |
| S2 | Local `UserRole` RBAC | `can` + local scope |
| S3 | Scan / dispatch / POD | Works offline of suite |
| S4 | Tally on-prem | `SMARTLOAD_TALLY_MODE=onprem` path unchanged |
| S5 | Suite columns null | App runs; nullable `renverse_*` OK |

## Addon entitlement (suite)

| # | Scenario | Expected | Epic |
|---|----------|----------|------|
| A1 | JWT **without** `smartload` in `addons[]` | UI deny + API `403 ADDON_NOT_ENABLED` | EP-SL-01-2 |
| A2 | JWT **with** addon | Enter operator dashboard | EP-SL-01 |
| A3 | Core apps when SmartLoad off | RenBooks / Renexus / RenOrc OK | Policy |
| A4 | Launcher tile | Hidden without addon | Platform |
| A5 | Mistaken `hasApp('smartload')` gate | Must **not** exist — code review | Policy |
| A6 | Addon revoked mid-session | Hard deny after token refresh | EP-SL-01 |

## Tenancy (EP-SL-01)

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Resources scoped by `organizationId` | List/get filtered |
| T2 | Cross-org shipment ID swap | 403 / 404 IDOR deny |
| T3 | AppLink org bind on first suite login | `renverse_org_id` set |
| T4 | Floor map ADMIN/OPERATOR/ACCOUNTS/CLIENT | Per [03](./03_RBAC_MAPPING.md) |
| T5 | Elevation survives `membership.changed` | Local role not clobbered |
| T6 | Client ≠ suite tenant | Counterparty `Client` not used as org | 

## Events produce (EP-SL-02)

| # | Scenario | Current vs Target |
|---|----------|-------------------|
| E1 | Smoke `POST /renverse/shipments/:id/pod` | Current OK |
| E2 | Real POD confirm → outbox `smartload.pod.confirmed.v1` | **Target** EP-SL-02-1 |
| E3 | Payload validates schema | Required |
| E4 | Idempotent re-confirm | No double RenBooks impact |
| E5 | No inventively named `delivery.completed` | Ban |
| E6 | E2E RenBooks consumer when addon on | Target EP-SL-02-2 |

## Events consume (identity)

| # | Scenario | Expected |
|---|----------|----------|
| C1 | `user.provisioned` upsert | After EP-SL-01 |
| C2 | Duplicate event id | No-op |
| C3 | Bad signature | Reject |
| C4 | Connect down | Scan/POD still work |

## ISSA & deep links

| # | Scenario | Expected |
|---|----------|----------|
| I1 | `smartload.shipment.get` authz | hasAddon ∧ can ∧ scope |
| I2 | `smartload.pod.status` | Same |
| I3 | Unknown tool id | 404 |
| I4 | `/suite/open?type=shipment` | Resolve + RBAC |
| I5 | Ban: no full WMS/ERP UI | Suite regression |

## Ban regression (WMS/ERP)

- [ ] No wave-planning / full WMS chrome in suite
- [ ] No ERP GL mutate from SmartLoad
- [ ] Manifest bans still listed

## Security

- [ ] Unauth → 401  
- [ ] Addon bypass attempt → 403  
- [ ] No JWT / cookie / password logging  
- [ ] Parameterized queries only  

## Performance / resilience

- [ ] Outbox lag does not block POD UI confirm response (async relay OK)
- [ ] Consumer poison → DLQ, not crash loop on API

## Rollback

- [ ] `RENVERSE_MODE=standalone` restores local-only path
- [ ] Disabling addon in Billing leaves Suite SKU intact

## A11y / UX smoke

- [ ] Addon denial copy readable ([08](./08_ENTITLEMENTS_AND_GATES.md))
- [ ] Org chip visible after EP-SL-01

---

*RenVerse · SmartLoad QA · 2026-08-19*
