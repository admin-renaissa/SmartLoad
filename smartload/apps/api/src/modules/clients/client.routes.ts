import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, 'Invalid pincode'),
});

const clientSchema = z.object({
  clientCode: z.string().min(2).toUpperCase().optional(),
  name: z.string().min(2),
  gstin: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  contactPersonName: z.string().optional(),
});

export const clientRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/clients
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; search?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = { isActive: true };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { clientCode: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const [clients, total] = await Promise.all([
      fastify.prisma.client.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      fastify.prisma.client.count({ where }),
    ]);

    return reply.send(successResponse(clients, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/clients/search?q= — typeahead for PO creation
  fastify.get('/search', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.length < 1) return reply.send(successResponse([]));

    const clients = await fastify.prisma.client.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { clientCode: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: { id: true, clientCode: true, name: true, gstin: true, phone: true, email: true },
    });

    return reply.send(successResponse(clients));
  });

  // POST /api/v1/clients
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const dto = clientSchema.parse(request.body);

    // Auto-generate clientCode if not provided
    if (!dto.clientCode) {
      const count = await fastify.prisma.client.count();
      dto.clientCode = `CL${String(count + 1).padStart(4, '0')}`;
    }

    // Default empty addresses if not provided
    const defaultAddress = { line1: '', city: '', state: '', pincode: '000000' };
    const client = await fastify.prisma.client.create({
      data: {
        ...dto,
        clientCode: dto.clientCode,
        billingAddress: dto.billingAddress ?? defaultAddress,
        shippingAddress: dto.shippingAddress ?? dto.billingAddress ?? defaultAddress,
      },
    });
    return reply.code(201).send(successResponse(client));
  });

  // GET /api/v1/clients/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await fastify.prisma.client.findUnique({ where: { id } });
    if (!client) return reply.code(404).send(errorResponse('Client not found'));
    return reply.send(successResponse(client));
  });

  // PATCH /api/v1/clients/:id
  fastify.patch('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = clientSchema.partial().parse(request.body);
    const client = await fastify.prisma.client.update({ where: { id }, data: dto });
    return reply.send(successResponse(client));
  });

  // DELETE /api/v1/clients/:id
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.client.update({ where: { id }, data: { isActive: false } });
    return reply.send(successResponse({ message: 'Client deactivated' }));
  });
};
