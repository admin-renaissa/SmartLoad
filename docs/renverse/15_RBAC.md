# RBAC — SmartLoad

## Dual RBAC

| Mode | AuthN | AuthZ |
|------|-------|-------|
| Standalone | App-local login | Local `can` + `in_scope` only |
| Suite | RenIdentity OIDC | Entitlement **and** local `can` + `in_scope` |

```
// Suite
hasAddon(claims, 'smartload') AND can(user, permission) AND in_scope(user, resource)

// Standalone
can(user, permission) AND in_scope(user, resource)
```

Local RBAC is **always SoR** for actions. Suite role is floor on JIT only. See `155` / `153`.

## Local SoR

- Tenancy: `organizations` / `organizationId`
- Membership: `org_memberships`
- Map: [03_RBAC_MAPPING.md](./03_RBAC_MAPPING.md)
- Live audit: platform `150_RBAC_LIVE_AUDIT.md`

## ISSA

Tool callbacks load end-user → same `can()` helpers as UI/API. Hub does not evaluate SmartLoad permissions.

## Ban

No full WMS/ERP; stay scan/dispatch/POD; optional addon only

---
*RenVerse · SmartLoad · 2026-08-16*
