# Events Consumed — SmartLoad

| Event | Action | Notes |
|-------|--------|-------|
| `identity.membership.changed.v1` | JIT / floor |  |
| `billing.entitlements.updated.v1` | Re-gate hasAddon |  |

## Consumer rules

1. Verify signature; resolve IdMap; filter by org  
2. Dedupe via `renverse_processed_events`  
3. Poison → DLQ; do not block local CRUD  
4. Field maps: `contracts/events/field-maps-*.md`

---
*RenVerse · SmartLoad · 2026-08-16*
