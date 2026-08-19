# OIDC Integration — SmartLoad

Platform: [`121_AUTH_SDK_DETAILED_CONTRACT.md`](../../../docs/revamp/120-implementation/121_AUTH_SDK_DETAILED_CONTRACT.md).  
**Gate:** Full product OIDC is part of **EP-SL-01** (needs org multi-tenancy per [`152`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)).

**Scaffold:** `apps/api/src/renverse/renverse.routes.ts` with `OidcConfig.entitlement: 'addon'`.

Driver / offline scan flows remain **not** hard-dependent on OIDC (ops device licensing). Operator dashboard uses suite OIDC when org opted in.

## Setup (target)

```bash
RENVERSE_MODE=suite
RENVERSE_APP_KEY=smartload
RENVERSE_OIDC_ISSUER=http://localhost:9100
RENVERSE_OIDC_CLIENT_ID=app_smartload_web
RENVERSE_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
```

## Routes

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/auth/login` | PKCE → Identity |
| GET | `/auth/callback` | Token exchange, **`hasAddon('smartload')`**, JIT |
| GET/POST | `/auth/logout` | Clear session |
| GET | `/renverse/status` | Addon membership JSON |

## Claims

| Claim | Use |
|-------|-----|
| `sub` | `users.renverse_sub` |
| `org_id` | AppLink → local `orgId` |
| `roles[0]` | Floor → UserRole ([03](./03_RBAC_MAPPING.md)) |
| `addons[]` | Must include `"smartload"` |

```json
{
  "sub": "usr_...",
  "org_id": "org_...",
  "roles": ["org_member"],
  "apps": ["renbooks", "renexus"],
  "addons": ["smartload"]
}
```

## Standalone

Local login; skip addon entitlement. Preferred until EP-SL-01 complete for operator GA suite.

---

*RenVerse · SmartLoad OIDC · 2026-08-19*
