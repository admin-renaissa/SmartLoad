import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasApp,
  hasAddon,
  getOrgId,
  orgContextHeaders,
  assertOrgMatch,
  isFlagEnabled,
  ORG_CONTEXT_HEADER,
  RenverseAuthError,
} from './index.js';
import type { AccessTokenClaims } from './types.js';

const claims: AccessTokenClaims = {
  sub: 'usr_1',
  iss: 'http://localhost:9100',
  aud: 'app_renexus_web',
  exp: Math.floor(Date.now() / 1000) + 900,
  iat: Math.floor(Date.now() / 1000),
  org_id: 'org_demo00000001',
  apps: ['renexus', 'renbooks'],
  addons: ['smartload'],
};

describe('auth-sdk 0.2 helpers', () => {
  it('hasApp / hasAddon', () => {
    assert.equal(hasApp(claims, 'renexus'), true);
    assert.equal(hasApp(claims, 'renorc'), false);
    assert.equal(hasAddon(claims, 'smartload'), true);
  });

  it('getOrgId from claims and session', () => {
    assert.equal(getOrgId(claims), 'org_demo00000001');
    assert.equal(
      getOrgId({
        accessToken: 'x',
        claims,
        expiresAt: claims.exp,
      }),
      'org_demo00000001',
    );
    assert.equal(getOrgId(null), null);
  });

  it('orgContextHeaders', () => {
    assert.deepEqual(orgContextHeaders('org_x'), {
      [ORG_CONTEXT_HEADER]: 'org_x',
    });
  });

  it('assertOrgMatch throws oidc_org_mismatch', () => {
    assert.throws(
      () => assertOrgMatch(claims, 'org_other'),
      (e: unknown) =>
        e instanceof RenverseAuthError && e.code === 'oidc_org_mismatch',
    );
    assert.doesNotThrow(() => assertOrgMatch(claims, 'org_demo00000001'));
  });

  it('isFlagEnabled suite defaults', () => {
    const prevMode = process.env.RENVERSE_MODE;
    const prevFlags = process.env.RENVERSE_FLAGS;
    const prevConnect = process.env.RENVERSE_CONNECT_URL;
    const prevIssa = process.env.RENVERSE_ISSA_URL;
    process.env.RENVERSE_MODE = 'suite';
    delete process.env.RENVERSE_FLAGS;
    delete process.env.RENVERSE_CONNECT_URL;
    delete process.env.RENVERSE_ISSA_URL;
    assert.equal(isFlagEnabled('renverse.oidc'), true);
    assert.equal(isFlagEnabled('renverse.launcher_chrome'), true);
    assert.equal(isFlagEnabled('renverse.issa'), false);
    assert.equal(isFlagEnabled('renverse.connect.emit'), false);
    process.env.RENVERSE_CONNECT_URL = 'http://localhost:9110';
    assert.equal(isFlagEnabled('renverse.connect.emit'), true);
    assert.equal(isFlagEnabled('renverse.connect.consume'), true);
    process.env.RENVERSE_ISSA_URL = 'http://localhost:9120';
    assert.equal(isFlagEnabled('renverse.issa'), true);
    process.env.RENVERSE_MODE = 'standalone';
    delete process.env.RENVERSE_FLAGS;
    delete process.env.RENVERSE_CONNECT_URL;
    delete process.env.RENVERSE_ISSA_URL;
    assert.equal(isFlagEnabled('renverse.oidc'), false);
    process.env.RENVERSE_MODE = prevMode;
    process.env.RENVERSE_FLAGS = prevFlags;
    if (prevConnect === undefined) delete process.env.RENVERSE_CONNECT_URL;
    else process.env.RENVERSE_CONNECT_URL = prevConnect;
    if (prevIssa === undefined) delete process.env.RENVERSE_ISSA_URL;
    else process.env.RENVERSE_ISSA_URL = prevIssa;
  });
});
