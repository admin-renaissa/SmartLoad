# Entitlements & Gates — SmartLoad

> **Locked policy:** SmartLoad is an **optional add-on**. Core Suite SKU must work with SmartLoad **disabled**.  
> Gate key: JWT **`addons[]` / `smartload`** via `hasAddon(claims, 'smartload')`.  
> **Never** `hasApp('smartload')`.

Canon: [`07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md`](../../../docs/revamp/00-governance/07_SMARTLOAD_OPTIONAL_ADDON_POLICY.md) · Dual RBAC: [`153`](../../../docs/revamp/150-spec-complete/153_DUAL_RBAC_SUITE_AND_STANDALONE.md) · Billing: [`51_ENTITLEMENTS_MODEL.md`](../../../docs/revamp/50-billing/51_ENTITLEMENTS_MODEL.md)

## Entitlement key

| Mode | Check | Fail |
|------|-------|------|
| Standalone | (none — local auth) | Local 401 |
| Suite | `hasAddon(claims, 'smartload')` | `403 ADDON_NOT_ENABLED` |
| Suite (wrong) | `hasApp('smartload')` | **Forbidden pattern** |

Adapter config:

```typescript
// suite-oidc-adapter / OidcConfig — apps/api or host
{ entitlement: 'addon', appKey: 'smartload' }
// Must resolve to hasAddon, never hasApp
```

Reference host: RenVerse `apps/suite-host-smartload` (`entitlement: 'addon'`).

---

## Gates in order (suite)

```typescript
import { hasAddon } from '@renverse/auth-sdk';

function authorizeSmartLoadAction(claims, user, permission, resourceOrgId) {
  // 1. Addon entitlement
  if (!hasAddon(claims, 'smartload')) {
    const err = new Error('ADDON_NOT_ENABLED');
    (err as any).status = 403;
    throw err;
  }
  // 2. Local permission
  if (!can(user, permission)) {
    const err = new Error('FORBIDDEN');
    (err as any).status = 403;
    throw err;
  }
  // 3. Tenant scope (EP-SL-01)
  if (!in_scope(user, resourceOrgId)) {
    const err = new Error('OUT_OF_SCOPE');
    (err as any).status = 403;
    throw err;
  }
}
```

Formula: **`hasAddon('smartload')` ∧ `can` ∧ `in_scope`**.

EP-SL-01-2: apply this to **all** suite-mode API routes under `apps/api/src/modules/*` (scan, dispatch, pod, inventory, devices, …), not only `/renverse/*`.

---

## Separation of concerns

| Plane | SoR | SmartLoad check |
|-------|-----|-----------------|
| Org membership | Identity | Suite seat / AppLink |
| Entitlement | Billing `addons[]` | `hasAddon('smartload')` |
| App RBAC | SmartLoad `UserRole` | `can(user, permission)` |
| Scope | SmartLoad `orgId` | `in_scope` after EP-SL-01 |

Hiding a Launcher tile is **not** authorization — APIs must enforce.

---

## RenBooks / peer consumer side

RenBooks should only process `smartload.pod.confirmed.v1` / show SmartLoad tabs when **that org** has the addon. Core finance works without SmartLoad.

Meters (when enabled): `smartload.scans`, `smartload.sites` — only if addon entitled ([`52_METERING_AND_CREDITS.md`](../../../docs/revamp/50-billing/52_METERING_AND_CREDITS.md)).

---

## Denial copy

| Audience | Message |
|----------|---------|
| Operator UI | “SmartLoad is not enabled for your organization. Ask your admin to add the SmartLoad add-on.” |
| API | `403` `{ "error": "ADDON_NOT_ENABLED" }` |
| Launcher | Hide tile (preferred) or disabled + upsell |
| ISSA tool | Same `ADDON_NOT_ENABLED` / `FORBIDDEN` |

---

## Narrative examples

| Case | Result |
|------|--------|
| Suite org **without** addon | Deny SmartLoad; RenBooks / Renexus / RenOrc still work |
| Addon + `OPERATOR` | Scan/dispatch per local role |
| Addon + `CLIENT` | Read-limited; no device admin |
| Addon + wrong org shipment id | `OUT_OF_SCOPE` / IDOR deny |
| Addon revoked (token refresh) | Hard block after new JWT |
| Standalone local admin | Full local RBAC; no Identity required |

## Grace / revoke

No silent grace for revoked addon on mutating routes. Short UI grace for “refreshing entitlements…” is OK; APIs stay hard-deny.

## Tally

`SMARTLOAD_TALLY_MODE=onprem` — Tally bridge is **not** a suite entitlement substitute. On-prem path stays local; do not gate Suite SKU on Tally cloud.

---

*RenVerse · SmartLoad Entitlements · 2026-08-19*
