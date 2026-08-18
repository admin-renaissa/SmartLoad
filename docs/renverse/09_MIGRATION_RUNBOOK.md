# Migration Runbook — SmartLoad

1. Complete docs pack 00–16; pin `contractsVersion`  
2. Apply DB migrations (12_DATABASE)  
3. Register OIDC client in Identity  
4. Integrate `@renverse/auth-sdk`; dual-mode flag  
5. AppLink provision path  
6. JIT + RBAC map + floor markers  
7. Outbox + consumers  
8. Entitlement gates (addons[] / smartload)  
9. Deep links + ISSA tools  
10. `GET /renverse/status`  
11. QA checklist (11); phase exit per 16_PHASE_PLAN  

**Blocker note:** Entitlement is hasAddon("smartload") NOT hasApp. Client ≠ suite org until tenancy design shipped.

---
*RenVerse · SmartLoad · 2026-08-16*
