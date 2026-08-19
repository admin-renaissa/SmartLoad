# Suite Membership — SmartLoad

| Field | Value |
|-------|-------|
| appKey | `smartload` |
| displayName | SmartLoad |
| suiteRole | **addon** (optional — **not** core Suite SKU) |
| SoR | Ops stock, barcode scan, dispatch, POD |
| tenantKey | `orgId` (**target** — see Blocker) |
| contractsVersion | `1.0.0` |
| Host | `smartload.renaissa.ai` |
| Manifest | [`renverse.manifest.json`](../../renverse.manifest.json) |
| Entitlement | **`hasAddon('smartload')`** — never `hasApp` |

## How RenVerse knows SmartLoad is a member

1. Root `renverse.manifest.json` (`suiteRole: "addon"`)
2. `RENVERSE_MODE=suite` + `RENVERSE_APP_KEY=smartload`
3. JWT `addons[]` includes `"smartload"`
4. SDK: `@renverse/auth-sdk` (+ suite-oidc-adapter)
5. `GET /renverse/status`

## Product identity

Specialized logistics add-on: scan → dispatch → proof of delivery. Feeds confirmation signals to RenBooks. **Does not** replace WMS/ERP.

## Bans (locked)

- No full WMS / e-commerce / ERP UI  
- Not part of Suite SKU by default ([`07` policy](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md))  
- Tally bridge stays **on-prem**  
- ISSA tools → this app API only · no cross-app DB  

## Blockers

| ID | Blocker | Epic |
|----|---------|------|
| **EP-SL-01** | Multi-tenant org incomplete; Client ≠ suite org | EP-SL-01 + [`152`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md) |
| Addon messaging | Must remain optional | Policy `07` |
| Tally | `SMARTLOAD_TALLY_MODE=onprem` | Manifest blockers |

Suite smoke via `apps/api/src/renverse/` is lab-only until org model ships.

## Join guide

[`76_SMARTLOAD_JOIN_GUIDE.md`](../../../docs/revamp/70-apps/76_SMARTLOAD_JOIN_GUIDE.md)

---

*RenVerse · SmartLoad · 2026-08-19*
