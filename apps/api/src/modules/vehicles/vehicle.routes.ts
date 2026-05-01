import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole, VehicleType } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

const vehicleSchema = z.object({
  registrationNumber: z.string().min(4).toUpperCase(),
  type: z.nativeEnum(VehicleType),
  capacityKg: z.number().positive().optional(),
  driverName: z.string().min(2),
  driverPhone: z.string().min(10),
});

export const vehicleRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/vehicles
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const [vehicles, total] = await Promise.all([
      fastify.prisma.vehicle.findMany({
        where: { isActive: true }, skip, take: limit,
        orderBy: { registrationNumber: 'asc' },
      }),
      fastify.prisma.vehicle.count({ where: { isActive: true } }),
    ]);

    return reply.send(successResponse(vehicles, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/vehicles/available
  fastify.get('/available', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const busyVehicleIds = (
      await fastify.prisma.dispatchSession.findMany({
        where: { status: 'OPEN' },
        select: { vehicleId: true },
      })
    ).map((s) => s.vehicleId);

    const vehicles = await fastify.prisma.vehicle.findMany({
      where: { isActive: true, id: { notIn: busyVehicleIds } },
      orderBy: { registrationNumber: 'asc' },
    });

    return reply.send(successResponse(vehicles));
  });

  // POST /api/v1/vehicles
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const dto = vehicleSchema.parse(request.body);
    const vehicle = await fastify.prisma.vehicle.create({ data: dto });
    return reply.code(201).send(successResponse(vehicle));
  });

  // GET /api/v1/vehicles/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vehicle = await fastify.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send(errorResponse('Vehicle not found'));
    return reply.send(successResponse(vehicle));
  });

  // PATCH /api/v1/vehicles/:id
  fastify.patch('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = vehicleSchema.partial().parse(request.body);
    const vehicle = await fastify.prisma.vehicle.update({ where: { id }, data: dto });
    return reply.send(successResponse(vehicle));
  });

  // DELETE /api/v1/vehicles/:id
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.vehicle.update({ where: { id }, data: { isActive: false } });
    return reply.send(successResponse({ message: 'Vehicle deactivated' }));
  });

  // GET /api/v1/vehicles/:id/history
  fastify.get('/:id/history', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const [sessions, total] = await Promise.all([
      fastify.prisma.dispatchSession.findMany({
        where: { vehicleId: id, status: 'CLOSED' },
        skip, take: limit,
        orderBy: { closedAt: 'desc' },
        include: {
          purchaseOrder: { include: { client: { select: { id: true, name: true } } } },
          supervisor: { select: { id: true, name: true } },
        },
      }),
      fastify.prisma.dispatchSession.count({ where: { vehicleId: id, status: 'CLOSED' } }),
    ]);

    return reply.send(successResponse(sessions, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/vehicles/:id/current-load
  fastify.get('/:id/current-load', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await fastify.prisma.dispatchSession.findFirst({
      where: { vehicleId: id, status: 'OPEN' },
      include: {
        purchaseOrder: {
          include: {
            client: true,
            lineItems: { include: { variant: { include: { product: true } } } },
          },
        },
        supervisor: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    return reply.send(successResponse(session));
  });
};
