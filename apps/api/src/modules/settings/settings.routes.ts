import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, UserRole } from '@smartload/shared';

/** Compliance backlog (PRD §13): encryption keys, device trust, and similar belong in platform/KMS/MDM — not toggled via generic config rows without a security review. */

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/settings
  fastify.get('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (_request, reply) => {
    const configs = await fastify.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
    const settings = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    return reply.send(successResponse(settings));
  });

  // PATCH /api/v1/settings
  fastify.patch('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const updates = z.record(z.string(), z.string()).parse(request.body);

    for (const [key, value] of Object.entries(updates)) {
      await fastify.prisma.systemConfig.upsert({
        where: { key },
        update: { value, updatedById: request.user.userId },
        create: { key, value, updatedById: request.user.userId },
      });
    }

    return reply.send(successResponse({ message: 'Settings updated', updated: Object.keys(updates) }));
  });
};
