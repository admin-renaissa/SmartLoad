import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const requireReports = fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.SUPERVISOR);

  // GET /api/v1/reports/dispatch-register
  fastify.get('/dispatch-register', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { dateFrom?: string; dateTo?: string; clientId?: string; status?: string };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.clientId) where.purchaseOrder = { clientId: query.clientId };
    if (query.dateFrom || query.dateTo) {
      where.openedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const sessions = await fastify.prisma.dispatchSession.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      include: {
        purchaseOrder: { include: { client: true } },
        vehicle: true,
        supervisor: { select: { name: true } },
      },
    });

    return reply.send(successResponse(sessions));
  });

  // GET /api/v1/reports/vehicle-loading-history
  fastify.get('/vehicle-loading-history', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { vehicleId?: string; dateFrom?: string; dateTo?: string };
    const where: Record<string, unknown> = { status: 'CLOSED' };
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.dateFrom || query.dateTo) {
      where.closedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const sessions = await fastify.prisma.dispatchSession.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      include: {
        purchaseOrder: { include: { client: true } },
        vehicle: true,
      },
    });
    return reply.send(successResponse(sessions));
  });

  // GET /api/v1/reports/inventory-ledger
  fastify.get('/inventory-ledger', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { variantId?: string; dateFrom?: string; dateTo?: string };
    const where: Record<string, unknown> = {};
    if (query.variantId) where.variantId = query.variantId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const ledger = await fastify.prisma.inventoryLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variant: { include: { product: true } },
        createdBy: { select: { name: true } },
      },
    });
    return reply.send(successResponse(ledger));
  });

  // GET /api/v1/reports/error-alert-log
  fastify.get('/error-alert-log', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { dateFrom?: string; dateTo?: string; sessionId?: string };
    const where: Record<string, unknown> = { result: { not: 'SUCCESS' } };
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.dateFrom || query.dateTo) {
      where.scannedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const events = await fastify.prisma.scanEvent.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      include: {
        session: { select: { sessionCode: true } },
        operator: { select: { name: true } },
      },
    });
    return reply.send(successResponse(events));
  });

  // GET /api/v1/reports/pod-status
  fastify.get('/pod-status', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { status?: string; dateFrom?: string; dateTo?: string };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const pods = await fastify.prisma.proofOfDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        session: {
          include: {
            purchaseOrder: { include: { client: true } },
            vehicle: true,
          },
        },
      },
    });
    return reply.send(successResponse(pods));
  });

  // GET /api/v1/reports/tally-sync-log
  fastify.get('/tally-sync-log', { preHandler: requireReports }, async (request, reply) => {
    const query = request.query as { status?: string; direction?: string };
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;

    const jobs = await fastify.prisma.tallySyncJob.findMany({ where, orderBy: { createdAt: 'desc' } });
    return reply.send(successResponse(jobs));
  });

  // GET /api/v1/reports/outstanding-pos
  fastify.get('/outstanding-pos', { preHandler: requireReports }, async (_request, reply) => {
    const orders = await fastify.prisma.purchaseOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_LOADED', 'FULLY_LOADED'] } },
      orderBy: { expectedDispatchDate: 'asc' },
      include: {
        client: true,
        lineItems: { select: { orderedBoxes: true, loadedBoxes: true } },
      },
    });
    return reply.send(successResponse(orders));
  });

  // GET /api/v1/reports/client-dispatch-history
  fastify.get('/client-dispatch-history', { preHandler: requireReports }, async (request, reply) => {
    const { clientId } = request.query as { clientId?: string };
    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;

    const orders = await fastify.prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        client: true,
        sessions: {
          include: {
            pod: { select: { status: true, acknowledgedAt: true } },
          },
        },
      },
    });
    return reply.send(successResponse(orders));
  });
};
