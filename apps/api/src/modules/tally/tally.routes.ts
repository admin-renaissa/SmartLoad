import type { FastifyPluginAsync } from 'fastify';
import { successResponse, errorResponse, UserRole, TALLY_DATA_TYPES, QUEUES } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

export const tallyRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/tally/status
  fastify.get('/status', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    let bridgeConnected = false;
    let tallyConnected = false;
    let lastSyncAt: string | null = null;

    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${process.env.TALLY_BRIDGE_URL}/health`, {
        headers: { Authorization: `Bearer ${process.env.TALLY_BRIDGE_SECRET}` },
        timeout: 5000,
      });
      bridgeConnected = response.data.status === 'ok';
      tallyConnected = response.data.tallyConnected === true;
      lastSyncAt = response.data.lastSyncAt;
    } catch {
      bridgeConnected = false;
    }

    const lastJob = await fastify.prisma.tallySyncJob.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { processedAt: 'desc' },
    });

    return reply.send(successResponse({
      bridgeConnected,
      tallyConnected,
      lastSyncAt: lastSyncAt || lastJob?.processedAt?.toISOString(),
    }));
  });

  const getTallyQueue = async () => {
    const { Queue } = await import('bullmq');
    return new Queue(QUEUES.TALLY_SYNC, {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
      },
    });
  };

  // POST /api/v1/tally/sync/pull-stock
  fastify.post('/sync/pull-stock', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const queue = await getTallyQueue();
    await queue.add('pull', { type: TALLY_DATA_TYPES.PULL_STOCK_ITEMS });
    return reply.send(successResponse({ message: 'Stock pull job queued' }));
  });

  // POST /api/v1/tally/sync/pull-parties
  fastify.post('/sync/pull-parties', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const queue = await getTallyQueue();
    await queue.add('pull', { type: 'PULL_PARTIES' });
    return reply.send(successResponse({ message: 'Parties pull job queued' }));
  });

  // POST /api/v1/tally/sync/pull-orders
  fastify.post('/sync/pull-orders', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const queue = await getTallyQueue();
    await queue.add('pull', { type: 'PULL_ORDERS' });
    return reply.send(successResponse({ message: 'Purchase orders pull job queued' }));
  });

  // POST /api/v1/tally/sync/push/:sessionId
  fastify.post('/sync/push/:sessionId', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await fastify.prisma.dispatchSession.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send(errorResponse('Session not found'));

    const queue = await getTallyQueue();
    await queue.add('push', { sessionId, type: 'DISPATCH_OUTWARD' });
    return reply.send(successResponse({ message: 'Tally push job queued' }));
  });

  // POST /api/v1/tally/sync/retry/:jobId — re-queue from stored requestPayload
  fastify.post('/sync/retry/:jobId', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const row = await fastify.prisma.tallySyncJob.findUnique({ where: { id: jobId } });
    if (!row) return reply.code(404).send(errorResponse('Sync job not found'));

    const payload = row.requestPayload as { sessionId?: string; grnId?: string; type?: string } | null;
    const type = payload?.type ?? row.dataType;

    const queue = await getTallyQueue();
    try {
      await queue.add('retry', {
        sessionId: payload?.sessionId,
        grnId: payload?.grnId,
        type,
      });
    } finally {
      await queue.close();
    }
    return reply.send(successResponse({ message: 'Tally job re-queued' }));
  });

  // GET /api/v1/tally/sync-log
  fastify.get('/sync-log', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; status?: string; direction?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;

    const [jobs, total] = await Promise.all([
      fastify.prisma.tallySyncJob.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      fastify.prisma.tallySyncJob.count({ where }),
    ]);

    return reply.send(successResponse(jobs, buildPaginationMeta(total, page, limit)));
  });
};
