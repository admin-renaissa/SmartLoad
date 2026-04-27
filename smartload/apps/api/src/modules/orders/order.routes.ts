import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { POStatus } from '@prisma/client';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';
import { OrderService } from './order.service.js';

const lineItemSchema = z.object({
  variantId: z.string().cuid(),
  orderedBoxes: z.number().int().positive(),
  ratePerBoxPaise: z.number().int().positive(),
  gstPercent: z.number().min(0).max(28).optional(),
});

const createOrderSchema = z.object({
  clientId: z.string().cuid(),
  orderDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expectedDispatchDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

export const orderRoutes: FastifyPluginAsync = async (fastify) => {
  const getService = () => new OrderService(fastify.prisma);

  // GET /api/v1/orders
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as {
      page?: string; limit?: string; status?: POStatus;
      clientId?: string; search?: string; dateFrom?: string; dateTo?: string;
    };
    const { page, limit } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const { orders, total } = await getService().listPOs({
      status: query.status,
      clientId: query.clientId,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page,
      limit,
    });

    return reply.send(successResponse(orders, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/orders
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const body = createOrderSchema.extend({ confirmImmediately: z.boolean().optional() }).parse(request.body);
    const { confirmImmediately, ...dto } = body;
    const { po, warnings } = await getService().createPO(dto, request.user.userId);

    if (confirmImmediately && po.status === 'DRAFT') {
      const confirmed = await fastify.prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: POStatus.CONFIRMED },
      });
      return reply.code(201).send(successResponse({ ...confirmed, warnings }));
    }

    return reply.code(201).send(successResponse({ ...po, warnings }));
  });

  // GET /api/v1/orders/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const po = await getService().getPOWithDetails(id);
    return reply.send(successResponse(po));
  });

  // PATCH /api/v1/orders/:id
  fastify.patch('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = z.object({
      notes: z.string().optional(),
      expectedDispatchDate: z.string().optional(),
    }).parse(request.body);

    const po = await fastify.prisma.purchaseOrder.update({
      where: { id },
      data: { ...dto, updatedById: request.user.userId },
    });
    return reply.send(successResponse(po));
  });

  // DELETE /api/v1/orders/:id (cancel)
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body || {});
    await getService().cancelPO(id, reason, request.user.userId);
    return reply.send(successResponse({ message: 'Order cancelled' }));
  });

  // PATCH /api/v1/orders/:id/cancel
  fastify.patch('/:id/cancel', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().optional() }).parse(request.body || {});
    await getService().cancelPO(id, reason || 'Cancelled via dashboard', request.user.userId);
    return reply.send(successResponse({ message: 'Order cancelled' }));
  });

  // PATCH /api/v1/orders/:id/confirm
  fastify.patch('/:id/confirm', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const po = await fastify.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return reply.code(404).send(errorResponse('Order not found'));
    if (po.status !== POStatus.DRAFT) {
      return reply.code(400).send(errorResponse('Only DRAFT orders can be confirmed'));
    }
    const updated = await fastify.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.CONFIRMED },
    });
    return reply.send(successResponse(updated));
  });

  // POST /api/v1/orders/:id/confirm
  fastify.post('/:id/confirm', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const po = await fastify.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return reply.code(404).send(errorResponse('Order not found'));
    if (po.status !== POStatus.DRAFT) {
      return reply.code(400).send(errorResponse('Only DRAFT orders can be confirmed'));
    }
    const updated = await fastify.prisma.purchaseOrder.update({
      where: { id },
      data: { status: POStatus.CONFIRMED },
    });
    return reply.send(successResponse(updated));
  });

  // GET /api/v1/orders/:id/manifest (simple JSON manifest — PDF in Phase 3)
  fastify.get('/:id/manifest', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const po = await getService().getPOWithDetails(id);
    return reply.send(successResponse(po));
  });
};
