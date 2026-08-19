# Backend — SmartLoad

**Honest status:** Renverse scaffold under `apps/api/src/renverse/` · product tenancy **BLOCKER EP-SL-01** · POD product emit **EP-SL-02**.  
**E2E guide:** [`126_E2E_SUITE_IMPLEMENTATION_GUIDE.md`](../../../docs/revamp/120-implementation/126_E2E_SUITE_IMPLEMENTATION_GUIDE.md)

**SDKs:** `@renverse/auth-sdk` · `@renverse/suite-oidc-adapter` (`entitlement: 'addon'`) · `@renverse/connect-sdk`

## File → role

| Path | Role | Status |
|------|------|--------|
| `apps/api/src/server.ts` | Boot / mount | Live |
| `apps/api/src/renverse/renverse.routes.ts` | Status, OIDC scaffold, smoke POD | Scaffold |
| `apps/api/src/renverse/emit-pod-confirmed.ts` | POD emit helper + tests | Smoke |
| `apps/api/src/renverse/connect-consume.ts` | Identity consume | **Target** EP-SL-01 |
| `apps/api/src/renverse/issa-tools.ts` | Tool host | **Target** EP-SL-01-4 |
| `apps/api/src/modules/auth` | Local auth | Live |
| `apps/api/src/modules/pod` | POD SoR → wire emit | EP-SL-02 |
| `apps/api/src/modules/scan` / `dispatch` / `inventory` / … | Domain APIs | Live — need addon gate |
| `apps/api/src/workers/` | Jobs / outbox relay | Target |
| `apps/tally-bridge/` | On-prem Tally | Live; not suite dep |

## Boot mount

```typescript
// apps/api/src/server.ts
import { createSmartLoadRenverseRouter } from './renverse/renverse.routes.js';

app.use(createSmartLoadRenverseRouter());
// suite: /auth/* or /renverse/auth/* + /renverse/status + smoke POD
```

## Env

| Variable | Purpose |
|----------|---------|
| `RENVERSE_MODE` | `suite` \| `standalone` |
| `RENVERSE_APP_KEY` | `smartload` |
| `RENVERSE_OIDC_ISSUER` | Identity issuer |
| `RENVERSE_OIDC_CLIENT_ID` | OIDC client |
| `RENVERSE_OIDC_REDIRECT_URI` | Callback |
| `RENVERSE_CONNECT_URL` | Connect (`:9110` local) |
| `CONNECT_SERVICE_TOKEN` | Service token |
| `RENVERSE_FLAGS` | `renverse.connect.emit`, `renverse.connect.consume` |
| `SMARTLOAD_TALLY_MODE` | `onprem` |
| `ISSA_HUB_URL` | Hub when tools live |

## Entitlement config (locked)

```typescript
{ entitlement: 'addon', appKey: 'smartload' }
// checks hasAddon — NEVER hasApp('smartload')
```

## Middleware order (suite)

```typescript
app.use(authenticate);
app.use((req, res, next) => {
  if (process.env.RENVERSE_MODE !== 'suite') return next();
  if (!hasAddon(req.claims, 'smartload')) {
    return res.status(403).json({ error: 'ADDON_NOT_ENABLED' });
  }
  next();
});
app.use(resolveOrgContext); // EP-SL-01 — orgId from AppLink
app.use(attachLocalCan);    // UserRole permissions
```

Apply to **module routers**, not only `/renverse/*` (SL-01-2).

## JIT sketch (after EP-SL-01)

```typescript
export async function jitProvisionMiddleware(req, res, next) {
  if (process.env.RENVERSE_MODE !== 'suite') return next();
  const { sub, org_id, roles } = req.claims;
  const org = await db.organization.findFirst({ where: { renverseOrgId: org_id } });
  if (!org) {
    return res.status(403).json({ error: 'ORG_NOT_LINKED', org_id });
  }
  let user = await db.user.findFirst({ where: { renverseSub: sub } });
  if (!user) {
    user = await db.user.create({
      data: { email: req.claims.email, renverseSub: sub, name: req.claims.name },
    });
  }
  const floor = mapSuiteToUserRole(roles?.[0] ?? 'org_member');
  await db.orgMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: floor,
      renverseSuiteRole: roles?.[0],
      renverseFloorRole: floor,
    },
    update: { renverseSuiteRole: roles?.[0] },
  });
  req.user = user;
  req.org = org;
  next();
}
```

## Routes

| Path | Notes | Epic |
|------|-------|------|
| `GET /renverse/status` | addon role, blockers, tally mode | Live sketch |
| `POST /renverse/shipments/:id/pod` | Smoke emit | Lab |
| Product POD confirm | Real outbox | EP-SL-02 |
| `POST /renverse/events/consume` | Identity | EP-SL-01 |
| `POST /issa/tools/:toolId` | Manifest tools | EP-SL-01-4 |
| `GET /suite/open` | `type=shipment` | GA / PLAT |

## Status shape

```json
{
  "appKey": "smartload",
  "suiteRole": "addon",
  "mode": "suite",
  "entitlement": "hasAddon",
  "tallyMode": "onprem",
  "blockers": ["multi-tenant org incomplete"],
  "connect": { "emit": "smoke|ready", "consume": "pending" }
}
```

## Outbox + consume

- Emit: see [04](./04_EVENTS_PRODUCED.md) — same txn as POD  
- Consume: see [05](./05_EVENTS_CONSUMED.md) — identity only  
- Never read RenBooks DB  

## Error logging

Log `event_id`, `org_id`, route — **never** JWT, cookies, passwords, Connect service tokens.

## Tests to maintain

| File | Covers |
|------|--------|
| `apps/api/src/renverse/emit-pod-confirmed.test.ts` | Smoke emit shape |
| Target: addon middleware tests | Deny without addon |
| Target: org IDOR tests | Cross-org shipment |
| Target: `connect-consume` / `issa-tools` tests | Idempotency + authz |

## Bans (API)

- No full WMS/ERP endpoints beyond scan/dispatch/POD/stock policy  
- No `hasApp('smartload')`  
- No cross-app SQL  

---

*RenVerse · SmartLoad Backend · 2026-08-19*
