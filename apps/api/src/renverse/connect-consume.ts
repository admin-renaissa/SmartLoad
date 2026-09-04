/**
 * SmartLoad Connect consumer — Identity sync + migration cutover (EP-SL-01 / EP-X-01).
 */
import { timingSafeEqual } from 'node:crypto';
import {
  createConnectClient,
  type EventEnvelope,
} from '@renverse/connect-sdk';
import { isFlagEnabled } from '@renverse/auth-sdk';
import {
  createPrismaTenancyStore,
  ensureOrgAndMembership,
  suiteFloorToLocalRole,
} from './tenancy.js';
import { ensureCutoverColumn, setOrgCutover } from './suite-cutover.js';

export const SMARTLOAD_CONSUMER_KEY = 'smartload.identity_sync';

type SmartloadPrisma = {
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  organization: {
    findUnique: (args: unknown) => Promise<{ id: string; renverseOrgId: string } | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  user: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  orgMembership: {
    upsert: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

async function alreadyProcessed(prisma: SmartloadPrisma, eventId: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ event_id: string }>>(
    `SELECT event_id FROM renverse_processed_events WHERE event_id = $1 LIMIT 1`,
    eventId,
  );
  return Boolean(rows[0]);
}

async function markProcessed(
  prisma: SmartloadPrisma,
  eventId: string,
  type: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO renverse_processed_events (event_id, type)
     VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
    eventId,
    type,
  );
}

async function writeLocalIdMap(
  prisma: SmartloadPrisma,
  opts: {
    orgId: string;
    entityType: string;
    sourceApp: string;
    sourceId: string;
    targetApp: string;
    targetId: string;
  },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO renverse_id_map_local
      (org_id, entity_type, source_app, source_id, target_app, target_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, entity_type, source_app, source_id, target_app)
     DO UPDATE SET target_id = EXCLUDED.target_id`,
    opts.orgId,
    opts.entityType,
    opts.sourceApp,
    opts.sourceId,
    opts.targetApp,
    opts.targetId,
  );
}

export function connectClientFromEnv() {
  const baseUrl = process.env.RENVERSE_CONNECT_URL || '';
  const serviceToken =
    process.env.CONNECT_SERVICE_TOKEN ||
    process.env.RENVERSE_CONNECT_TOKEN ||
    'dev-connect-token';
  if (!baseUrl) return null;
  return createConnectClient({ baseUrl, serviceToken });
}

export function connectServiceToken(): string {
  return (
    process.env.CONNECT_SERVICE_TOKEN ||
    process.env.RENVERSE_CONNECT_TOKEN ||
    'dev-connect-token'
  );
}

export function isConnectServiceAuthorized(presented: string | undefined | null): boolean {
  const token = connectServiceToken();
  const got = String(presented || '');
  if (!got || got.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(token));
}

function payloadString(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export async function applyUserProvisioned(
  prisma: SmartloadPrisma,
  envelope: EventEnvelope,
): Promise<{ action: string }> {
  if (await alreadyProcessed(prisma, envelope.id)) return { action: 'duplicate' };
  const payload = envelope.payload as Record<string, unknown>;
  const sub = payloadString(payload, ['sub', 'userId', 'user_id']);
  if (!sub) throw new Error('identity.user.provisioned.v1 missing sub');

  const store = createPrismaTenancyStore(prisma as never);
  const org = await store.findOrgByRenverseId(envelope.orgId);
  if (!org) throw new Error(`org ${envelope.orgId} not AppLinked`);

  await ensureOrgAndMembership(
    store,
    {
      sub,
      org_id: envelope.orgId,
      email: payloadString(payload, ['email']),
      name: payloadString(payload, ['name', 'displayName', 'display_name']),
      roles: ['org_member'],
    } as never,
  );

  await markProcessed(prisma, envelope.id, envelope.type);
  return { action: 'provisioned' };
}

export async function applyMembershipChanged(
  prisma: SmartloadPrisma,
  envelope: EventEnvelope,
): Promise<{ action: string }> {
  if (await alreadyProcessed(prisma, envelope.id)) return { action: 'duplicate' };
  const payload = envelope.payload as Record<string, unknown>;
  const action = payloadString(payload, ['action']).toLowerCase();
  const sub = payloadString(payload, ['sub', 'userId', 'user_id']);
  if (!action || !sub) {
    throw new Error('identity.membership.changed.v1 missing action or sub');
  }

  const org = await prisma.organization.findUnique({
    where: { renverseOrgId: envelope.orgId },
    select: { id: true },
  });
  if (!org) throw new Error(`org ${envelope.orgId} not mapped`);

  const user = await prisma.user.findUnique({
    where: { renverseSub: sub },
    select: { id: true },
  });
  if (!user) throw new Error(`user ${sub} not linked`);

  if (action === 'removed') {
    await prisma.orgMembership.updateMany({
      where: { organizationId: org.id, userId: user.id },
      data: { role: 'OPERATOR' },
    });
    await markProcessed(prisma, envelope.id, envelope.type);
    return { action: 'removed' };
  }

  const suiteRole = payloadString(payload, ['suiteRole', 'role', 'roles']) || 'org_member';
  const floor = suiteFloorToLocalRole(
    payloadString(payload, ['suiteRole']) ||
      (Array.isArray(payload.roles) ? String(payload.roles[0] || '') : suiteRole),
  );

  await prisma.orgMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: floor,
      renverseSuiteRole: suiteRole,
      renverseFloorRole: floor,
    },
    update: {
      renverseSuiteRole: suiteRole,
    },
  });

  await markProcessed(prisma, envelope.id, envelope.type);
  return { action: action === 'role_changed' ? 'role_changed' : 'synced' };
}

export async function applyOrgMigrationCutover(
  prisma: SmartloadPrisma,
  envelope: EventEnvelope,
): Promise<{ action: string }> {
  if (await alreadyProcessed(prisma, envelope.id)) return { action: 'duplicate' };
  const payload = envelope.payload as { suiteCutoverAt?: string };
  const at = payload.suiteCutoverAt || new Date().toISOString();
  await setOrgCutover(prisma, envelope.orgId, at);
  await markProcessed(prisma, envelope.id, envelope.type);
  return { action: 'cutover', at };
}

export async function applyLinkResolved(
  prisma: SmartloadPrisma,
  envelope: EventEnvelope,
): Promise<{ action: string; userId?: string }> {
  if (await alreadyProcessed(prisma, envelope.id)) return { action: 'duplicate' };
  const payload = envelope.payload as {
    appKey?: string;
    localUserId?: string;
    identitySub?: string;
  };
  if (payload.appKey && payload.appKey !== 'smartload') {
    await markProcessed(prisma, envelope.id, envelope.type);
    return { action: 'skipped_other_app' };
  }
  const localUserId = String(payload.localUserId || '');
  const sub = String(payload.identitySub || '');
  if (!localUserId || !sub) {
    throw new Error('identity.link.resolved.v1 missing localUserId or identitySub');
  }

  await prisma.user.update({
    where: { id: localUserId },
    data: { renverseSub: sub },
  });

  await writeLocalIdMap(prisma, {
    orgId: envelope.orgId,
    entityType: 'user',
    sourceApp: 'identity',
    sourceId: sub,
    targetApp: 'smartload',
    targetId: localUserId,
  });

  await markProcessed(prisma, envelope.id, envelope.type);
  return { action: 'linked', userId: localUserId };
}

export async function applyConsumeEnvelope(
  prisma: SmartloadPrisma,
  envelope: EventEnvelope,
): Promise<{ action: string; type: string }> {
  const type = envelope.type;
  if (type === 'identity.user.provisioned.v1') {
    const result = await applyUserProvisioned(prisma, envelope);
    return { type, ...result };
  }
  if (type === 'identity.membership.changed.v1') {
    const result = await applyMembershipChanged(prisma, envelope);
    return { type, ...result };
  }
  if (type === 'identity.org.migration.cutover.v1') {
    const result = await applyOrgMigrationCutover(prisma, envelope);
    return { type, ...result };
  }
  if (type === 'identity.link.resolved.v1') {
    const result = await applyLinkResolved(prisma, envelope);
    return { type, ...result };
  }
  return { type, action: 'ignored_unknown_type' };
}

export async function consumePendingEvents(
  prisma: SmartloadPrisma,
  limit = 25,
): Promise<{ processed: number; failed: number; results: unknown[] }> {
  if (!isFlagEnabled('renverse.connect.consume')) {
    return { processed: 0, failed: 0, results: [{ skipped: 'flag_off' }] };
  }
  const client = connectClientFromEnv();
  if (!client) {
    return { processed: 0, failed: 0, results: [{ skipped: 'no_connect_url' }] };
  }

  const types = [
    'identity.user.provisioned.v1',
    'identity.membership.changed.v1',
    'identity.org.migration.cutover.v1',
    'identity.link.resolved.v1',
  ];
  let processed = 0;
  let failed = 0;
  const results: unknown[] = [];

  for (const type of types) {
    const items = await client.listEvents({ type, status: 'pending', limit });
    for (const item of items) {
      const envelope = {
        id: item.id,
        type: item.type,
        source: item.source,
        orgId: item.orgId,
        occurredAt: item.occurredAt,
        correlationId: item.correlationId,
        idempotencyKey: item.idempotencyKey,
        specVersion: item.specVersion,
        payload: item.payload,
      } as EventEnvelope;

      try {
        const result = await applyConsumeEnvelope(prisma, envelope);
        if (result.action === 'ignored_unknown_type') continue;
        await client.ack(envelope.id, SMARTLOAD_CONSUMER_KEY);
        processed += 1;
        results.push({ eventId: envelope.id, ...result });
      } catch (e) {
        failed += 1;
        await client
          .fail(envelope.id, SMARTLOAD_CONSUMER_KEY, (e as Error).message)
          .catch(() => undefined);
        results.push({ eventId: envelope.id, error: (e as Error).message });
      }
    }
  }

  return { processed, failed, results };
}

let consumeLoop: ReturnType<typeof setInterval> | null = null;

export function startConsumeLoop(prisma: SmartloadPrisma): void {
  if (consumeLoop || !isFlagEnabled('renverse.connect.consume')) return;
  consumeLoop = setInterval(() => {
    consumePendingEvents(prisma).catch(() => undefined);
  }, 5000);
}

export function stopConsumeLoop(): void {
  if (consumeLoop) {
    clearInterval(consumeLoop);
    consumeLoop = null;
  }
}
