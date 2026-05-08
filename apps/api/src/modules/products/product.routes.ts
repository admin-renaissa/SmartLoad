import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ProductStatus,
  UserRole,
  successResponse,
  errorResponse,
  parsePagination,
  buildPaginationMeta
} from '@smartload/shared';

const createProductSchema = z.object({
  sku: z.string().min(2).toUpperCase(),
  name: z.string().min(2),
  categoryId: z.string().min(1),
  hsnCode: z.string().optional(),
  unitOfMeasure: z.string().default('BOX'),
  piecesPerBox: z.number().int().positive(),
  weightPerBoxKg: z.number().positive().optional(),
  description: z.string().optional(),
  materialType: z.string().optional(),
  specifications: z.record(z.any()).optional(),
  usageGuide: z.string().optional(),
  packagingDetails: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minStockAlert: z.number().int().min(0).default(0),
  status: z.nativeEnum(ProductStatus).optional(),
});

// ─── Inventory stock-health helpers ──────────────────────────────────────────

/**
 * Classify a product into an inventory health bucket.
 * availableBoxes = totalBoxes - reservedBoxes across ALL its variants.
 */
function classifyProductStockHealth(
  variants: Array<{ inventoryStock: { totalBoxes: number; reservedBoxes: number } | null }>,
  minStockAlert: number,
): 'available' | 'low-stock' | 'out-of-stock' | 'no-stock-data' {
  if (!variants.length) return 'no-stock-data';

  // Sum across all variants
  const totalAvailable = variants.reduce((sum, v) => {
    if (!v.inventoryStock) return sum;
    return sum + Math.max(0, v.inventoryStock.totalBoxes - v.inventoryStock.reservedBoxes);
  }, 0);

  const hasStockData = variants.some((v) => v.inventoryStock !== null);
  if (!hasStockData) return 'no-stock-data';

  if (totalAvailable <= 0) return 'out-of-stock';
  if (totalAvailable <= minStockAlert) return 'low-stock';
  return 'available';
}

/**
 * Build Prisma `where` clause additions for stock-health filters.
 * Uses nested variant → inventoryStock filtering.
 */
function buildStockFilterWhere(stockFilter: string): Record<string, any> {
  switch (stockFilter) {
    case 'available':
      // At least one variant whose available stock > 0 (we post-filter more precisely in application)
      return {
        variants: {
          some: {
            inventoryStock: { isNot: null },
          },
        },
      };
    case 'low-stock':
      return {
        variants: {
          some: {
            inventoryStock: { isNot: null },
          },
        },
      };
    case 'out-of-stock':
      // Products where every variant either has no stock record or available <= 0
      // We use a DB-friendly approach: product has no variant with available > 0
      return {}; // refined in application code post-fetch
    case 'archived':
      return { status: ProductStatus.ARCHIVED };
    default:
      return {};
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/products
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      categoryId?: string;
      status?: string;
      isDeleted?: string;
      search?: string;
      stockFilter?: string; // 'available' | 'low-stock' | 'out-of-stock' | 'archived'
    };
    const { page, limit, skip } = parsePagination({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    });

    const stockFilter = query.stockFilter?.toLowerCase() ?? '';

    const where: Record<string, any> = {};
    if (query.categoryId) where.categoryId = query.categoryId;

    // Default: exclude deleted products unless explicitly requested
    where.isDeleted = query.isDeleted === 'true';

    // Stock-based lifecycle override: archived filter maps to status
    if (stockFilter === 'archived') {
      where.status = ProductStatus.ARCHIVED;
      where.isDeleted = false;
    } else if (query.status) {
      where.status = query.status as ProductStatus;
    }

    // Add stock pre-filter hint (broad) — refined in application code below
    if (stockFilter && stockFilter !== 'archived') {
      const stockWhere = buildStockFilterWhere(stockFilter);
      Object.assign(where, stockWhere);
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    try {
      // When a stock filter is active (except archived), we need to fetch with inventory
      // data to do precise application-level classification, then paginate in code.
      const needsStockClassification = stockFilter && stockFilter !== 'archived';

      if (needsStockClassification) {
        // Fetch ALL matching products with inventory data for precise classification
        const allProducts = await fastify.prisma.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            category: { select: { id: true, name: true, slug: true } },
            _count: { select: { variants: true } },
            variants: {
              select: {
                id: true,
                inventoryStock: {
                  select: { totalBoxes: true, reservedBoxes: true },
                },
              },
            },
          },
        });

        // Classify and filter precisely
        const filtered = allProducts.filter((p) => {
          const health = classifyProductStockHealth(p.variants, p.minStockAlert);
          if (stockFilter === 'available') return health === 'available';
          if (stockFilter === 'low-stock') return health === 'low-stock';
          if (stockFilter === 'out-of-stock') return health === 'out-of-stock' || health === 'no-stock-data';
          return true;
        });

        // Apply pagination in application code
        const total = filtered.length;
        const paginated = filtered.slice(skip, skip + limit);

        // Strip variants from response (not needed by list UI)
        const items = paginated.map(({ variants: _v, ...rest }) => ({
          ...rest,
          stockHealth: classifyProductStockHealth(
            (paginated.find((p) => p.id === rest.id)?.variants ?? []),
            rest.minStockAlert,
          ),
        }));

        return reply.send(successResponse(items, buildPaginationMeta(total, page, limit)));
      }

      // Standard path: no stock classification needed
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
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch products');
      return reply.code(500).send(errorResponse('Failed to fetch products'));
    }
  });

  // GET /api/v1/products/stats
  fastify.get('/stats', { preHandler: fastify.requireAuth }, async (request, reply) => {
    try {
      // Lifecycle counts
      const [total, active, inactive, archived, deleted] = await Promise.all([
        fastify.prisma.product.count({ where: { isDeleted: false } as any }),
        fastify.prisma.product.count({ where: { status: ProductStatus.ACTIVE, isDeleted: false } as any }),
        fastify.prisma.product.count({ where: { status: ProductStatus.INACTIVE, isDeleted: false } as any }),
        fastify.prisma.product.count({ where: { status: ProductStatus.ARCHIVED, isDeleted: false } as any }),
        fastify.prisma.product.count({ where: { isDeleted: true } as any }),
      ]);

      // Inventory health counts — fetch non-deleted, non-archived products with stock data
      const productsWithStock = await fastify.prisma.product.findMany({
        where: { isDeleted: false, status: { not: ProductStatus.ARCHIVED } } as any,
        select: {
          id: true,
          minStockAlert: true,
          variants: {
            select: {
              inventoryStock: {
                select: { totalBoxes: true, reservedBoxes: true },
              },
            },
          },
        },
      });

      let stockAvailable = 0;
      let stockLow = 0;
      let stockOut = 0;

      for (const p of productsWithStock) {
        const health = classifyProductStockHealth(p.variants, p.minStockAlert);
        if (health === 'available') stockAvailable++;
        else if (health === 'low-stock') stockLow++;
        else if (health === 'out-of-stock' || health === 'no-stock-data') stockOut++;
      }

      return reply.send(successResponse({
        total,
        active,
        inactive,
        archived,
        deleted,
        // Inventory health
        stockAvailable,
        stockLow,
        stockOut,
      }));
    } catch (err) {
      fastify.log.error(err, 'Failed to fetch product stats');
      return reply.code(500).send(errorResponse('Failed to fetch product stats'));
    }
  });

  // POST /api/v1/products
  fastify.post('/', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    try {
      const dto = createProductSchema.parse(request.body);

      // Validate category exists before creating
      const category = await fastify.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        return reply.code(400).send(errorResponse('Category not found. Please select a valid category.'));
      }

      const product = await fastify.prisma.product.create({
        data: dto,
        include: { category: true },
      });
      return reply.code(201).send(successResponse(product));
    } catch (err) {
      const e = err as { code?: string; issues?: unknown[]; message?: string };
      // Zod validation error
      if (e.issues) {
        return reply.code(400).send(errorResponse(`Validation error: ${(e.issues as { message: string }[])[0]?.message ?? 'Invalid input'}`));
      }
      // Prisma unique constraint (duplicate SKU)
      if (e.code === 'P2002') {
        return reply.code(409).send(errorResponse('A product with this SKU already exists.'));
      }
      fastify.log.error({ err }, 'Failed to create product');
      return reply.code(500).send(errorResponse('Failed to create product'));
    }
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

    // If status is changed, update variants status as well
    if (dto.status) {
      await fastify.prisma.productVariant.updateMany({
        where: { productId: id },
        data: { status: dto.status, isActive: dto.status === ProductStatus.ACTIVE } as any
      });
      // Sync isActive for backward compatibility
      (dto as any).isActive = dto.status === ProductStatus.ACTIVE;
    }

    const product = await fastify.prisma.product.update({
      where: { id },
      data: dto as any, 
      include: { category: true } as any
    });

    return reply.send(successResponse(product));
  });

  // POST /api/v1/products/:id/status
  fastify.post('/:id/status', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = z.object({ status: z.nativeEnum(ProductStatus) }).parse(request.body);

    const product = await fastify.prisma.product.update({
      where: { id },
      data: {
        status,
        isActive: status === ProductStatus.ACTIVE
      } as any
    });

    // Cascade to variants
    await fastify.prisma.productVariant.updateMany({
      where: { productId: id },
      data: { 
        status,
        isActive: status === ProductStatus.ACTIVE
      } as any
    });

    return reply.send(successResponse(product));
  });

  // POST /api/v1/products/:id/restore
  fastify.post('/:id/restore', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await fastify.prisma.product.update({
      where: { id },
      data: { 
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        status: ProductStatus.ACTIVE,
        isActive: true
      } as any
    });

    // Restore variants status as well
    await fastify.prisma.productVariant.updateMany({
      where: { productId: id },
      data: { 
        status: ProductStatus.ACTIVE,
        isActive: true
      } as any
    });

    return reply.send(successResponse(product));
  });

  // DELETE /api/v1/products/:id (Soft Delete / Move to Trash)
  fastify.delete('/:id', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const product = await fastify.prisma.product.findUnique({
      where: { id },
      include: {
        variants: true
      }
    });

    if (!product) return reply.code(404).send(errorResponse('Product not found'));

    // Move to trash
    await fastify.prisma.product.update({ 
      where: { id }, 
      data: { 
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: user.userId,
        isActive: false,
        status: ProductStatus.INACTIVE // Move to inactive when in trash
      } as any
    });

    // Deactivate variants
    await fastify.prisma.productVariant.updateMany({
      where: { productId: id },
      data: { 
        isActive: false,
        status: ProductStatus.INACTIVE
      } as any
    });

    return reply.send(successResponse({ message: 'Product moved to trash' }));
  });

  // DELETE /api/v1/products/:id/permanent (Permanent Delete)
  fastify.delete('/:id/permanent', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await fastify.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            _count: {
              select: {
                poLineItems: true,
                grnLineItems: true,
                inventoryLedger: true
              }
            },
            inventoryStock: true
          }
        }
      }
    });

    if (!product) return reply.code(404).send(errorResponse('Product not found'));

    // Dependency check
    const hasOrders = product.variants.some(v => v._count.poLineItems > 0);
    const hasInventoryHistory = product.variants.some(v => v._count.inventoryLedger > 0 || (v.inventoryStock && v.inventoryStock.totalBoxes > 0));

    if (hasOrders || hasInventoryHistory) {
      return reply.code(400).send(errorResponse('Cannot permanently delete product because it has associated orders or inventory history. Please Archive it instead.'));
    }

    // Safe to delete everything related to this product
    // Usually we would use a transaction or rely on cascade deletes if configured
    await fastify.prisma.$transaction([
      fastify.prisma.inventoryStock.deleteMany({ where: { variantId: { in: product.variants.map(v => v.id) } } }),
      fastify.prisma.productVariant.deleteMany({ where: { productId: id } }),
      fastify.prisma.product.delete({ where: { id } }),
    ]);

    return reply.send(successResponse({ message: 'Product permanently deleted' }));
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
