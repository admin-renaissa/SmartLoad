import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pingTally } from './tally-client.js';
import { pullStockItems } from './sync-handlers/pull-stock.js';
import { pushStockJournal } from './sync-handlers/push-stock-journal.js';

const BRIDGE_SECRET = process.env.TALLY_BRIDGE_SECRET || 'change-me';
let lastSyncAt: string | null = null;

export async function createBridgeApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Auth hook
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${BRIDGE_SECRET}`) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // GET /health
  app.get('/health', async () => {
    const tallyConnected = await pingTally();
    return {
      status: 'ok',
      tallyConnected,
      lastSyncAt,
      bridgeVersion: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  });

  // GET /tally-status
  app.get('/tally-status', async () => {
    const connected = await pingTally();
    return { connected, checkedAt: new Date().toISOString() };
  });

  // POST /pull/stock-items
  app.post('/pull/stock-items', async (_request, reply) => {
    try {
      const items = await pullStockItems();
      lastSyncAt = new Date().toISOString();
      return reply.send({ success: true, items, count: items.length, pulledAt: lastSyncAt });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // POST /pull/parties
  app.post('/pull/parties', async (_request, reply) => {
    return reply.send({ success: true, parties: [], message: 'Party pull not yet implemented' });
  });

  // POST /push/stock-journal
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
      return reply.send({ success: true, ...result });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // POST /push/grn
  app.post('/push/grn', async (_request, reply) => {
    return reply.send({ success: true, message: 'GRN push not yet implemented' });
  });

  return app;
}
