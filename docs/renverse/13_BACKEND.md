# Backend — SmartLoad

1. OIDC middleware (`@renverse/auth-sdk`) when suite  
2. Entitlement gate + local RBAC on APIs  
3. `GET /renverse/status` → mode, org link, contractsVersion  
4. Outbox worker + Connect consumers  
5. `POST /issa/tools/:id` with local authz  
6. `/suite/open` handler for owned types  

Never read sibling app DBs.

---
*RenVerse · SmartLoad · 2026-08-16*

## Scaffolding (Phase 6)

- Mount: `apps/api/src/renverse/renverse.routes.ts` from `server.ts`
- Entitlement: `OidcConfig.entitlement: 'addon'`
- POD emit: acknowledge → `smartload.pod.confirmed.v1`; smoke `POST /renverse/shipments/:id/pod`
- Tally: `SMARTLOAD_TALLY_MODE=onprem` (documented default)
