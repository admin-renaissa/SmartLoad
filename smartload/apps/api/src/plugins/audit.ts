import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PATHS = new Set<string>(['/health', '/api/v1/auth/login', '/api/v1/auth/refresh']);

const auditPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onResponse', async (request, reply) => {
    try {
      if (!MUTATION_METHODS.has(request.method)) return;
      if (!request.user) return;
      if (reply.statusCode >= 400) return;

      const pathOnly = request.url.split('?')[0] ?? request.url;
      if (SKIP_PATHS.has(pathOnly)) return;
      // High-frequency scan — avoid audit log spam
      if (request.method === 'POST' && /\/api\/v1\/sessions\/[^/]+\/scan$/.test(pathOnly)) return;

      const parts = request.url.split('/').filter(Boolean);
      const resourceType = parts[2] || 'unknown'; // e.g. /api/v1/products → 'products'
      const resourceId = parts[3] || undefined;

      await fastify.prisma.auditLog.create({
        data: {
          userId: request.user.userId,
          userEmail: request.user.email,
          userRole: request.user.role,
          action: `${request.method} ${request.url}`,
          resourceType,
          resourceId,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          newValues: request.method !== 'DELETE' && request.body ? (request.body as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to write audit log');
    }
  });
};

export const auditPlugin = fp(auditPluginImpl, {
  name: 'audit',
  dependencies: ['prisma'],
});
