import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/dashboard/executive
  fastify.get('/executive', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) }, async (_request, reply) => {
    const cacheKey = 'dashboard:executive';
    const cached = await fastify.redis.get(cacheKey);
    if (cached) return reply.send(successResponse(JSON.parse(cached)));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      dispatchesToday,
      dispatchesYesterday,
      boxesThisWeek,
      totalScansToday,
      errorScansToday,
      pendingPODs,
      ordersByStatus,
      recentSessions,
      lowStockCount,
    ] = await Promise.all([
      fastify.prisma.dispatchSession.count({ where: { status: 'CLOSED', closedAt: { gte: today } } }),
      fastify.prisma.dispatchSession.count({
        where: {
          status: 'CLOSED',
          closedAt: { gte: new Date(today.getTime() - 86400000), lt: today },
        },
      }),
      fastify.prisma.dispatchSession.aggregate({
        where: { status: 'CLOSED', closedAt: { gte: weekAgo } },
        _sum: { totalBoxesScanned: true },
      }),
      fastify.prisma.scanEvent.count({ where: { scannedAt: { gte: today } } }),
      fastify.prisma.scanEvent.count({ where: { scannedAt: { gte: today }, result: { not: 'SUCCESS' } } }),
      fastify.prisma.proofOfDelivery.count({ where: { status: { in: ['PENDING', 'LINK_SENT', 'OTP_VERIFIED'] } } }),
      fastify.prisma.purchaseOrder.groupBy({ by: ['status'], _count: true }),
      fastify.prisma.dispatchSession.findMany({
        take: 10,
        orderBy: { closedAt: 'desc' },
        where: { status: 'CLOSED', closedAt: { gte: monthAgo } },
        include: {
          po: { include: { client: { select: { name: true } } } },
          vehicle: { select: { registrationNumber: true } },
        },
      }),
      fastify.prisma.inventoryStock.count({
        where: { variant: { product: { isActive: true } } },
      }),
    ]);

    const errorRate = totalScansToday > 0
      ? Math.round((errorScansToday / totalScansToday) * 100 * 10) / 10
      : 0;

    const data = {
      kpis: {
        dispatchesToday,
        dispatchesTodayDelta: dispatchesToday - dispatchesYesterday,
        boxesThisWeek: boxesThisWeek._sum.totalBoxesScanned || 0,
        scanErrorRateToday: errorRate,
        pendingPODs,
      },
      ordersByStatus: Object.fromEntries(ordersByStatus.map((o: { status: string; _count: number }) => [o.status, o._count])),
      recentSessions,
      lowStockCount,
    };

    await fastify.redis.setex(cacheKey, 60, JSON.stringify(data));
    return reply.send(successResponse(data));
  });

  // GET /api/v1/dashboard/supervisor
  fastify.get('/supervisor', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (_request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeSessions, pendingOrders, vehicles, recentErrors] = await Promise.all([
      fastify.prisma.dispatchSession.findMany({
        where: { status: 'OPEN' },
        include: {
          po: { include: { client: true } },
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
    ]);

    return reply.send(successResponse({ activeSessions, pendingOrders, vehicles, recentErrors }));
  });
};
