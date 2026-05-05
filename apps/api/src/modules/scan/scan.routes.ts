import type { FastifyPluginAsync } from 'fastify';
import { successResponse, errorResponse } from '@smartload/shared';
import { SessionService } from '../dispatch/session.service.js';

function datawedgeAllowed(requestIp: string): boolean {
  const raw = process.env.DATAWEDGE_ALLOWED_IPS?.trim();
  if (!raw) return true;
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.some((a) => requestIp.includes(a) || requestIp.endsWith(a));
}

/** Extract deviceId string from raw DataWedge body (JSON or plain). */
function extractDeviceId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const id = b.deviceId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
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

    // ── Device registration check ──────────────────────────────────────────
    const deviceId = extractDeviceId(request.body);

    if (deviceId) {
      const registeredDevice = await fastify.prisma.scannerDevice.findUnique({
        where: { serialNumber: deviceId },
        select: { id: true, isActive: true, name: true },
      });

      if (registeredDevice?.isActive) {
        // Update last-seen timestamp (fire-and-forget; don't block scan processing)
        fastify.prisma.scannerDevice
          .update({ where: { id: registeredDevice.id }, data: { lastSeenAt: new Date() } })
          .catch((err) => request.log.warn({ err }, 'Failed to update device lastSeenAt'));
      } else {
        // Check system config to determine whether unregistered devices are blocked
        const config = await fastify.prisma.systemConfig.findUnique({
          where: { key: 'DEVICE_REGISTRATION_REQUIRED' },
          select: { value: true },
        });

        if (config?.value === 'true') {
          const reason = registeredDevice
            ? `Device "${deviceId}" is deactivated`
            : `Device "${deviceId}" is not registered`;
          return reply.code(403).send(errorResponse(reason));
        }

        request.log.info({ deviceId, registered: !!registeredDevice }, 'Unregistered device submitted scan');
      }
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
