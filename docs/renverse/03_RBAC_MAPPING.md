# RBAC Mapping — SmartLoad

Map RenIdentity suite roles → SmartLoad local roles on JIT. Names stay **local**; never rename to `org_*`.

**Canonical:** `docs/revamp/150-spec-complete/155_RBAC_DESIGN_PRINCIPLES.md`, `150_RBAC_LIVE_AUDIT.md`, `153_DUAL_RBAC_SUITE_AND_STANDALONE.md`.
**Directory hints:** `docs/revamp/30-identity/37_ORG_DIRECTORY_DEPARTMENTS_TEAMS.md`.

## Suite → local

| Suite floor | Local role | Notes |
|-------------|------------|-------|
| `org_owner` | `ADMIN` | Requires org membership model (152) |
| `org_admin` | `ADMIN` |  |
| `org_member` | `OPERATOR or SUPERVISOR` |  |
| `org_billing` | `ACCOUNTS` |  |
| `org_readonly` | `CLIENT or read-only OPERATOR` |  |

**Never auto-grant:** global ADMIN without org scope

## Floor markers (on `org_memberships`)

```sql
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_suite_role TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_floor_role TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_department_id TEXT;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS renverse_team_ids JSONB DEFAULT '[]';
```

## Membership sync

| Action | Behavior |
|--------|----------|
| added | JIT provision + floor map |
| role_changed | Update suite/floor markers; keep local elevations |
| directory_changed | Update dept/teams cache; hint refresh only if on floor |
| removed | Soft-disable local access |

## Department hints

Optional: map Identity department names → default local role **only when still on floor**. Never cross-app grants.


> Entitlement is hasAddon("smartload") NOT hasApp. Client ≠ suite org until tenancy design shipped.

---
*RenVerse · SmartLoad · 2026-08-16*
