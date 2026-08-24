import assert from 'node:assert/strict';
import test from 'node:test';
import { createSmartloadIssaHandlers, SMARTLOAD_ISSA_PERSONA } from './issa-tools.js';
import type { ToolCallContext } from '@renverse/ai-sdk';

const ctx = (orgId: string): ToolCallContext =>
  ({
    claims: {
      tool_id: 'smartload.shipment.get',
      org_id: orgId,
      sub: 'u1',
      app: 'smartload',
    },
    correlationId: 'c1',
    dryRun: false,
    arguments: {},
  }) as ToolCallContext;

test('persona constant', () => {
  assert.equal(SMARTLOAD_ISSA_PERSONA, 'smartload.ops_assistant');
});

test('shipment.get returns row in org', async () => {
  const handlers = createSmartloadIssaHandlers({
    canRead: () => true,
    getShipment: async (id) =>
      id === 'po1'
        ? { id: 'po1', organizationId: 'org_1', status: 'DISPATCHED', poNumber: 'PO-1' }
        : null,
    getPod: async () => null,
  });
  const result = await handlers['smartload.shipment.get'](
    { shipmentId: 'po1' },
    ctx('org_1'),
  );
  assert.equal((result as any).found, true);
  assert.equal((result as any).poNumber, 'PO-1');
});

test('shipment.get IDOR across org', async () => {
  const handlers = createSmartloadIssaHandlers({
    canRead: () => true,
    getShipment: async () => ({
      id: 'po1',
      organizationId: 'org_other',
      status: 'DISPATCHED',
    }),
    getPod: async () => null,
  });
  await assert.rejects(
    () => handlers['smartload.shipment.get']({ shipmentId: 'po1' }, ctx('org_1')),
    (e: Error & { status?: number }) => e.status === 403,
  );
});

test('pod.status found', async () => {
  const handlers = createSmartloadIssaHandlers({
    canRead: () => true,
    getShipment: async () => null,
    getPod: async (id) =>
      id === 'pod1'
        ? {
            id: 'pod1',
            organizationId: 'org_1',
            status: 'ACKNOWLEDGED',
            shipmentId: 'po1',
            acknowledgedAt: '2026-08-24T00:00:00.000Z',
          }
        : null,
  });
  const result = await handlers['smartload.pod.status']({ podId: 'pod1' }, {
    ...ctx('org_1'),
    claims: { ...ctx('org_1').claims, tool_id: 'smartload.pod.status' },
  });
  assert.equal((result as any).found, true);
  assert.equal((result as any).status, 'ACKNOWLEDGED');
});
