# Events Produced — SmartLoad

Write to local `renverse_outbox` in the **same transaction** as SoR change; relay publishes to Connect.

| Event | When | Key payload fields |
|-------|------|--------------------|
| `smartload.pod.confirmed.v1` | POD confirmed | shipmentId, podId, confirmedAt |

Schemas: `contracts/events/schemas/`. Catalog: `contracts/events/catalog.md`.

## Outbox rules

1. Include `orgId` (Identity org via AppLink)  
2. Idempotency key = hash(entity + version)  
3. At-least-once; consumers dedupe  

---
*RenVerse · SmartLoad · 2026-08-16*
