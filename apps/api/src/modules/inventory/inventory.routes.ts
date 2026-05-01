import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { buildPaginationMeta } from '@smartload/shared';
import { parsePagination } from '@smartload/shared';
import { InventoryService } from './inventory.service.js';

function sendServiceErrorIfApplicable(err: unknown, reply: FastifyReply): boolean {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const o = err as { statusCode?: number; message?: string };
    if (typeof o.statusCode === 'number' && typeof o.message === 'string') {
      reply.code(o.statusCode).send(errorResponse(o.message));
      return true;
    }
  }
  return false;
}

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  const getService = () => new InventoryService(fastify.prisma);

  // Static paths MUST be registered before /:variantId/… so names like "valuation" are not captured.

  // GET /api/v1/inventory/valuation
  fastify.get('/valuation', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const data = await getService().getInventoryValuation();
    return reply.send(successResponse(data));
  });

  // GET /api/v1/inventory/low-stock
  fastify.get('/low-stock', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const { page, limit } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });
    const { items, total } = await getService().getStockSummary({
      filters: { lowStockOnly: true },
      page,
      limit,
    });
    return reply.send(successResponse(items, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/inventory — stock summary (paginated, filters)
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      categoryId?: string;
      lowStockOnly?: string;
      search?: string;
      variantId?: string;
    };
    const { page, limit } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });
    const { items, total } = await getService().getStockSummary({
      filters: {
        variantId: query.variantId,
        categoryId: query.categoryId,
        lowStockOnly: query.lowStockOnly === 'true' || query.lowStockOnly === '1',
        search: query.search,
      },
      page,
      limit,
    });
    return reply.send(successResponse(items, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/inventory/:variantId/ledger
  fastify.get('/:variantId/ledger', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { variantId } = request.params as { variantId: string };
    const query = request.query as { page?: string; limit?: string; dateFrom?: string; dateTo?: string };
    const { page, limit } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });
    const { items, total } = await getService().getVariantLedger(variantId, {
      page,
      limit,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    return reply.send(successResponse(items, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/inventory/transfer (ADMIN) — before /:variantId/adjust
  fastify.post(
    '/transfer',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const body = z
        .object({
          fromVariantId: z.string().cuid(),
          toVariantId: z.string().cuid(),
          boxes: z.number().int().positive(),
          reason: z.string().min(1),
        })
        .parse(request.body);
      try {
        const data = await getService().stockTransfer({
          fromVariantId: body.fromVariantId,
          toVariantId: body.toVariantId,
          boxes: body.boxes,
          reason: body.reason,
          userId: request.user.userId,
        });
        return reply.send(successResponse(data));
      } catch (err) {
        if (sendServiceErrorIfApplicable(err, reply)) return;
        throw err;
      }
    },
  );

  // POST /api/v1/inventory/:variantId/adjust (ADMIN)
  fastify.post(
    '/:variantId/adjust',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const dto = z
        .object({
          boxes: z.number().int().refine((n) => n !== 0, { message: 'boxes cannot be zero' }),
          reason: z.string().min(1),
        })
        .parse(request.body);
      try {
        const ledger = await getService().adjustStock({
          variantId,
          boxes: dto.boxes,
          reason: dto.reason,
          userId: request.user.userId,
        });
        return reply.send(successResponse(ledger));
      } catch (err) {
        if (sendServiceErrorIfApplicable(err, reply)) return;
        throw err;
      }
    },
  );
};
