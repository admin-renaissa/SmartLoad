import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pingTally } from './tally-client.js';
import { pullStockItems } from './sync-handlers/pull-stock.js';
import { pullPartiesFromTally } from './sync-handlers/pull-parties.js';
import { pullPurchaseOrdersFromTally } from './sync-handlers/pull-orders.js';
import { pushStockJournal } from './sync-handlers/push-stock-journal.js';
import { pushGrnToTally } from './sync-handlers/push-grn.js';

const BRIDGE_SECRET = process.env.TALLY_BRIDGE_SECRET || 'change-me';
let lastSyncAt: string | null = null;
let lastPollAt: string | null = null;

export async function createBridgeApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health?')) {
      return;
    }
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${BRIDGE_SECRET}`) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health', async () => {
    const tallyConnected = await pingTally();
    return {
      status: 'ok',
      tallyConnected,
      lastSyncAt,
      lastPollAt,
      bridgeVersion: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/tally-status', async () => {
    const connected = await pingTally();
    return { connected, checkedAt: new Date().toISOString() };
  });

  app.post('/pull/stock-items', async (_request, reply) => {
    try {
      const items = await pullStockItems();
      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, items, count: items.length, pulledAt: lastSyncAt });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  app.post('/pull/parties', async (_request, reply) => {
    try {
      const parties = await pullPartiesFromTally();
      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, parties, count: parties.length, pulledAt: lastSyncAt });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  app.post('/pull/orders', async (_request, reply) => {
    try {
      const result = await pullPurchaseOrdersFromTally();
      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, ...result, pulledAt: lastSyncAt });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  app.post('/push/stock-journal', async (request, reply) => {
    try {
      const body = request.body as { session: Record<string, unknown> };
      const session = body.session;
      if (!session) return reply.code(400).send({ success: false, error: 'session required' });

      const po = session.po as Record<string, unknown>;
      const client = po?.client as Record<string, unknown>;

      type ScanEvent = { resolvedVariant?: { product?: { name?: string; unitOfMeasure?: string }; colourName?: string } };
      const scanEvents = (session.scanEvents as ScanEvent[]) || [];

      const itemCounts = new Map<string, { count: number; unit: string }>();
      for (const event of scanEvents) {
        const key = `${event.resolvedVariant?.product?.name} ${event.resolvedVariant?.colourName}`;
        const existing = itemCounts.get(key);
        if (existing) existing.count++;
        else itemCounts.set(key, { count: 1, unit: event.resolvedVariant?.product?.unitOfMeasure || 'Nos' });
      }

      const items = Array.from(itemCounts.entries()).map(([name, { count, unit }]) => ({
        itemName: name,
        quantity: count,
        unit,
      }));

      const result = await pushStockJournal({
        sessionCode: session.sessionCode as string,
        poNumber: (po?.poNumber as string) || '',
        clientName: (client?.name as string) || '',
        date: (session.closedAt as string) || new Date().toISOString(),
        items,
      });

      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, voucherId: result.voucherId, ...result });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  app.post('/push/grn', async (request, reply) => {
    try {
      const body = request.body as { grn?: Record<string, unknown> };
      const grn = body.grn;
      if (!grn) {
        return reply.code(400).send({ success: false, error: 'grn required' });
      }

      const grnNumber = (grn.grnNumber as string) || 'GRN';
      const receivedDate = (grn.receivedDate as string) || new Date().toISOString();
      const lineItemsRaw = (grn.lineItems as Array<Record<string, unknown>>) || [];

      const lineItems = lineItemsRaw.map((li) => {
        const variant = li.variant as
          | { product?: { name?: string; unitOfMeasure?: string }; colourName?: string }
          | undefined;
        const name = [variant?.product?.name, variant?.colourName].filter(Boolean).join(' ');
        const receivedBoxes = (li.receivedBoxes as number) || 0;
        const unit = variant?.product?.unitOfMeasure || 'Nos';
        return {
          itemDescription: name || 'Item',
          quantity: receivedBoxes,
          unit,
        };
      });

      const result = await pushGrnToTally({ grnNumber, receivedDate, lineItems });
      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, voucherId: result.voucherId, ...result });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  return app;
}

/**
 * Mark last background poll (used by /health for ops visibility).
 */
export function setLastPollTime(iso: string) {
  lastPollAt = iso;
}
