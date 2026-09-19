/**
 * Run: pnpm --filter @smartload/api exec tsx --test src/renverse/emit-lead-captured.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { emitLeadCaptured } from './emit-lead-captured.js';

function restoreEnv(
  keys: Record<string, string | undefined>,
): () => void {
  return () => {
    for (const [key, prev] of Object.entries(keys)) {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  };
}

test('emitLeadCaptured skips when pair disabled / standalone', async () => {
  const undo = restoreEnv({
    RENVERSE_MODE: process.env.RENVERSE_MODE,
    RENVERSE_CONNECT_URL: process.env.RENVERSE_CONNECT_URL,
    RENVERSE_FLAGS: process.env.RENVERSE_FLAGS,
    'RENVERSE_FLAG_renverse.connect.emit':
      process.env['RENVERSE_FLAG_renverse.connect.emit'],
  });
  process.env.RENVERSE_MODE = 'standalone';
  process.env.RENVERSE_CONNECT_URL = 'http://127.0.0.1:9';
  process.env.RENVERSE_FLAGS = 'renverse.connect.emit=true';
  process.env['RENVERSE_FLAG_renverse.connect.emit'] = '1';
  try {
    const result = await emitLeadCaptured({
      orgId: 'org_demo00000001',
      sourceId: 'src_1',
      email: 'ops@example.com',
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'pair_disabled');
  } finally {
    undo();
  }
});

test('emitLeadCaptured skips when suite pair is off', async () => {
  const undo = restoreEnv({
    RENVERSE_MODE: process.env.RENVERSE_MODE,
    RENVERSE_FLAGS: process.env.RENVERSE_FLAGS,
    'RENVERSE_FLAG_renverse.connect.emit':
      process.env['RENVERSE_FLAG_renverse.connect.emit'],
  });
  process.env.RENVERSE_MODE = 'suite';
  process.env.RENVERSE_FLAGS = 'renverse.connect.emit=true';
  process.env['RENVERSE_FLAG_renverse.connect.emit'] = '1';
  try {
    const result = await emitLeadCaptured({
      orgId: 'org_demo00000001',
      sourceId: 'src_1',
      email: 'ops@example.com',
      checkPair: async () => false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'pair_disabled');
  } finally {
    undo();
  }
});
