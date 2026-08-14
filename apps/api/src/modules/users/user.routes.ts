import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import {
  successResponse,
  errorResponse,
  UserRole,
  QUEUES,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
} from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

const meUpdateSchema = z.object({ name: z.string().min(2).optional(), phone: z.string().optional() });

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.nativeEnum(UserRole),
  phone: z.string().optional(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/users
  fastify.get('/', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; role?: UserRole };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where =
      request.user.role === UserRole.SUPERVISOR
        ? { role: UserRole.OPERATOR, isActive: true }
        : query.role
          ? { role: query.role }
          : {};
    const [users, total] = await Promise.all([
      fastify.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true },
      }),
      fastify.prisma.user.count({ where }),
    ]);

    return reply.send(successResponse(users, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/users/me
  fastify.get('/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        twoFactorEnabled: true,
      },
    });
    if (!user) return reply.code(404).send(errorResponse('User not found'));
    return reply.send(successResponse(user));
  });

  // PATCH /api/v1/users/me (must be registered before /:id)
  fastify.patch('/me', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const dto = meUpdateSchema.parse(request.body);
    const user = await fastify.prisma.user.update({
      where: { id: request.user.userId },
      data: dto,
      select: { id: true, email: true, name: true, role: true, phone: true },
    });
    return reply.send(successResponse(user));
  });

  // POST /api/v1/users
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const dto = createUserSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await fastify.prisma.user.create({
      data: { email: dto.email.toLowerCase(), passwordHash, name: dto.name, role: dto.role, phone: dto.phone },
      select: { id: true, email: true, name: true, role: true, phone: true, isActive: true, createdAt: true },
    });

    const appBase = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    const { Queue } = await import('bullmq');
    const notifQueue = new Queue(QUEUES.NOTIFICATIONS, {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
      },
    });
    await notifQueue.add('send', {
      channel: NOTIFICATION_CHANNELS.EMAIL,
      recipientEmail: user.email,
      type: NOTIFICATION_TYPES.WELCOME_USER,
      variables: { name: user.name, appUrl: appBase, loginPath: '/login' },
    });

    return reply.code(201).send(successResponse(user));
  });

  // GET /api/v1/users/:id
  fastify.get('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await fastify.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    if (!user) return reply.code(404).send(errorResponse('User not found'));
    return reply.send(successResponse(user));
  });

  // PATCH /api/v1/users/:id
  fastify.patch('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = updateUserSchema.parse(request.body);
    const user = await fastify.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, name: true, role: true, phone: true, isActive: true },
    });
    return reply.send(successResponse(user));
  });

  // DELETE /api/v1/users/:id (soft delete)
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.user.update({ where: { id }, data: { isActive: false } });
    return reply.send(successResponse({ message: 'User deactivated' }));
  });
};
