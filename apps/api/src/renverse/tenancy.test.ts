import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSameOrg,
  createMemoryTenancyStore,
  ensureOrgAndMembership,
  suiteFloorToLocalRole,
  siteIdForOrg,
} from './tenancy.js';
import type { AccessTokenClaims } from '@renverse/auth-sdk';

test('suiteFloorToLocalRole maps floors', () => {
  assert.equal(suiteFloorToLocalRole('org_owner'), 'ADMIN');
  assert.equal(suiteFloorToLocalRole('org_member'), 'OPERATOR');
  assert.equal(suiteFloorToLocalRole('org_readonly'), 'ACCOUNTS');
});

test('assertSameOrg IDOR', () => {
  const prev = process.env.RENVERSE_MODE;
  process.env.RENVERSE_MODE = 'standalone';
  try {
    assert.equal(assertSameOrg('org_a', 'org_a').ok, true);
    assert.equal(assertSameOrg(null, 'org_a', { suiteStrict: false }).ok, true);
    const deny = assertSameOrg('org_a', 'org_b');
    assert.equal(deny.ok, false);
    if (!deny.ok) assert.equal(deny.code, 'ORG_SCOPE_MISMATCH');
  } finally {
    if (prev === undefined) delete process.env.RENVERSE_MODE;
    else process.env.RENVERSE_MODE = prev;
  }
});

test('assertSameOrg suite strict denies null', () => {
  const deny = assertSameOrg(null, 'org_a', { suiteStrict: true });
  assert.equal(deny.ok, false);
  const denyReq = assertSameOrg('org_a', null, { suiteStrict: true });
  assert.equal(denyReq.ok, false);
});

test('ensureOrgAndMembership creates org + user + membership', async () => {
  const store = createMemoryTenancyStore();
  const claims = {
    sub: 'sub_1',
    org_id: 'org_demo',
    roles: ['org_admin'],
    apps: [],
    addons: ['smartload'],
  } as AccessTokenClaims;
  const m = await ensureOrgAndMembership(store, claims);
  assert.equal(m.localUserId, 'local_sub_1');
  assert.equal(m.localTenantId, siteIdForOrg('org_demo'));
  assert.equal(m.role, 'ADMIN');
  const again = await ensureOrgAndMembership(store, claims);
  assert.equal(again.organizationId, m.organizationId);
  assert.equal(store.orgs.size, 1);
});
