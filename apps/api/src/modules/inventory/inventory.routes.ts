import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';
import { InventoryService } from './inventory.service.js';
import {
  listStockQuerySchema,
  ledgerQuerySchema,
  adjustStockSchema,
  transferStockSchema,
} from './inventory.schema.js';
import { AppError } from '@smartload/shared';

function replyAppError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      data: null,
      error: err.message,
    };
    if (err.code) body.code = err.code;
    return reply.code(err.statusCode).send(body);
  }
  return false;
}

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  const svc = () => new InventoryService(fastify);

  fastify.get(
    '/export',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.SUPERVISOR) },
    async (_request, reply) => {
      const buf = await svc().exportToExcel();
      const d = new Date().toISOString().slice(0, 10);
      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      reply.header(
        'Content-Disposition',
        `attachment; filename="stock-report-${d}.xlsx"`,
      );
      return reply.send(buf);
    },
  );

  fastify.get(
    '/valuation',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS) },
    async (_request, reply) => {
      const data = await svc().getInventoryValuation();
      return reply.send(successResponse(data));
    },
  );

  fastify.get('/low-stock', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const data = await svc().getLowStockVariants();
    return reply.send(successResponse(data));
  });

  fastify.post(
    '/import-opening-stock',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const data = await request.file();
      if (!data)
        throw new AppError('No file uploaded', 400);
      const buffer = await data.toBuffer();
      try {
        const result = await svc().importOpeningStock(buffer, request.user.userId);
        return reply.send(successResponse(result));
      } catch (err) {
        if (replyAppError(reply, err)) return;
        throw err;
      }
    },
  );

  fastify.post(
    '/transfer',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const body = transferStockSchema.parse(request.body);
      try {
        const out = await svc().transferStock(body, request.user.userId);
        return reply.send(successResponse(out));
      } catch (err) {
        if (replyAppError(reply, err)) return;
        throw err;
      }
    },
  );

  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = listStockQuerySchema.parse(request.query);
    const { stocks, meta } = await svc().getStockSummary(query);
    return reply.send(successResponse(stocks, meta));
  });

  fastify.get(
    '/:variantId/ledger',
    { preHandler: fastify.requireAuth },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const query = ledgerQuerySchema.parse(request.query);
      try {
        const { meta, ...rest } = await svc().getVariantLedger(variantId, query);
        return reply.send(successResponse(rest, meta));
      } catch (err) {
        if (replyAppError(reply, err)) return;
        throw err;
      }
    },
  );

  fastify.get('/:variantId', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { variantId } = request.params as { variantId: string };
    try {
      const data = await svc().getVariantStockDetail(variantId);
      return reply.send(successResponse(data));
    } catch (err) {
      if (replyAppError(reply, err)) return;
      throw err;
    }
  });

  fastify.post(
    '/:variantId/adjust',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const body = adjustStockSchema.parse(request.body);
      try {
        const data = await svc().adjustStock(variantId, body, request.user.userId);
        return reply.send(successResponse(data));
      } catch (err) {
        if (replyAppError(reply, err)) return;
        throw err;
      }
    },
  );
};
