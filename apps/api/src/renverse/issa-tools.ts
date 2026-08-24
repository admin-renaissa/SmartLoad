/**
 * ISSA tools for SmartLoad — read SoR only; local RBAC + org scope.
 * Persona: smartload.ops_assistant
 */
import type { ToolCallContext, ToolHandler } from '@renverse/ai-sdk';
import { assertSameOrg } from './tenancy.js';

export type ShipmentRecord = {
  id: string;
  organizationId?: string | null;
  status?: string;
  poNumber?: string;
};

export type PodRecord = {
  id: string;
  organizationId?: string | null;
  status?: string;
  shipmentId?: string;
  acknowledgedAt?: string | null;
};

export type SmartloadIssaDeps = {
  getShipment: (id: string) => Promise<ShipmentRecord | null>;
  getPod: (id: string) => Promise<PodRecord | null>;
  canRead: (ctx: ToolCallContext) => boolean;
};

function forbidden(): never {
  const err = new Error('forbidden') as Error & { status: number; code: string };
  err.status = 403;
  err.code = 'forbidden';
  throw err;
}

export function createSmartloadIssaHandlers(
  deps: SmartloadIssaDeps,
): Record<string, ToolHandler> {
  return {
    'smartload.shipment.get': async (args, ctx) => {
      if (!deps.canRead(ctx)) forbidden();
      const id = String(args.shipmentId || args.id || '');
      if (!id) return { found: false, shipmentId: '' };
      const row = await deps.getShipment(id);
      if (!row) return { found: false, shipmentId: id };
      const scope = assertSameOrg(row.organizationId, ctx.claims.org_id);
      if (!scope.ok) forbidden();
      return {
        found: true,
        shipmentId: row.id,
        status: row.status || 'unknown',
        poNumber: row.poNumber || null,
        organizationId: row.organizationId || null,
      };
    },
    'smartload.pod.status': async (args, ctx) => {
      if (!deps.canRead(ctx)) forbidden();
      const id = String(args.podId || args.id || '');
      if (!id) return { found: false, podId: '' };
      const row = await deps.getPod(id);
      if (!row) return { found: false, podId: id };
      const scope = assertSameOrg(row.organizationId, ctx.claims.org_id);
      if (!scope.ok) forbidden();
      return {
        found: true,
        podId: row.id,
        status: row.status || 'unknown',
        shipmentId: row.shipmentId || null,
        acknowledgedAt: row.acknowledgedAt ?? null,
      };
    },
  };
}

export const SMARTLOAD_ISSA_PERSONA = 'smartload.ops_assistant';
