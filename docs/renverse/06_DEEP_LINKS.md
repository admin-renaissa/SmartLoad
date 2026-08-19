# Deep Links — SmartLoad

Contract: [`91_DEEP_LINK_CONTRACT.md`](../../../docs/revamp/90-ux/91_DEEP_LINK_CONTRACT.md)  
Manifest: `shipment` → `/suite/open?type=shipment`

```
https://smartload.renaissa.ai/suite/open?type=shipment&sid={id}&src={sourceApp}
```

## Owns

| Entity | Native route | Authz |
|--------|--------------|-------|
| `shipment` | `/shipments/:id` or POD-linked shipment view | shipment:read + org scope + **addon entitled** |

## Opens elsewhere

| Entity | App | Notes |
|--------|-----|-------|
| `invoice` | RenBooks | Cost/PO context — deep link out |

```typescript
if (type === 'shipment') {
  assert(hasAddon(claims, 'smartload'));
  const localId = await idMap.resolve({ type: 'shipment', sid, orgId });
  assert(can(user, 'shipment:read') && in_scope(user, orgId));
  return redirect(`/shipments/${localId}`);
}
```

No sibling DB reads.

---

*RenVerse · SmartLoad Deep Links · 2026-08-19*
