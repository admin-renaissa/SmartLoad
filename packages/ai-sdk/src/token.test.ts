import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signToolToken, verifyToolToken } from './token.js';

const secret = 'dev-issa-tool-secret';

describe('tool token', () => {
  it('signs and verifies claims', async () => {
    const token = await signToolToken({
      secret,
      issuer: 'http://localhost:9120',
      appKey: 'renorc',
      sub: 'usr_demo00000001',
      orgId: 'org_demo00000001',
      toolId: 'renorc.pack.get',
    });
    const claims = await verifyToolToken(token, {
      secret,
      issuer: 'http://localhost:9120',
      audience: 'renorc',
    });
    assert.equal(claims.sub, 'usr_demo00000001');
    assert.equal(claims.org_id, 'org_demo00000001');
    assert.equal(claims.tool_id, 'renorc.pack.get');
    assert.equal(claims.aud, 'renorc');
    assert.ok(claims.jti);
  });

  it('rejects wrong secret (401 case)', async () => {
    const token = await signToolToken({
      secret,
      issuer: 'http://localhost:9120',
      appKey: 'renorc',
      sub: 'usr_1',
      orgId: 'org_1',
      toolId: 'renorc.pack.get',
    });
    await assert.rejects(() =>
      verifyToolToken(token, {
        secret: 'other',
        issuer: 'http://localhost:9120',
        audience: 'renorc',
      }),
    );
  });

  it('rejects wrong audience (403-style mismatch)', async () => {
    const token = await signToolToken({
      secret,
      issuer: 'http://localhost:9120',
      appKey: 'renorc',
      sub: 'usr_1',
      orgId: 'org_1',
      toolId: 'renorc.pack.get',
    });
    await assert.rejects(() =>
      verifyToolToken(token, {
        secret,
        issuer: 'http://localhost:9120',
        audience: 'renovax',
      }),
    );
  });
});
