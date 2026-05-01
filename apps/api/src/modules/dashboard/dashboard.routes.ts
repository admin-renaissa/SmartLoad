import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';
import { buildExecutiveDashboardData } from './executive-dashboard.data.js';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dashboard/executive
  fastify.get('/executive', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const cacheKey = 'dashboard:executive:v5';
    const cached = await fastify.redis.get(cacheKey);
    if (cached) return reply.send(successResponse(JSON.parse(cached)));

    const data = await buildExecutiveDashboardData(fastify.prisma);

    await fastify.redis.setex(cacheKey, 90, JSON.stringify(data));
    return reply.send(successResponse(data));
  });

  // GET /api/v1/dashboard/client — read-only portal summary
  fastify.get('/client', { preHandler: fastify.requireRole(UserRole.CLIENT) }, async (_request, reply) => {
    const [orderCount, recentOrders, podPending, podDisputed] = await Promise.all([
      fastify.prisma.purchaseOrder.count({
        where: { status: { notIn: ['CANCELLED', 'CLOSED'] } },
      }),
      fastify.prisma.purchaseOrder.findMany({
        take: 10,
        orderBy: { orderDate: 'desc' },
        select: {
          id: true,
          poNumber: true,
          status: true,
          orderDate: true,
          client: { select: { name: true } },
        },
      }),
      fastify.prisma.proofOfDelivery.count({
        where: { status: { in: ['PENDING', 'LINK_SENT', 'OTP_VERIFIED'] } },
      }),
      fastify.prisma.proofOfDelivery.count({ where: { status: 'DISPUTED' } }),
    ]);
    return reply.send(successResponse({ orderCount, recentOrders, podPending, podDisputed }));
  });

  // GET /api/v1/dashboard/supervisor
  fastify.get('/supervisor', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (_request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeSessions, pendingOrders, vehicles, recentErrors, disputedPods] = await Promise.all([
      fastify.prisma.dispatchSession.findMany({
        where: { status: 'OPEN' },
        include: {
          purchaseOrder: { include: { client: true } },
          vehicle: true,
          supervisor: { select: { name: true } },
          operator: { select: { name: true } },
        },
      }),
      fastify.prisma.purchaseOrder.findMany({
        where: { status: 'CONFIRMED' },
        orderBy: { expectedDispatchDate: 'asc' },
        take: 10,
        include: { client: { select: { name: true } } },
      }),
      fastify.prisma.vehicle.findMany({
        where: { isActive: true },
        include: {
          dispatchSessions: {
            where: { status: 'OPEN' },
            take: 1,
          },
        },
      }),
      fastify.prisma.scanEvent.findMany({
        where: { scannedAt: { gte: today }, result: { not: 'SUCCESS' } },
        orderBy: { scannedAt: 'desc' },
        take: 20,
        include: {
          session: { select: { sessionCode: true } },
          operator: { select: { name: true } },
        },
      }),
      fastify.prisma.proofOfDelivery.findMany({
        where: { status: 'DISPUTED' },
        take: 15,
        orderBy: { updatedAt: 'desc' },
        include: {
          session: {
            include: {
              purchaseOrder: { include: { client: { select: { name: true } } } },
              vehicle: { select: { registrationNumber: true } },
            },
          },
        },
      }),
    ]);

    return reply.send(successResponse({ activeSessions, pendingOrders, vehicles, recentErrors, disputedPods }));
  });
};
