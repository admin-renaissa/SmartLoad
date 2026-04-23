import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

const createGRNSchema = z.object({
  receivedDate: z.string(),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    variantId: z.string().cuid(),
    receivedBoxes: z.number().int().positive(),
  })).min(1),
});

export const grnRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/grn
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const [grns, total] = await Promise.all([
      fastify.prisma.goodsReceiptNote.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { lineItems: true } },
        },
      }),
      fastify.prisma.goodsReceiptNote.count(),
    ]);

    return reply.send(successResponse(grns, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/grn
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) }, async (request, reply) => {
    const dto = createGRNSchema.parse(request.body);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await fastify.prisma.goodsReceiptNote.count({
      where: { grnNumber: { startsWith: `GRN-${today}` } },
    });
    const grnNumber = `GRN-${today}-${String(count + 1).padStart(4, '0')}`;

    const grn = await fastify.prisma.$transaction(async (tx) => {
      const g = await tx.goodsReceiptNote.create({
        data: {
          grnNumber,
          receivedDate: new Date(dto.receivedDate),
          notes: dto.notes,
          createdById: request.user.userId,
          lineItems: {
            create: dto.lineItems.map((li) => ({
              variantId: li.variantId,
              receivedBoxes: li.receivedBoxes,
              receivedPieces: 0, // updated below after product lookup
            })),
          },
        },
        include: {
          lineItems: { include: { variant: { include: { product: true } } } },
        },
      });

      for (const li of g.lineItems) {
        const receivedPieces = li.receivedBoxes * li.variant.product.piecesPerBox;

        await tx.gRNLineItem.update({
          where: { id: li.id },
          data: { receivedPieces },
        });

        await tx.inventoryStock.upsert({
          where: { variantId: li.variantId },
          update: { totalBoxes: { increment: li.receivedBoxes } },
          create: { variantId: li.variantId, totalBoxes: li.receivedBoxes, reservedBoxes: 0 },
        });

        await tx.inventoryLedger.create({
          data: {
            variantId: li.variantId,
            movementType: 'INWARD',
            boxes: li.receivedBoxes,
            pieces: receivedPieces,
            referenceType: 'GRN',
            referenceId: g.id,
            notes: `GRN: ${grnNumber}`,
            createdById: request.user.userId,
          },
        });
      }

      return g;
    });

    return reply.code(201).send(successResponse(grn));
  });

  // GET /api/v1/grn/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const grn = await fastify.prisma.goodsReceiptNote.findUnique({
      where: { id },
      include: {
        lineItems: { include: { variant: { include: { product: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!grn) return reply.code(404).send(errorResponse('GRN not found'));
    return reply.send(successResponse(grn));
  });
};
