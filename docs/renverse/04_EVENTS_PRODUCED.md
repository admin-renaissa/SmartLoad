# Events Produced — SmartLoad

SmartLoad produces **one** Connect event. Write the outbox row in the **same DB transaction** as the POD SoR update, then relay via `@renverse/connect-sdk`.

**Catalog / manifest only:** `smartload.pod.confirmed.v1`  
Do **not** emit `smartload.delivery.completed.v1` (older join-guide draft name — superseded by catalog + `renverse.manifest.json`).

| Artifact | Path |
|----------|------|
| Schema | [`contracts/events/schemas/smartload.pod.confirmed.v1.json`](../../../contracts/events/schemas/smartload.pod.confirmed.v1.json) |
| Field map | [`contracts/events/field-maps-smartload-renbooks.md`](../../../contracts/events/field-maps-smartload-renbooks.md) |
| Sync pack | [`47_SYNC_PACK_SMARTLOAD_RENBOOKS.md`](../../../docs/revamp/40-connect/47_SYNC_PACK_SMARTLOAD_RENBOOKS.md) |
| Smoke helper | `apps/api/src/renverse/emit-pod-confirmed.ts` (+ `.test.ts`) |
| Product module (target wire) | `apps/api/src/modules/pod/` |

> Org on envelope requires **EP-SL-01**. Until then, smoke: `POST /renverse/shipments/:id/pod`.

## Honest status

| Surface | Current | Target | Epic |
|---------|---------|--------|------|
| Smoke emit | `POST /renverse/shipments/:id/pod` | Keep for labs | — |
| Product POD confirm → outbox | Not wired | Atomic with `modules/pod` | EP-SL-02-1 |
| RenBooks consumer E2E | Blocked | Addon-gated consume | EP-SL-02-2 + EP-RB-01 |

---

## `smartload.pod.confirmed.v1`

**When:** Proof-of-delivery confirmed for a shipment (operator or driver workflow).  
**Producer:** SmartLoad (ops SoR — stock / barcode / POD).  
**Consumer:** RenBooks (optional — only if that org has `addons[]` smartload).  
**Scope:** Envelope `org_id` = Identity org via AppLink (`organizations.renverse_org_id`).

**Required payload fields (schema):** `shipmentId`, `confirmedAt`.  
**Optional:** `podId`, `skuLines[]`, `valuationHint`.

```json
{
  "shipmentId": "shp_123",
  "confirmedAt": "2026-08-16T14:00:00Z",
  "podId": "pod_456",
  "skuLines": [{ "sku": "WIDGET-001", "qty": 10 }],
  "valuationHint": 2500
}
```

**Idempotency:** Prefer stable `event.id` / outbox `event_id`. Business key: hash(`podId` or `shipmentId` + confirmation version). Re-confirm must not double-bill RenBooks.

**Ban:** Do not invent WMS/ERP “warehouse.completed” events. Stay POD-confirmed.

---

## Emit implementation (EP-SL-02)

Wire from real POD confirmation — not smoke-only:

```typescript
// Target: apps/api/src/modules/pod/ + apps/api/src/renverse/emit-pod-confirmed.ts
import { hasAddon } from '@renverse/auth-sdk';

async function confirmPod(shipmentId: string, orgId: string, pod: Pod, claims) {
  if (process.env.RENVERSE_MODE === 'suite' && !hasAddon(claims, 'smartload')) {
    const err = new Error('ADDON_NOT_ENABLED');
    (err as any).status = 403;
    throw err;
  }

  await db.$transaction(async (trx) => {
    await trx.pod.update({
      where: { id: pod.id, organizationId: orgId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    if (process.env.RENVERSE_MODE === 'suite' && process.env.RENVERSE_FLAGS?.includes('renverse.connect.emit')) {
      await trx.renverseOutbox.create({
        data: {
          eventId: `pod_${pod.id}_${pod.version ?? 1}`,
          type: 'smartload.pod.confirmed.v1',
          orgId: identityOrgFromAppLink(orgId), // organizations.renverse_org_id
          payload: {
            shipmentId,
            confirmedAt: new Date().toISOString(),
            podId: pod.id,
            skuLines: pod.lines ?? [],
            valuationHint: pod.valuationHint,
          },
        },
      });
    }
  });
}
```

### Outbox worker

Poll `renverse_outbox` where `published_at IS NULL`; publish via Connect SDK; mark published. Interval ~5s. Failures stay unpublished for retry — never dual-write RenBooks tables.

```typescript
// Sketch — apps/api/src/workers/ or renverse outbox loop
const rows = await db.renverseOutbox.findMany({
  where: { publishedAt: null },
  orderBy: { createdAt: 'asc' },
  take: 100,
});
for (const row of rows) {
  await connect.publish({
    type: row.type,
    org_id: row.orgId,
    payload: row.payload,
    eventId: row.eventId,
  });
  await db.renverseOutbox.update({
    where: { id: row.id },
    data: { publishedAt: new Date() },
  });
}
```

---

## Event gates & flags

| Flag / env | Purpose |
|------------|---------|
| `RENVERSE_MODE=suite` | Suite path active |
| `RENVERSE_FLAGS` includes `renverse.connect.emit` | Allow outbox publish |
| `RENVERSE_CONNECT_URL` | Connect base URL (local `:9110`) |
| `CONNECT_SERVICE_TOKEN` | Service auth to Connect |
| Addon claim | Emit only when org entitled (API already gated) |

**Standalone:** Outbox rows may accumulate unpublished; consumer path inactive. Local POD still works.

**Cross-app:** Never `SELECT` RenBooks invoices. RenBooks consumes the event + IdMap.

---

## Acceptance (EP-SL-02)

- [ ] Confirming POD in `modules/pod` inserts outbox row in same txn
- [ ] Payload validates against `smartload.pod.confirmed.v1.json`
- [ ] Duplicate confirm does not create a second financial impact downstream
- [ ] No emit of inventively named `delivery.completed`
- [ ] Suite without addon → `403 ADDON_NOT_ENABLED` before outbox write

---

*RenVerse · SmartLoad Events Produced · 2026-08-19*
