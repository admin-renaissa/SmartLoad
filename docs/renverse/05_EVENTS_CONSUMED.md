# Events Consumed — SmartLoad

SmartLoad consumes **Identity directory events only** (manifest). Process via signed Connect delivery → local handler → `renverse_processed_events`.

**Catalog:** [`contracts/events/catalog.md`](../../../contracts/events/catalog.md)  
**SDK:** `@renverse/connect-sdk`  
**Target path:** `apps/api/src/renverse/connect-consume.ts` (not shipped until EP-SL-01)

> Entitlement revoke: prefer JWT `addons[]` refresh. Catalog event `billing.entitlements.updated.v1` is **not** in SmartLoad `consumes[]` — do **not** consume until manifest + catalog agree.

## Honest status

| Event | Manifest | Current | Target | Epic |
|-------|----------|---------|--------|------|
| `identity.user.provisioned.v1` | ✓ | Not GA | Link/create user by `sub` | EP-SL-01 |
| `identity.membership.changed.v1` | ✓ | Not GA | Floor / disable / role hint | EP-SL-01 |
| Any SmartLoad peer product event | ✗ | — | Do not invent | — |

Production identity sync only after **EP-SL-01** org tenancy exists.

---

## 1. `identity.user.provisioned.v1`

**Producer:** RenIdentity  
**Schema:** [`identity.user.provisioned.v1.json`](../../../contracts/events/schemas/identity.user.provisioned.v1.json)  
**When:** New suite user provisioned for an org that AppLinks to SmartLoad.  
**Action:** Upsert local user with `renverse_sub`; attach to org via AppLink `org_id` → `organizations.id`.

```typescript
async function consumeUserProvisioned(event: {
  id: string;
  org_id: string;
  data: { sub: string; email: string; name?: string };
}) {
  const seen = await db.renverseProcessedEvents.findUnique({ where: { eventId: event.id } });
  if (seen) return;

  const org = await db.organization.findFirst({ where: { renverseOrgId: event.org_id } });
  if (!org) throw new Error(`Org ${event.org_id} not AppLinked`);

  let user = await db.user.findFirst({ where: { renverseSub: event.data.sub } });
  if (!user) {
    user = await db.user.create({
      data: {
        email: event.data.email,
        name: event.data.name ?? event.data.email,
        renverseSub: event.data.sub,
      },
    });
  }

  await db.orgMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: 'OPERATOR', // floor default — see 03_RBAC_MAPPING
      renverseSuiteRole: 'org_member',
      renverseFloorRole: 'OPERATOR',
    },
    update: {},
  });

  await db.renverseProcessedEvents.create({
    data: { eventId: event.id, type: event.type, processedAt: new Date() },
  });
}
```

---

## 2. `identity.membership.changed.v1`

**Producer:** RenIdentity  
**Schema:** [`identity.membership.changed.v1.json`](../../../contracts/events/schemas/identity.membership.changed.v1.json)  
**When:** Suite role / membership status changes.  
**Action:** Update `renverse_suite_role` / floor hints; disable membership when removed. **Do not** clobber elevated local `role` unless org policy requires reset.

```typescript
async function consumeMembershipChanged(event) {
  const seen = await db.renverseProcessedEvents.findUnique({ where: { eventId: event.id } });
  if (seen) return;

  const org = await db.organization.findFirst({ where: { renverseOrgId: event.org_id } });
  const user = await db.user.findFirst({ where: { renverseSub: event.data.sub } });
  if (!org || !user) {
    // DLQ / retry — AppLink or JIT may lag
    throw new Error('membership_target_missing');
  }

  const floor = mapSuiteFloorToUserRole(event.data.suite_role); // 03_RBAC_MAPPING
  await db.orgMembership.update({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    data: {
      renverseSuiteRole: event.data.suite_role,
      // keep membership.role if elevated above floor
      disabledAt: event.data.active === false ? new Date() : null,
      renverseFloorRole: floor,
    },
  });

  await db.renverseProcessedEvents.create({
    data: { eventId: event.id, type: event.type, processedAt: new Date() },
  });
}
```

---

## Consumer endpoint

**Path (target):** `POST /renverse/events/consume` — signed; public to Connect only.

```typescript
// apps/api/src/renverse/connect-consume.ts (target)
export async function consumeEvent(req, res) {
  const event = req.body; // signature verified in middleware (13_BACKEND)
  try {
    switch (event.type) {
      case 'identity.user.provisioned.v1':
        await consumeUserProvisioned(event);
        break;
      case 'identity.membership.changed.v1':
        await consumeMembershipChanged(event);
        break;
      default:
        // Unknown — ack without SoR mutation (do not invent handlers)
        console.warn(`[smartload] ignore event type ${event.type}`);
    }
    res.status(200).json({ status: 'ok', event_id: event.id });
  } catch (err) {
    console.error(`[smartload] event ${event.id} failed`, err);
    res.status(500).json({ error: 'consume_failed' });
  }
}
```

## Rules

1. Verify Connect signature before switch  
2. Filter by AppLink org — ignore foreign orgs  
3. Dedupe on `renverse_processed_events.event_id`  
4. Poison → DLQ after N retries; **never** block scan/POD CRUD on consume lag  
5. Suite: also require `hasAddon` for operator API — identity sync may still run for linked orgs  

## Standalone

- Consumer inactive (`404` or no-op) when `RENVERSE_MODE=standalone`  
- No Identity events expected  

## Acceptance

- [ ] Duplicate delivery → no second membership row  
- [ ] Missing AppLink → fail/retry, not silent create of wrong org  
- [ ] Scan/POD routes remain available if Connect is down  

---

*RenVerse · SmartLoad Events Consumed · 2026-08-19*
