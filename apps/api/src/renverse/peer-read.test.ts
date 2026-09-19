/**
 * Run: pnpm --filter @smartload/api exec tsx --test src/renverse/peer-read.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  handlePeerReadRequest,
  loadSmartloadPeerProjection,
  peerScopeEntity,
  verifyPeerToken,
} from './peer-read.js';

describe('peer-read', () => {
  it('parses read scopes', () => {
    assert.equal(peerScopeEntity('read:shipment'), 'shipment');
    assert.equal(peerScopeEntity('write:shipment'), '');
  });

  it('rejects a malformed token', async () => {
    await assert.rejects(
      () =>
        verifyPeerToken('not-a-jwt', {
          issuer: 'http://localhost:9100',
          audience: 'smartload',
        }),
    );
  });

  it('standalone 404', async () => {
    const res = await handlePeerReadRequest({
      mode: 'standalone',
      authorization: 'Bearer tok',
      entityType: 'shipment',
      id: 'ship_1',
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'standalone');
  });

  it('unauth 401', async () => {
    const res = await handlePeerReadRequest({
      mode: 'suite',
      authorization: '',
      entityType: 'shipment',
      id: 'ship_1',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  it('IDOR 404 when projection is out of org', async () => {
    const res = await handlePeerReadRequest({
      mode: 'suite',
      authorization: 'Bearer peer.jwt',
      entityType: 'shipment',
      id: 'ship_other',
      verify: async () => ({
        sub: 'u1',
        org_id: 'org_a',
        src_app: 'renbooks',
        aud: 'smartload',
        scope: 'read:shipment',
        typ: 'renverse_peer',
      }),
      loadProjection: async () => null,
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('loadSmartloadPeerProjection hides other-org shipments', async () => {
    const row = await loadSmartloadPeerProjection({
      entityType: 'shipment',
      id: 'ship_1',
      orgId: 'org_a',
      prisma: {
        purchaseOrder: {
          findUnique: async () => ({
            id: 'ship_1',
            poNumber: 'PO-1',
            status: 'DELIVERED',
            organizationId: 'org_local_b',
          }),
        },
      },
      findOrgByRenverseId: async () => ({ id: 'org_local_a' }),
    });
    assert.equal(row, null);
  });
});
