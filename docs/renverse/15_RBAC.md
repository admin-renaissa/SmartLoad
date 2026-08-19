# RBAC — SmartLoad

Local roles forever. Suite adds **addon entitlement** + floor mapping — never replaces `UserRole`.

**Canon:** [`153_DUAL_RBAC_SUITE_AND_STANDALONE.md`](../../../docs/revamp/150-spec-complete/153_DUAL_RBAC_SUITE_AND_STANDALONE.md) · [`155_RBAC_DESIGN_PRINCIPLES.md`](../../../docs/revamp/150-spec-complete/155_RBAC_DESIGN_PRINCIPLES.md)  
**Live enum:** `packages/shared/src/types/enums.ts` · Floor map: [03_RBAC_MAPPING.md](./03_RBAC_MAPPING.md)

## Dual RBAC planes

| Plane | SoR | Check |
|-------|-----|-------|
| Org membership | Identity | Suite seat / AppLink |
| Entitlement | Billing | **`hasAddon('smartload')`** (not `hasApp`) |
| App RBAC | SmartLoad | `can(user, permission)` |
| Scope | SmartLoad org | `in_scope(user, orgId)` after EP-SL-01 |

| Mode | AuthZ |
|------|-------|
| Standalone | `can` ∧ `in_scope` |
| Suite | **`hasAddon('smartload')`** ∧ `can` ∧ `in_scope` |

## Live UserRole catalog

| Role | Typical use |
|------|-------------|
| `ADMIN` | Org admin, devices, destructive ops |
| `SUPERVISOR` | Confirm orders, supervise scan/dispatch |
| `OPERATOR` | Day-to-day scan/dispatch |
| `ACCOUNTS` | Reports / tally / financial-ish views |
| `DRIVER` | Driver workflows |
| `CLIENT` | External / read-limited |

**Floor rule:** Suite role = *minimum* local role. App admin may promote locally. Never auto-grant a mythical `super_admin` from suite. Never map suite → unbounded WMS admin.

## Permission matrix (illustrative)

| Permission | ADMIN | SUPERVISOR | OPERATOR | ACCOUNTS | DRIVER | CLIENT |
|------------|:-----:|:----------:|:--------:|:--------:|:------:|:------:|
| `shipment:read` | ✓ | ✓ | ✓ | ✓ | ✓* | ✓* |
| `scan:write` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `dispatch:write` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `pod:confirm` | ✓ | ✓ | ✓* | ✗ | ✓* | ✗ |
| `device:admin` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `reports:read` | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |

\* Per existing `requireRole` on routes — keep **server** enforcement; UI hide is not enough.

## Helpers

```typescript
function can(user: { role: UserRole }, permission: string): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

function in_scope(user: { organizationIds: string[] }, orgId: string): boolean {
  return user.organizationIds.includes(orgId);
}

function authorize(claims, user, permission, orgId) {
  if (process.env.RENVERSE_MODE === 'suite' && !hasAddon(claims, 'smartload')) {
    throw Object.assign(new Error('ADDON_NOT_ENABLED'), { status: 403 });
  }
  if (!can(user, permission) || !in_scope(user, orgId)) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}
```

## Scope DO / DON'T

```typescript
// ✅ DO — always filter by org after EP-SL-01
db.shipment.findFirst({ where: { id, organizationId: req.org.id } });

// ❌ DON'T — id alone (IDOR)
db.shipment.findFirst({ where: { id } });
```

## Floor markers SQL

```sql
UPDATE org_memberships
SET renverse_suite_role = 'org_member',
    renverse_floor_role = 'OPERATOR'
WHERE organization_id = $1 AND user_id = $2;
-- Do NOT reset role if elevated above floor unless policy says so
```

## Membership sync

| Identity event | Local action |
|----------------|--------------|
| `user.provisioned` | Create user + membership at floor |
| `membership.changed` (role) | Update suite/floor markers; keep elevation |
| `membership.changed` (removed) | Set `disabled_at` |

## ISSA

Same `can()` + `in_scope` + `hasAddon` as API. Hub does not evaluate SmartLoad RBAC ([07](./07_ISSA_TOOLS.md)).

## Entitlement + permission on a route

```typescript
router.post('/pod/:id/confirm', auth, addonGate, async (req, res) => {
  authorize(req.claims, req.user, 'pod:confirm', req.org.id);
  // … confirm + outbox
});
```

## Ban

No permission surface for “full WMS/ERP admin” beyond existing scan/dispatch/POD/stock scope. Do not invent suite-wide inventory-optimization roles.

---

*RenVerse · SmartLoad RBAC · 2026-08-19*
