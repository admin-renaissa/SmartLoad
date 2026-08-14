import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

export const auditLogRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/audit-logs
  fastify.get('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const query = request.query as {
      page?: string; limit?: string;
      userId?: string; resourceType?: string;
      dateFrom?: string; dateTo?: string; search?: string;
    };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { userEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      fastify.prisma.auditLog.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
      fastify.prisma.auditLog.count({ where }),
    ]);

    return reply.send(successResponse(logs, buildPaginationMeta(total, page, limit)));
  });
};
