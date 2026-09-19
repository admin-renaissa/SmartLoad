/**
 * Run: pnpm --filter @smartload/api exec tsx --test src/renverse/pair-gate.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchPairDecision, isPairApplyAllowed } from './pair-gate.js';

describe('pair-gate', () => {
  it('denies sibling sync in standalone', async () => {
    assert.equal(
      await isPairApplyAllowed({
        mode: 'standalone',
        orgId: 'org_1',
        sourceApp: 'smartload',
        targetApp: 'renbooks',
        eventType: 'smartload.pod.confirmed.v1',
      }),
      false,
    );
  });

  it('returns Connect enabled + policy in suite', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ enabled: true, items: [{ policy: 'auto' }] }),
    })) as unknown as typeof fetch;
    const decision = await fetchPairDecision({
      mode: 'suite',
      orgId: 'org_1',
      sourceApp: 'smartload',
      targetApp: 'renbooks',
      eventType: 'smartload.pod.confirmed.v1',
      connectUrl: 'http://connect.test',
      fetchImpl,
    });
    assert.deepEqual(decision, { enabled: true, policy: 'auto' });
  });

  it('denies when Connect is down', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    assert.equal(
      await isPairApplyAllowed({
        mode: 'suite',
        orgId: 'org_1',
        sourceApp: 'smartload',
        targetApp: 'renovax',
        eventType: 'smartload.lead.captured.v1',
        connectUrl: 'http://connect.test',
        fetchImpl,
      }),
      false,
    );
  });
});
