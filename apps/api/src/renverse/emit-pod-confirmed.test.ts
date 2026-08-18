/**
 * Run: pnpm --filter @smartload/api exec tsx --test src/renverse/emit-pod-confirmed.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { emitPodConfirmed } from './emit-pod-confirmed.js';

test('emitPodConfirmed skips when connect emit flag off / no URL', async () => {
  const prevMode = process.env.RENVERSE_MODE;
  const prevUrl = process.env.RENVERSE_CONNECT_URL;
  const prevFlags = process.env.RENVERSE_FLAGS;
  process.env.RENVERSE_MODE = 'standalone';
  delete process.env.RENVERSE_CONNECT_URL;
  process.env.RENVERSE_FLAGS = JSON.stringify({ 'renverse.connect.emit': false });
  try {
    const result = await emitPodConfirmed({
      shipmentId: 'ship_1',
      orgId: 'org_demo00000001',
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  } finally {
    if (prevMode === undefined) delete process.env.RENVERSE_MODE;
    else process.env.RENVERSE_MODE = prevMode;
    if (prevUrl === undefined) delete process.env.RENVERSE_CONNECT_URL;
    else process.env.RENVERSE_CONNECT_URL = prevUrl;
    if (prevFlags === undefined) delete process.env.RENVERSE_FLAGS;
    else process.env.RENVERSE_FLAGS = prevFlags;
  }
});
