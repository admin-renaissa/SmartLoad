import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole, AppError } from '@smartload/shared';
import { ScanResult } from '@prisma/client';
import { SessionService } from './session.service.js';
import { ManifestService } from './manifest.service.js';
import {
  createSessionSchema,
  closeSessionSchema,
  processScanSchema,
  listSessionsQuerySchema,
} from './session.schema.js';

const svc = (fastify: Parameters<FastifyPluginAsync>[0]) => new SessionService(fastify);
const manifestSvc = (fastify: Parameters<FastifyPluginAsync>[0]) =>
  new ManifestService(fastify);

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/drivers', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (_request, reply) => {
    return reply.send(successResponse(fastify.hal.listDrivers()));
  });

  fastify.patch(
    '/drivers/active',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const body = z.object({ driverName: z.string().min(1) }).parse(request.body);
      await fastify.hal.setDriver(body.driverName);
      return reply.send(successResponse({ active: fastify.hal.getActiveDriver().driverName }));
    },
  );

  fastify.get(
    '/supervisor-summary',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (_request, reply) => {
      const summary = await svc(fastify).getSupervisorDashboardSummary();
      return reply.send(successResponse(summary));
    },
  );

  fastify.get(
    '/errors/recent',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const q = z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).parse(request.query);
      const events = await svc(fastify).listRecentScanErrors(q.limit);
      return reply.send(successResponse(events));
    },
  );

  fastify.get(
    '/',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS) },
    async (request, reply) => {
      const parsed = listSessionsQuerySchema.safeParse(request.query);
      const query = parsed.success ? parsed.data : listSessionsQuerySchema.parse({});
      const { sessions, meta } = await svc(fastify).listSessions(query);
      return reply.send(successResponse(sessions, meta));
    },
  );

  fastify.get('/active', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const sessions = await svc(fastify).listActiveSessions();
    return reply.send(successResponse(sessions));
  });

  fastify.post(
    '/',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const dto = createSessionSchema.parse(request.body);
      const session = await svc(fastify).createSession(dto, request.user.userId);
      return reply.code(201).send(successResponse(session));
    },
  );

  fastify.get('/:id/scan-log', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; limit?: string; result?: ScanResult };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const skip = (page - 1) * limit;

    const where: { sessionId: string; result?: ScanResult } = { sessionId: id };
    if (query.result) where.result = query.result;

    const [events, total] = await Promise.all([
      fastify.prisma.scanEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scannedAt: 'desc' },
        include: {
          operator: { select: { id: true, name: true } },
          resolvedVariant: { include: { product: true } },
        },
      }),
      fastify.prisma.scanEvent.count({ where }),
    ]);

    const meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };

    return reply.send(successResponse(events, meta));
  });

  fastify.get('/:id/errors', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const events = await fastify.prisma.scanEvent.findMany({
      where: { sessionId: id, result: { not: ScanResult.SUCCESS } },
      orderBy: { scannedAt: 'desc' },
      include: {
        operator: { select: { id: true, name: true } },
      },
    });
    return reply.send(successResponse(events));
  });

  fastify.get(
    '/:id/manifest',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const row = await fastify.prisma.dispatchSession.findUnique({
          where: { id },
          select: { sessionCode: true },
        });
        if (!row) return reply.code(404).send(errorResponse('Session not found'));
        const pdf = await manifestSvc(fastify).generateManifestPDF(id);
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="manifest-${row.sessionCode}.pdf"`);
        return reply.send(pdf);
      } catch (e: unknown) {
        if (e instanceof AppError && e.statusCode === 404) {
          return reply.code(404).send(errorResponse(e.message));
        }
        throw e;
      }
    },
  );

  fastify.get(
    '/:id/challan',
    {
      preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const row = await fastify.prisma.dispatchSession.findUnique({
          where: { id },
          select: { sessionCode: true, status: true },
        });
        if (!row) return reply.code(404).send(errorResponse('Session not found'));
        if (row.status !== 'CLOSED') {
          return reply
            .code(400)
            .send(errorResponse('Delivery challan is only available after the session is closed'));
        }
        const pdf = await manifestSvc(fastify).generateDeliveryChallan(id);
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="challan-${row.sessionCode}.pdf"`);
        return reply.send(pdf);
      } catch (e: unknown) {
        if (e instanceof AppError) {
          return reply.code(e.statusCode).send(errorResponse(e.message));
        }
        throw e;
      }
    },
  );

  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await svc(fastify).getSessionById(id);
      return reply.send(successResponse(session));
    } catch (e) {
      if (e instanceof AppError && e.statusCode === 404) {
        return reply.code(404).send(errorResponse(e.message));
      }
      throw e;
    }
  });

  fastify.post(
    '/:id/close',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const dto = closeSessionSchema.parse(request.body ?? {});
      const session = await svc(fastify).closeSession(id, request.user.userId, dto);
      return reply.send(successResponse(session));
    },
  );

  fastify.post(
    '/:id/scan',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const dto = z.object({ rawBarcode: z.string().min(1), deviceId: z.string().optional() }).parse(request.body);

      const input = processScanSchema.parse({
        sessionId: id,
        rawBarcode: dto.rawBarcode,
        deviceId: dto.deviceId,
      });

      const result = await svc(fastify).processScan(input, request.user.userId);

      fastify.io.of('/scan').to(`session:${id}`).emit('scan:result', result);

      return reply.send(successResponse(result));
    },
  );
};
