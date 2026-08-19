# Tenant & User Mapping — SmartLoad

> **BLOCKER (EP-SL-01):** Product multi-tenant org incomplete. Today users are often global with `UserRole`; `Client` is a counterparty, **not** a suite tenant.  
> Design: [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md).

## Current state

| Concept | Today | Target |
|---------|-------|--------|
| Access | Site / location / global roles | Org-scoped |
| Suite tenant | Missing | `organizations` / **`orgId`** |
| Counterparty | `Client` | Remains customer under org |

## Target model (EP-SL-01)

```
Organization (id, name, renverse_org_id)
  └── OrgMembership (userId, role → UserRole floor)
  └── Shipments / PODs / scanners / sites scoped by orgId
  └── Client (counterparty under org)
```

| RenIdentity | SmartLoad | Mechanism |
|-------------|-----------|-----------|
| `org_id` | `organizations.id` (`orgId`) | AppLink / `renverse_org_id` |
| `sub` | `users.renverse_sub` | JIT |

Multi-site **within** one org is allowed; multi-org requires separate AppLinks.

## JIT (after org model)

1. Validate OIDC + **`hasAddon(claims, 'smartload')`**  
2. Resolve AppLink org → local `orgId` (fail if missing)  
3. Create/link user; write membership + floor markers  
4. Optional directory hints  

## Membership sync

Same pattern as other apps: `identity.membership.changed.v1` / `identity.user.provisioned.v1` per manifest — soft-disable, floor update, keep elevations.

## Standalone

No Identity; site-based / local roles continue.

## Entitlement

Always **`hasAddon`**, never `hasApp` ([08](./08_ENTITLEMENTS_AND_GATES.md)).

---

*RenVerse · SmartLoad Tenant Mapping · 2026-08-19*
