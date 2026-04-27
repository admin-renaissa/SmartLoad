import type { FastifyPluginAsync } from 'fastify';
import { loginSchema, refreshSchema, changePasswordSchema, logoutSchema } from './auth.schema.js';
import { AuthService } from './auth.service.js';
import { successResponse } from '@smartload/shared';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const getService = () => new AuthService(fastify.prisma, fastify.redis, fastify);

  // POST /api/v1/auth/login
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const dto = loginSchema.parse(request.body);
    const service = getService();
    const result = await service.login(dto.email, dto.password);
    return reply.send(successResponse(result));
  });

  // POST /api/v1/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const dto = refreshSchema.parse(request.body);
    const service = getService();
    const result = await service.refresh(dto.refreshToken);
    return reply.send(successResponse(result));
  });

  // POST /api/v1/auth/logout
  fastify.post('/logout', {
    preHandler: fastify.requireAuth,
  }, async (request, reply) => {
    const { refreshToken } = logoutSchema.parse(request.body ?? {});
    const service = getService();
    await service.logout(request.user.userId, refreshToken);
    return reply.send(successResponse({ message: 'Logged out successfully' }));
  });

  // POST /api/v1/auth/change-password
  fastify.post('/change-password', {
    preHandler: fastify.requireAuth,
  }, async (request, reply) => {
    const dto = changePasswordSchema.parse(request.body);
    const service = getService();
    await service.changePassword(request.user.userId, dto.currentPassword, dto.newPassword);
    return reply.send(successResponse({ message: 'Password changed successfully' }));
  });
};
