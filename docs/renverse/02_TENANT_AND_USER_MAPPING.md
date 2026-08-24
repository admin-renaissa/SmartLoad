# Tenant & User Mapping — SmartLoad

> **Status (2026-08-24):** Organization + OrgMembership shipped. Migrations `20260824120000_*` + `20260824130000_scanner_org_backfill`. Run `pnpm db:migrate:deploy` then `pnpm db:backfill-org` (or `db:seed`). Product APIs scope clients/POs/POD/scanners by `request.org.organizationId`.  
> Design: [`152_SMARTLOAD_TENANCY_DESIGN.md`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md).

## Model

```
Organization (id, name, renverse_org_id, site_id)
  └── OrgMembership (userId, role → UserRole floor + renverse_* markers)
  └── PurchaseOrder / Client scoped by organizationId
  └── Client remains counterparty under org
```

| RenIdentity | SmartLoad | Mechanism |
|-------------|-----------|-----------|
| `org_id` | `organizations.renverse_org_id` | AppLink / JIT `tenancy.ts` |
| `sub` | `users.renverse_sub` | JIT |

Code: `apps/api/src/renverse/tenancy.ts` · `renverse.routes.ts` onJit/onFirstEnable.

## Entitlement

**`hasAddon('smartload')` only** — `addon-gate.ts`. Never `hasApp('smartload')`.

## Membership sync

Prefer `identity.membership.changed.v1` when Connect fan-out is live (platform EP-PLAT-04). Soft-disable / floor update; keep local elevations.

## Standalone

No Identity; site-based / local roles continue.

## Entitlement

Always **`hasAddon`**, never `hasApp` ([08](./08_ENTITLEMENTS_AND_GATES.md)).

---

*RenVerse · SmartLoad Tenant Mapping · 2026-08-19*
