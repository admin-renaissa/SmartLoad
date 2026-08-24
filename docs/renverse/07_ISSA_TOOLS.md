# ISSA Tools — SmartLoad

ISSA Hub calls SmartLoad tool callbacks. Authorization is **identical** to the operator API: suite **`hasAddon('smartload')`** ∧ local `can()` ∧ `in_scope(orgId)`.

**Hub / personas:** [`61_AGENT_PERSONA_REGISTRY.md`](../../../docs/revamp/60-issa/61_AGENT_PERSONA_REGISTRY.md)  
**Registration target:** `apps/api/src/renverse/issa-tools.ts` (EP-SL-01-4)  
**Manifest only** — do not register stub tool names without updating `renverse.manifest.json`.

## Honest status (2026-08-24)

| Surface | Current | Epic |
|---------|---------|------|
| Tool host | `issa-tools.ts` + mounted via `createIssaToolRouter` | EP-SL-01-4 **done** |
| Persona `smartload.ops_assistant` | Named in status + handlers | EP-SL-01-4 **done** |

---

## Tools (manifest)

| Tool | Mutates? | Permission | Input |
|------|----------|------------|-------|
| `smartload.shipment.get` | no | `shipment:read` | `{ "shipmentId": "shp_…" }` |
| `smartload.pod.status` | no | `pod:read` | `{ "shipmentId" \| "podId": "…" }` |

**Persona:** `smartload.ops_assistant` — ops Q&A over shipments/POD; no WMS planning.

Stub names like `smartload.pod.list` / `scan.lookup` are **not** in the manifest — do not implement as suite tools without a contracts/manifest change.

---

## Authorization pattern

```typescript
import { hasAddon } from '@renverse/auth-sdk';

async function authorizeTool(req, permission: string, orgId: string) {
  if (process.env.RENVERSE_MODE === 'suite') {
    if (!hasAddon(req.claims, 'smartload')) {
      return { status: 403, error: 'ADDON_NOT_ENABLED' };
    }
  }
  if (!can(req.user, permission)) return { status: 403, error: 'FORBIDDEN' };
  if (!in_scope(req.user, orgId)) return { status: 403, error: 'OUT_OF_SCOPE' };
  return { status: 200 };
}
```

Hub does **not** evaluate SmartLoad RBAC — defense in depth is local.

---

## Tool implementations (sketches)

### `smartload.shipment.get`

```typescript
async function shipmentGet(input: { shipmentId: string }, ctx) {
  const authz = await authorizeTool(ctx.req, 'shipment:read', ctx.orgId);
  if (authz.status !== 200) throw Object.assign(new Error(authz.error!), { status: authz.status });

  const shipment = await db.shipment.findFirst({
    where: { id: input.shipmentId, organizationId: ctx.orgId },
  });
  if (!shipment) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return {
    shipmentId: shipment.id,
    status: shipment.status,
    siteId: shipment.siteId,
    updatedAt: shipment.updatedAt,
  };
}
```

### `smartload.pod.status`

```typescript
async function podStatus(input: { shipmentId?: string; podId?: string }, ctx) {
  const authz = await authorizeTool(ctx.req, 'pod:read', ctx.orgId);
  if (authz.status !== 200) throw Object.assign(new Error(authz.error!), { status: authz.status });

  const pod = await db.pod.findFirst({
    where: {
      organizationId: ctx.orgId,
      ...(input.podId ? { id: input.podId } : { shipmentId: input.shipmentId }),
    },
  });
  if (!pod) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  return { podId: pod.id, shipmentId: pod.shipmentId, status: pod.status, confirmedAt: pod.confirmedAt };
}
```

---

## Callback endpoint

```typescript
// apps/api/src/renverse/issa-tools.ts (target)
app.post('/issa/tools/:toolId', verifyIssaSignature, async (req, res) => {
  const { toolId } = req.params;
  switch (toolId) {
    case 'smartload.shipment.get':
      return res.json(await shipmentGet(req.body.input, req.ctx));
    case 'smartload.pod.status':
      return res.json(await podStatus(req.body.input, req.ctx));
    default:
      return res.status(404).json({ error: 'UNKNOWN_TOOL' });
  }
});
```

## Env (suite ISSA)

```bash
RENVERSE_MODE=suite
RENVERSE_APP_KEY=smartload
ISSA_HUB_URL=http://localhost:9120
ISSA_TOOL_HOST_URL=http://localhost:<smartload-api>/issa/tools
# entitlement still hasAddon — register only when addon entitled orgs call tools
```

## Rules

1. Verify ISSA tool token / signature  
2. `hasAddon('smartload')` in suite  
3. Local `can` + org scope  
4. Mutating tools (future) call **SmartLoad API only** — never RenBooks DB  
5. **Ban:** no WMS/ERP planning, slotting, or full inventory-optimization tools  

## Standalone

Tools inactive or local-only; Hub registration skipped when `RENVERSE_MODE=standalone`.

## Ban regression

| Forbidden tool surface | Do instead |
|------------------------|------------|
| Full WMS wave planning | Stay shipment/POD read |
| ERP GL / invoice mutate | Emit POD → RenBooks |
| Cross-tenant shipment dump | Always `organizationId` filter |

---

*RenVerse · SmartLoad ISSA · 2026-08-19*
