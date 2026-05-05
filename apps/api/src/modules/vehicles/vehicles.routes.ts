import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { SessionStatus } from '@prisma/client';
import { successResponse, UserRole, AppError } from '@smartload/shared';
import {
  createVehicleSchema,
  updateVehicleSchema,
  listVehiclesQuerySchema,
  vehicleHistoryQuerySchema,
} from './vehicles.schema.js';
import { VehicleService } from './vehicles.service.js';

function sendAppError(err: unknown, reply: FastifyReply): boolean {
  if (!(err instanceof AppError)) return false;
  const body: Record<string, unknown> = {
    success: false,
    data: null,
    error: err.message,
  };
  if (err.code) body.code = err.code;
  reply.code(err.statusCode).send(body);
  return true;
}

export const vehiclesRoutes: FastifyPluginAsync = async (fastify) => {
  const svc = () => new VehicleService(fastify);

  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = listVehiclesQuerySchema.parse(request.query);
    const { vehicles, meta } = await svc().listVehicles(query);
    return reply.send(successResponse(vehicles, meta));
  });

  fastify.get('/available', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const vehicles = await svc().getAvailableVehicles();
    return reply.send(successResponse(vehicles));
  });

  fastify.post(
    '/',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const body = createVehicleSchema.parse(request.body);
      try {
        const v = await svc().createVehicle(body);
        return reply.code(201).send(successResponse(v));
      } catch (err) {
        if (sendAppError(err, reply)) return;
        throw err;
      }
    },
  );

  fastify.get('/:id/history', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = vehicleHistoryQuerySchema.parse(request.query);
    try {
      const { meta, vehicle, sessions, stats } = await svc().getVehicleHistory(id, query);
      return reply.send(successResponse({ vehicle, sessions, stats }, meta));
    } catch (err) {
      if (sendAppError(err, reply)) return;
      throw err;
    }
  });

  fastify.get('/:id/current-load', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await fastify.prisma.dispatchSession.findFirst({
      where: { vehicleId: id, status: SessionStatus.OPEN },
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

  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const v = await svc().getVehicleById(id);
      return reply.send(successResponse(v));
    } catch (err) {
      if (sendAppError(err, reply)) return;
      throw err;
    }
  });

  fastify.patch(
    '/:id',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateVehicleSchema.parse(request.body ?? {});
      try {
        const v = await svc().updateVehicle(id, body);
        return reply.send(successResponse(v));
      } catch (err) {
        if (sendAppError(err, reply)) return;
        throw err;
      }
    },
  );

  fastify.delete(
    '/:id',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await svc().deactivateVehicle(id);
        return reply.send(successResponse({ deactivated: true }));
      } catch (err) {
        if (sendAppError(err, reply)) return;
        throw err;
      }
    },
  );
};
