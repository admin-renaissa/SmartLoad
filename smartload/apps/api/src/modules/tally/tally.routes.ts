import type { FastifyPluginAsync } from 'fastify';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
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

  // POST /api/v1/tally/sync/pull-stock
  fastify.post('/sync/pull-stock', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const { Queue } = await import('bullmq');
    const queue = new Queue('tally-sync', {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
      },
    });
    await queue.add('pull', { type: 'PULL_STOCK' });
    return reply.send(successResponse({ message: 'Stock pull job queued' }));
  });

  // POST /api/v1/tally/sync/push/:sessionId
  fastify.post('/sync/push/:sessionId', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await fastify.prisma.dispatchSession.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send(errorResponse('Session not found'));

    const { Queue } = await import('bullmq');
    const queue = new Queue('tally-sync', {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
      },
    });
    await queue.add('push', { sessionId, type: 'DISPATCH_OUTWARD' });
    return reply.send(successResponse({ message: 'Tally push job queued' }));
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
