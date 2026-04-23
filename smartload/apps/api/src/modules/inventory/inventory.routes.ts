import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/inventory
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; categoryId?: string; lowStockOnly?: string; search?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const variantWhere: Record<string, unknown> = { isActive: true };
    if (query.search) {
      variantWhere.OR = [
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { product: { sku: { contains: query.search, mode: 'insensitive' } } },
        { colourName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) variantWhere.product = { categoryId: query.categoryId };

    const stocks = await fastify.prisma.inventoryStock.findMany({
      include: {
        variant: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    const filtered = stocks
      .map((s) => ({
        ...s,
        availableBoxes: s.totalBoxes - s.reservedBoxes,
        availablePieces: (s.totalBoxes - s.reservedBoxes) * s.variant.product.piecesPerBox,
        isLowStock: (s.totalBoxes - s.reservedBoxes) <= s.variant.product.minStockAlert,
      }))
      .filter((s) => !query.lowStockOnly || s.isLowStock);

    const total = await fastify.prisma.inventoryStock.count();
    return reply.send(successResponse(filtered, buildPaginationMeta(total, page, limit)));
  });

  // GET /api/v1/inventory/:variantId/ledger
  fastify.get('/:variantId/ledger', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { variantId } = request.params as { variantId: string };
    const query = request.query as { page?: string; limit?: string; dateFrom?: string; dateTo?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = { variantId };
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [ledger, total] = await Promise.all([
      fastify.prisma.inventoryLedger.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      fastify.prisma.inventoryLedger.count({ where }),
    ]);

    return reply.send(successResponse(ledger, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/inventory/:variantId/adjust (ADMIN only)
  fastify.post('/:variantId/adjust', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { variantId } = request.params as { variantId: string };
    const dto = z.object({
      boxes: z.number().int().refine((n) => n !== 0, { message: 'boxes cannot be zero' }),
      reason: z.string().min(1),
    }).parse(request.body);

    const stock = await fastify.prisma.inventoryStock.findUnique({ where: { variantId } });
    const currentBoxes = stock?.totalBoxes || 0;
    const newTotal = currentBoxes + dto.boxes;

    if (newTotal < 0) {
      return reply.code(400).send({ success: false, data: null, error: 'Insufficient stock for this adjustment' });
    }

    const [ledger] = await fastify.prisma.$transaction([
      fastify.prisma.inventoryLedger.create({
        data: {
          variantId,
          movementType: 'ADJUSTMENT',
          boxes: dto.boxes,
          pieces: 0,
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: `ADJ-${Date.now()}`,
          notes: dto.reason,
          createdById: request.user.userId,
        },
      }),
      fastify.prisma.inventoryStock.upsert({
        where: { variantId },
        update: { totalBoxes: { increment: dto.boxes } },
        create: { variantId, totalBoxes: Math.max(0, dto.boxes), reservedBoxes: 0 },
      }),
    ]);

    return reply.send(successResponse(ledger));
  });

  // GET /api/v1/inventory/low-stock
  fastify.get('/low-stock', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const stocks = await fastify.prisma.inventoryStock.findMany({
      include: { variant: { include: { product: true } } },
    });

    const lowStock = stocks.filter(
      (s) => (s.totalBoxes - s.reservedBoxes) <= s.variant.product.minStockAlert,
    );

    return reply.send(successResponse(lowStock));
  });

  // GET /api/v1/inventory/valuation
  fastify.get('/valuation', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const stocks = await fastify.prisma.inventoryStock.findMany({
      include: { variant: { include: { product: { include: { category: true } } } } },
    });

    const byCategory: Record<string, { categoryName: string; totalValue: number; totalBoxes: number }> = {};
    let grandTotal = 0;

    for (const s of stocks) {
      const available = s.totalBoxes - s.reservedBoxes;
      const value = available * (s.variant.mrp || 0);
      const catName = s.variant.product.category.name;
      grandTotal += value;

      if (!byCategory[catName]) {
        byCategory[catName] = { categoryName: catName, totalValue: 0, totalBoxes: 0 };
      }
      byCategory[catName].totalValue += value;
      byCategory[catName].totalBoxes += available;
    }

    return reply.send(successResponse({ grandTotal, byCategory: Object.values(byCategory) }));
  });
};
