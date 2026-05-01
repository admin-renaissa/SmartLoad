import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';

const createProductSchema = z.object({
  sku: z.string().min(2).toUpperCase(),
  name: z.string().min(2),
  categoryId: z.string().cuid(),
  hsnCode: z.string().optional(),
  unitOfMeasure: z.string().default('BOX'),
  piecesPerBox: z.number().int().positive(),
  weightPerBoxKg: z.number().positive().optional(),
  minStockAlert: z.number().int().min(0).default(0),
});

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/products
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; categoryId?: string; isActive?: string; search?: string };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      fastify.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { variants: true } },
        },
      }),
      fastify.prisma.product.count({ where }),
    ]);

    return reply.send(successResponse(products, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/products
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const dto = createProductSchema.parse(request.body);
    const product = await fastify.prisma.product.create({
      data: dto,
      include: { category: true },
    });
    return reply.code(201).send(successResponse(product));
  });

  fastify.post('/labels/pdf', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const dto = z.object({ variantIds: z.array(z.string().cuid()).min(1).max(500) }).parse(request.body);
    const { generateVariantLabelsPdfBuffer } = await import('./label-pdf.service.js');
    try {
      const buf = await generateVariantLabelsPdfBuffer(fastify.prisma, dto.variantIds);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', 'attachment; filename="variant-labels.pdf"');
      return reply.send(buf);
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      const code = e.statusCode === 400 ? 400 : 500;
      return reply.code(code).send(errorResponse(e.message || 'Failed to generate label PDF'));
    }
  });

  // GET /api/v1/products/:id
  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await fastify.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            inventoryStock: true,
          },
          orderBy: { colourCode: 'asc' },
        },
      },
    });
    if (!product) return reply.code(404).send(errorResponse('Product not found'));
    return reply.send(successResponse(product));
  });

  // PATCH /api/v1/products/:id
  fastify.patch('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dto = createProductSchema.partial().parse(request.body);
    const product = await fastify.prisma.product.update({ where: { id }, data: dto, include: { category: true } });
    return reply.send(successResponse(product));
  });

  // DELETE /api/v1/products/:id
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.prisma.product.update({ where: { id }, data: { isActive: false } });
    return reply.send(successResponse({ message: 'Product deactivated' }));
  });

  // POST /api/v1/products/import (CSV bulk import)
  fastify.post('/import', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send(errorResponse('No file uploaded'));

    const { parse } = await import('csv-parse/sync');
    const buffer = await data.toBuffer();
    
    type CSVRow = {
      sku: string;
      name: string;
      category_slug: string;
      hsn_code: string;
      unit_of_measure: string;
      pieces_per_box: string;
      weight_per_box_kg: string;
      min_stock_alert: string;
    };

    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CSVRow[];

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const category = await fastify.prisma.productCategory.findUnique({
          where: { slug: row.category_slug?.toLowerCase() },
        });
        if (!category) {
          errors.push(`Row ${row.sku}: Category '${row.category_slug}' not found`);
          continue;
        }

        const existing = await fastify.prisma.product.findUnique({ where: { sku: row.sku?.toUpperCase() } });
        if (existing) {
          await fastify.prisma.product.update({
            where: { sku: row.sku.toUpperCase() },
            data: {
              name: row.name,
              categoryId: category.id,
              hsnCode: row.hsn_code || null,
              unitOfMeasure: row.unit_of_measure || 'BOX',
              piecesPerBox: parseInt(row.pieces_per_box) || 1,
              weightPerBoxKg: parseFloat(row.weight_per_box_kg) || null,
              minStockAlert: parseInt(row.min_stock_alert) || 0,
            },
          });
          updated++;
        } else {
          await fastify.prisma.product.create({
            data: {
              sku: row.sku.toUpperCase(),
              name: row.name,
              categoryId: category.id,
              hsnCode: row.hsn_code || null,
              unitOfMeasure: row.unit_of_measure || 'BOX',
              piecesPerBox: parseInt(row.pieces_per_box) || 1,
              weightPerBoxKg: parseFloat(row.weight_per_box_kg) || null,
              minStockAlert: parseInt(row.min_stock_alert) || 0,
            },
          });
          created++;
        }
      } catch (e) {
        errors.push(`Row ${row.sku}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    return reply.send(successResponse({ created, updated, errors, total: rows.length }));
  });

  // GET /api/v1/products/export
  fastify.get('/export', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const products = await fastify.prisma.product.findMany({
      include: { category: true, variants: true },
      orderBy: { sku: 'asc' },
    });

    const rows = products.flatMap((p) =>
      p.variants.map((v) => ({
        SKU: p.sku,
        Name: p.name,
        Category: p.category.name,
        HSNCode: p.hsnCode || '',
        UnitOfMeasure: p.unitOfMeasure,
        PiecesPerBox: p.piecesPerBox,
        WeightKg: p.weightPerBoxKg || '',
        ColourCode: v.colourCode,
        ColourName: v.colourName,
        LengthMm: v.lengthMm || '',
        WidthMm: v.widthMm || '',
        ThicknessMm: v.thicknessMm || '',
        BarcodeValue: v.barcodeValue,
        BarcodeFormat: v.barcodeFormat,
        MRP: v.mrpPaise ? (v.mrpPaise / 100).toFixed(2) : '',
        Active: v.isActive ? 'Yes' : 'No',
      })),
    );

    const csvHeader = Object.keys(rows[0] || {}).join(',');
    const csvRows = rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(','));
    const csv = [csvHeader, ...csvRows].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="products-export.csv"');
    return reply.send(csv);
  });

  // Product categories CRUD
  fastify.get('/categories', { preHandler: fastify.requireAuth }, async (_request, reply) => {
    const categories = await fastify.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
    });
    return reply.send(successResponse(categories));
  });

  fastify.post('/categories', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const dto = z.object({
      name: z.string().min(2),
      slug: z.string().min(2).toLowerCase(),
      description: z.string().optional(),
    }).parse(request.body);
    const category = await fastify.prisma.productCategory.create({ data: dto });
    return reply.code(201).send(successResponse(category));
  });
};
