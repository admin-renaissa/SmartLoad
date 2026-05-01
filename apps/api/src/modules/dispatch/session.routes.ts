import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';
import { SessionService } from './session.service.js';
import { SessionStatus } from '@prisma/client';

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const getService = () => new SessionService(fastify.prisma, fastify.redis);

  // GET /api/v1/sessions
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; status?: SessionStatus; vehicleId?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.vehicleId) where.vehicleId = query.vehicleId;

    const [sessions, total] = await Promise.all([
      fastify.prisma.dispatchSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          purchaseOrder: { include: { client: { select: { id: true, name: true } } } },
          vehicle: true,
          supervisor: { select: { id: true, name: true } },
        },
      }),
      fastify.prisma.dispatchSession.count({ where }),
    ]);

    return reply.send(successResponse(sessions, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/sessions/active
  fastify.get('/active', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const sessions = await getService().listActiveSessions();
    return reply.send(successResponse(sessions));
  });

  // POST /api/v1/sessions
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const dto = z.object({
      poId: z.string().cuid(),
      vehicleId: z.string().cuid(),
      operatorId: z.string().cuid().optional(),
    }).parse(request.body);

    const session = await getService().createSession({
      ...dto,
      supervisorId: request.user.userId,
    });
    return reply.code(201).send(successResponse(session));
  });

  // GET /api/v1/sessions/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getService().getSessionDetails(id);
    if (!session) return reply.code(404).send(errorResponse('Session not found'));
    return reply.send(successResponse(session));
  });

  // POST /api/v1/sessions/:id/close
  fastify.post('/:id/close', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = z.object({
      notes: z.string().optional(),
      forcePartial: z.boolean().optional(),
    }).parse(request.body || {});

    const session = await getService().closeSession(id, request.user.userId, dto.notes, dto.forcePartial);
    return reply.send(successResponse(session));
  });

  // POST /api/v1/sessions/:id/scan (REST fallback — primary path is WebSocket)
  fastify.post('/:id/scan', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = z.object({
      rawBarcode: z.string().min(1),
      deviceId: z.string().optional(),
    }).parse(request.body);

    const result = await getService().processScan(id, dto.rawBarcode, request.user.userId, dto.deviceId);

    // Broadcast to WebSocket room
    fastify.io.of('/scan').to(`session:${id}`).emit('scan:result', result);

    return reply.send(successResponse(result));
  });

  // GET /api/v1/sessions/:id/scan-log
  fastify.get('/:id/scan-log', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const [events, total] = await Promise.all([
      fastify.prisma.scanEvent.findMany({
        where: { sessionId: id },
        skip,
        take: limit,
        orderBy: { scannedAt: 'desc' },
        include: {
          operator: { select: { id: true, name: true } },
          resolvedVariant: { include: { product: true } },
        },
      }),
      fastify.prisma.scanEvent.count({ where: { sessionId: id } }),
    ]);

    return reply.send(successResponse(events, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/sessions/:id/errors
  fastify.get('/:id/errors', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const events = await fastify.prisma.scanEvent.findMany({
      where: { sessionId: id, result: { not: 'SUCCESS' } },
      orderBy: { scannedAt: 'desc' },
      include: {
        operator: { select: { id: true, name: true } },
      },
    });
    return reply.send(successResponse(events));
  });
};
