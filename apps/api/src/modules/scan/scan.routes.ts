import type { FastifyPluginAsync } from 'fastify';
import { successResponse, errorResponse } from '@smartload/shared';
import { SessionService } from '../dispatch/session.service.js';

function datawedgeAllowed(requestIp: string): boolean {
  const raw = process.env.DATAWEDGE_ALLOWED_IPS?.trim();
  if (!raw) return true;
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((a) => requestIp.includes(a) || requestIp.endsWith(a));
}

export const scanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/datawedge', async (request, reply) => {
    if (!datawedgeAllowed(request.ip)) {
      return reply.code(403).send(errorResponse('Forbidden'));
    }

    const sessionId = (request.query as { sessionId?: string }).sessionId;
    if (!sessionId) {
      return reply.code(400).send(errorResponse('sessionId query parameter is required'));
    }

    const session = await fastify.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      select: { operatorId: true, supervisorId: true },
    });
    if (!session) {
      return reply.code(404).send(errorResponse('Session not found'));
    }

    const operatorId = session.operatorId ?? session.supervisorId;
    if (!operatorId) {
      return reply.code(400).send(errorResponse('Session has no operator or supervisor assigned'));
    }

    try {
      const svc = new SessionService(fastify);
      const result = await svc.processDataWedgeScan(sessionId, request.body, operatorId);

      fastify.io.of('/scan').to(`session:${sessionId}`).emit('scan:result', result);

      return reply.send(successResponse(result));
    } catch (err) {
      request.log.error({ err }, 'DataWedge scan failed');
      return reply
        .code(500)
        .send(errorResponse(err instanceof Error ? err.message : 'Scan failed'));
    }
  });
};
