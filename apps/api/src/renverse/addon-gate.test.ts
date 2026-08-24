import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requireSmartloadAddon,
  isSuiteAddonExemptPath,
  ADDON_NOT_ENABLED,
} from './addon-gate.js';
import type { AccessTokenClaims } from '@renverse/auth-sdk';

const base = {
  sub: 'u1',
  org_id: 'org_1',
  apps: [] as AccessTokenClaims['apps'],
};

test('requireSmartloadAddon allows when addons includes smartload', () => {
  const r = requireSmartloadAddon({
    ...base,
    addons: ['smartload'],
  } as AccessTokenClaims);
  assert.equal(r.ok, true);
});

test('requireSmartloadAddon denies without addon', () => {
  const r = requireSmartloadAddon({
    ...base,
    apps: ['renbooks'],
    addons: [],
  } as AccessTokenClaims);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, ADDON_NOT_ENABLED);
    assert.equal(r.status, 403);
  }
});

test('requireSmartloadAddon denies apps[] smartload without addons[]', () => {
  const r = requireSmartloadAddon({
    ...base,
    apps: ['smartload'],
    addons: [],
  } as AccessTokenClaims);
  assert.equal(r.ok, false);
});

test('requireSmartloadAddon denies null claims', () => {
  const r = requireSmartloadAddon(null);
  assert.equal(r.ok, false);
});

test('isSuiteAddonExemptPath allows public POD link + status', () => {
  assert.equal(isSuiteAddonExemptPath('/renverse/status'), true);
  assert.equal(isSuiteAddonExemptPath('/api/v1/pod/link/abc'), true);
  assert.equal(isSuiteAddonExemptPath('/api/v1/orders'), false);
});
