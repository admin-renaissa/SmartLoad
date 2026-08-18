# Tenant and User Mapping — SmartLoad

## AppLink

Identity `orgId` ↔ local `organizationId` via AppLink (`contracts/applink/provisioning.md`).

## User IdMap

Identity `sub` ↔ local user; store `users.renverse_sub`.

## JIT (first suite login)

1. Validate OIDC + hasAddon(claims, 'smartload')  
2. Resolve/create AppLink tenant  
3. Create/link local user; write IdMap  
4. Assign local role from [03_RBAC_MAPPING.md](./03_RBAC_MAPPING.md)  
5. Persist `renverse_suite_role` + `renverse_floor_role`  
6. Optional directory hints from membership API/event (not OIDC claims)

> Entitlement is hasAddon("smartload") NOT hasApp. Client ≠ suite org until tenancy design shipped.

---
*RenVerse · SmartLoad · 2026-08-16*
