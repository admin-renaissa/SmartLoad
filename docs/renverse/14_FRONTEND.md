# Frontend — SmartLoad

Operator UI for scan / dispatch / POD. Suite mode adds OIDC + **addon** gating. Driver/handheld may stay separate.

**App entry:** `apps/web/src/App.tsx` · **Pages:** `apps/web/src/pages/`  
**E2E guide:** [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)

## Layout

| Path | Role |
|------|------|
| `apps/web/src/App.tsx` | Router / dual-mode shell |
| `apps/web/src/pages/login*` | Local or suite login |
| `apps/web/src/pages/` dashboard, scan, dispatch, pod, inventory, tally, settings | Product surfaces |
| Target: suite callback / entitlement gate page | EP-SL-01-3 |

## Dual-mode

| Mode | UX |
|------|-----|
| `standalone` | Local login; local `UserRole`; no Identity |
| `suite` | OIDC via Identity; require `hasAddon('smartload')`; org chip after EP-SL-01 |

```tsx
// Sketch — gate suite routes
function SuiteAddonGate({ children, claims }) {
  if (import.meta.env.VITE_RENVERSE_MODE !== 'suite') return children;
  if (!hasAddon(claims, 'smartload')) {
    return (
      <AddonDisabledMessage>
        SmartLoad is not enabled for your organization. Ask your admin to add the SmartLoad add-on.
      </AddonDisabledMessage>
    );
  }
  return children;
}
```

Hide ≠ authz: API still returns `ADDON_NOT_ENABLED` ([08](./08_ENTITLEMENTS_AND_GATES.md)).

## Suite login + callback

| Route | Behavior |
|-------|----------|
| `/renverse/auth/login` (or `/auth/login`) | Redirect Identity |
| `/renverse/auth/callback` | Exchange code; JIT; land dashboard |
| Logout | Clear session; Identity logout optional |

Env (web): `VITE_RENVERSE_MODE`, Identity issuer / client as used by API.

## Entitlement gate UX

- Not entitled: clear ADDON_NOT_ENABLED copy — do not dead-end into empty ERP chrome  
- Launcher: platform hides tile without addon  
- After revoke: force re-auth / show disabled state  

## Org / site context (EP-SL-01)

- Org chip / switcher bound to `organizations` membership  
- Site filters **within** org — never across orgs  
- Counterparty `Client` is not the suite tenant  

## Permission-gated actions

| Action | UI | Server |
|--------|-----|--------|
| Confirm POD | Disable if `!can(pod:confirm)` | Enforce |
| Device admin | Hide for OPERATOR | Enforce |
| Cross-org deep link | Show not found | Enforce scope |

## ISSA entry (suite-only)

Show ops assistant entry when addon entitled + local AI entitlement; tools listed in [07](./07_ISSA_TOOLS.md). Standalone: hide Hub entry or local-only.

## Deep links

| Direction | Pattern |
|-----------|---------|
| Inbound | `/suite/open?type=shipment&sid=…&src=…` |
| Outbound invoice / cost | Deep-link RenBooks — do not embed GL |

Preserve `returnPath` when bouncing across apps.

## Ban UX (WMS / ERP)

| Do not ship in suite | Do instead |
|----------------------|------------|
| Full warehouse wave planner | Stay scan + dispatch + POD |
| ERP financial close screens | RenBooks |
| Fake “enterprise WMS” nav clusters | Slim ops IA |

Inventory/stock modules: keep within existing product policy — do not expand into banned full WMS.

## Loading / empty / error

- Addon missing → dedicated empty (not generic 500)  
- Org not linked → “Contact admin to link SmartLoad”  
- POD confirm pending outbox → success toast; relay async  

## Driver app

May remain separate / offline-capable; **do not** force RenVerse OIDC for handheld MVP. Operator dashboard is the suite surface.

## Tests (FE)

- [ ] Suite without addon → denial view  
- [ ] Standalone login still works  
- [ ] Ban: no WMS ERP nav regression  
- [ ] Deep link shipment open with denied role → blocked  

---

*RenVerse · SmartLoad Frontend · 2026-08-19*
