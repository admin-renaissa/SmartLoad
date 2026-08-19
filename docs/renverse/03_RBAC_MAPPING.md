# RBAC Mapping — SmartLoad

Map suite floors → live **`UserRole`** (`packages/shared/src/types/enums.ts`). Names stay local.

**Canonical:** [`155`](../../../docs/revamp/150-spec-complete/155_RBAC_DESIGN_PRINCIPLES.md), [`153`](../../../docs/revamp/150-spec-complete/153_DUAL_RBAC_SUITE_AND_STANDALONE.md).  
Requires org membership model ([`152`](../../../docs/revamp/150-spec-complete/152_SMARTLOAD_TENANCY_DESIGN.md)).

## Live local roles

`ADMIN` | `SUPERVISOR` | `OPERATOR` | `ACCOUNTS` | `DRIVER` | `CLIENT`

## Suite → local (floor)

| Suite floor | Local role | Notes |
|-------------|------------|-------|
| `org_owner` | `ADMIN` | Org-scoped admin — never global platform admin |
| `org_admin` | `ADMIN` | |
| `org_member` | `OPERATOR` | Default ops floor; promote to `SUPERVISOR` locally |
| `org_billing` | `ACCOUNTS` | |
| `org_readonly` | `CLIENT` or read-only `OPERATOR` | Prefer least privilege |

**Never auto-grant** global `ADMIN` without org scope. `DRIVER` remains device/ops assignment (not a suite floor).

## Floor markers (on `org_memberships`)

```sql
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_suite_role TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_floor_role TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_department_id TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_team_ids JSONB DEFAULT '[]';
```

## Sync & hints

| Action | Behavior |
|--------|----------|
| `added` | JIT + floor |
| `role_changed` | Update markers; keep elevations |
| `directory_changed` | Hints only if on floor |
| `removed` | Soft-disable |

Optional Ops/Logistics dept → `SUPERVISOR` hint when on floor. No cross-app grants.

---

*RenVerse · SmartLoad RBAC Mapping · 2026-08-19*
