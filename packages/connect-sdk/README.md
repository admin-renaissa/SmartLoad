# `@renverse/connect-sdk`

Outbox publish + consume helpers for RenConnect.

**Contracts:** `contracts/events/` (envelope + schemas + catalog)  
**Detail:** `docs/revamp/120-implementation/122_CONNECT_SDK_DETAILED_CONTRACT.md`  
**Outbox:** `docs/revamp/40-connect/48_CONNECT_SDK_AND_OUTBOX.md`

## Shipped today

- Types aligned to event envelope and payload schemas

## Runtime (Phase 3 TODO)

| Capability | Notes |
|------------|-------|
| `writeOutbox(tx, event)` | Same DB transaction as SoR write |
| `relayOutbox` | Publish worker |
| `consume(handler)` | Verify signature, idempotent on `event.id` |
| IdMap helpers | put/get — owning app only |

## Rules

- At-least-once delivery; consumers MUST dedupe  
- No cross-app DB reads “because Connect is slow”  
- Poison → DLQ; ops replay only  

**Version:** `0.1.0-types`
