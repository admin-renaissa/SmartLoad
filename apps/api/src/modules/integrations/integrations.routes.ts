import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';
import { getNotificationIntegrationStatus } from '../../lib/notification-env.js';

export const integrationsRoutes: FastifyPluginAsync = async (fastify) => {
  const pre = fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS);

  // GET /api/v1/integrations/notifications — SMS / WhatsApp / email mock vs live (ops)
  fastify.get('/notifications', { preHandler: pre }, async (_request, reply) => {
    return reply.send(successResponse(getNotificationIntegrationStatus()));
  });
};
