/**
 * Run: npm run test:renverse -- connect-consume.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLinkResolved,
  applyOrgMigrationCutover,
  isConnectServiceAuthorized,
} from './connect-consume.js';

function mockPrisma() {
  const processed = new Set<string>();
  const orgCutover = new Map<string, string>();
  const users = new Map<string, { id: string; renverseSub: string | null }>();
  const idMaps: unknown[] = [];

  return {
    orgCutover,
    users,
    idMaps,
    async $queryRawUnsafe<T>(_q: string, eventId: string): Promise<T> {
      return (processed.has(eventId) ? [{ event_id: eventId }] : []) as T;
    },
    async $executeRawUnsafe(q: string, ...args: unknown[]) {
      if (q.includes('renverse_processed_events')) {
        processed.add(String(args[0]));
        return 1;
      }
      if (q.includes('renverse_suite_cutover_at')) {
        orgCutover.set(String(args[1]), String(args[0]));
        return 1;
      }
      if (q.includes('renverse_id_map_local')) {
        idMaps.push(args);
        return 1;
      }
      return 1;
    },
    organization: {
      findUnique: async () => ({ id: 'org_local_1', renverseOrgId: 'org_demo' }),
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      findUnique: async ({ where }: { where: { renverseSub?: string; id?: string } }) => {
        if (where.renverseSub) {
          return [...users.values()].find((u) => u.renverseSub === where.renverseSub) ?? null;
        }
        if (where.id) return users.get(where.id) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { renverseSub: string } }) => {
        const row = users.get(where.id) || { id: where.id, renverseSub: null };
        row.renverseSub = data.renverseSub;
        users.set(where.id, row);
        return row;
      },
      updateMany: async () => ({ count: 1 }),
    },
    orgMembership: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
  };
}

describe('connect-consume migration events', () => {
  it('applies org migration cutover idempotently', async () => {
    const prisma = mockPrisma() as never;
    const envelope = {
      id: 'evt_cut',
      type: 'identity.org.migration.cutover.v1',
      orgId: 'org_demo',
      payload: { suiteCutoverAt: '2026-09-04T00:00:00.000Z' },
    };
    const first = await applyOrgMigrationCutover(prisma, envelope as never);
    assert.equal(first.action, 'cutover');
    assert.equal((prisma as any).orgCutover.get('org_demo'), '2026-09-04T00:00:00.000Z');

    const dup = await applyOrgMigrationCutover(prisma, envelope as never);
    assert.equal(dup.action, 'duplicate');
  });

  it('links identity sub for smartload appKey only', async () => {
    const prisma = mockPrisma() as never;
    (prisma as any).users.set('user_1', { id: 'user_1', renverseSub: null });

    const linked = await applyLinkResolved(prisma, {
      id: 'evt_link',
      type: 'identity.link.resolved.v1',
      orgId: 'org_demo',
      payload: {
        appKey: 'smartload',
        localUserId: 'user_1',
        identitySub: 'sub_linked',
      },
    } as never);
    assert.equal(linked.action, 'linked');
    assert.equal((prisma as any).users.get('user_1')?.renverseSub, 'sub_linked');
    assert.equal((prisma as any).idMaps.length, 1);

    const skipped = await applyLinkResolved(prisma, {
      id: 'evt_skip',
      type: 'identity.link.resolved.v1',
      orgId: 'org_demo',
      payload: {
        appKey: 'renbooks',
        localUserId: 'user_1',
        identitySub: 'sub_x',
      },
    } as never);
    assert.equal(skipped.action, 'skipped_other_app');
  });

  it('validates connect service token', () => {
    const prev = process.env.CONNECT_SERVICE_TOKEN;
    process.env.CONNECT_SERVICE_TOKEN = 'smartload-connect-token';
    assert.equal(isConnectServiceAuthorized('smartload-connect-token'), true);
    assert.equal(isConnectServiceAuthorized('wrong'), false);
    if (prev === undefined) delete process.env.CONNECT_SERVICE_TOKEN;
    else process.env.CONNECT_SERVICE_TOKEN = prev;
  });
});
