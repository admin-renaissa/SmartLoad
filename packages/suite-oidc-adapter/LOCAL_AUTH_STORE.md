# LocalAuthStore contract (product apps)

Implement `LocalAuthStore` backed by your app database when wiring `@renverse/suite-oidc-adapter` in suite mode.

Reference in-memory demo: [`src/localAuth.ts`](./localAuth.ts).

## Required methods

| Method | Purpose |
|--------|---------|
| `findByEmail(email, tenantId?)` | Local login lookup (tenant-scoped) |
| `findById(id)` | Link flow / session |
| `countByEmailInTenant(email, tenantId)` | A12 conflict detection (must return >1 to block auto-link) |
| `setRenverseSub(localUserId, sub)` | Persist Identity `sub` on local user row (`renverse_sub`) |
| `verifyPassword(user, password)` | Phase A local password check |
| `seedDemoUser` / `seedDemoUserSync` | Optional demo seed for suite-host apps |

## Database columns (copy from `contracts/sql/010_app_renverse_addon.sql`)

- `users.renverse_sub` — unique where set
- Tenant table: `renverse_org_id`, optional `renverse_suite_cutover_at`

## Dual login (no Phase B)

Suite mode always shows RenVerse + local password. `resolveTenantCutover` is ignored if passed. Do not hide local login or return `SUITE_CUTOVER_REQUIRED`.

## Link conflicts

When `countByEmailInTenant` > 1, adapter redirects to Accounts `/link-conflict`. Report candidates to Identity:

`POST /v1/orgs/{orgId}/links/proposals` with service token `IDENTITY_SERVICE_TOKEN`.

Admin resolves via Accounts or Admin UI → `POST .../links/resolve` → app applies `renverse_sub` from `identity.link.resolved.v1` event.
