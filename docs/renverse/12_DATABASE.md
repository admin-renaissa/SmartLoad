# Database — SmartLoad

## Existing SoR (stay local)

- `shipments`
- `pods`
- `scanners`
- `organizations`
- `org_memberships`

## Tenant / user bind

| Concept | Local |
|---------|-------|
| Tenant | `organizations` (`organizationId`) |
| User | `users` |
| Membership | `org_memberships` |

## RenVerse columns

Pattern: `contracts/sql/010_app_renverse_addon.sql`

1. `users.renverse_sub` UNIQUE nullable  
2. `organizations.renverse_org_id` UNIQUE nullable  
3. On `org_memberships`: `renverse_suite_role`, `renverse_floor_role`, optional `renverse_department_id`, `renverse_team_ids`  
4. Tables: `renverse_outbox`, `renverse_processed_events`, optional `renverse_id_map_local`

## Rules

- Never migrate platform `renverse_identity` from this app  
- No cross-app DB reads  
- Entitlement is hasAddon("smartload") NOT hasApp. Client ≠ suite org until tenancy design shipped.

---
*RenVerse · SmartLoad · 2026-08-16*
