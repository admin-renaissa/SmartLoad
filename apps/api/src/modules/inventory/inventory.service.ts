import type { FastifyInstance } from 'fastify';
import { MovementType as PrismaMovementType } from '@prisma/client';
import {
  AppError,
  MovementType,
  parsePagination,
  buildPaginationMeta,
} from '@smartload/shared';
import type {
  AdjustStockInput,
  TransferStockInput,
  ListStockQuery,
  LedgerQuery,
} from './inventory.schema.js';

type EnrichedStock = {
  variantId: string;
  variant: {
    id: string;
    colourCode: string;
    colourName: string;
    lengthMm: number | null;
    widthMm: number | null;
    thicknessMm: number | null;
    mrpPaise: number | null;
    product: {
      sku: string;
      name: string;
      piecesPerBox: number;
      minStockAlert: number;
      category: { name: string; id: string };
    };
  };
  totalBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  totalPieces: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  updatedAt: Date;
};

function urgencyRank(s: EnrichedStock): number {
  if (s.isOutOfStock) return 0;
  if (s.isLowStock) return 1;
  return 2;
}

export class InventoryService {
  constructor(private readonly app: FastifyInstance) {}

  /** Full stock rows for Excel export — not limited by API pagination caps. */
  private async fetchAllStockRowsForExport() {
    const stocks = await this.app.prisma.inventoryStock.findMany({
      where: { variant: { isActive: true } },
      include: {
        variant: { include: { product: { include: { category: true } } } },
      },
    });
    return stocks.map((s) => ({
      variantId: s.variantId,
      variant: s.variant,
      totalBoxes: s.totalBoxes,
      reservedBoxes: s.reservedBoxes,
      availableBoxes: s.totalBoxes - s.reservedBoxes,
      totalPieces: (s.totalBoxes - s.reservedBoxes) * s.variant.product.piecesPerBox,
      isLowStock:
        s.totalBoxes - s.reservedBoxes <= s.variant.product.minStockAlert &&
        s.totalBoxes - s.reservedBoxes >= 0,
      isOutOfStock: s.totalBoxes - s.reservedBoxes <= 0,
      updatedAt: s.updatedAt,
    }));
  }

  async getStockSummary(query: ListStockQuery) {
    const { skip, take, page } = parsePagination(query);

    const variantWhere: Record<string, unknown> = { isActive: true };
    if (query.categoryId) {
      variantWhere.product = { categoryId: query.categoryId };
    }
    if (query.variantId) {
      variantWhere.id = query.variantId;
    }
    if (query.search) {
      variantWhere.OR = [
        { product: { name: { contains: query.search, mode: 'insensitive' } } },
        { product: { sku: { contains: query.search, mode: 'insensitive' } } },
        { colourName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const stocks = await this.app.prisma.inventoryStock.findMany({
      where: { variant: variantWhere },
      include: {
        variant: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
    });

    let enriched: EnrichedStock[] = stocks.map((s) => {
      const availableBoxes = s.totalBoxes - s.reservedBoxes;
      const isLowStock =
        availableBoxes <= s.variant.product.minStockAlert && availableBoxes >= 0;
      const isOutOfStock = availableBoxes <= 0;

      return {
        variantId: s.variantId,
        variant: s.variant,
        totalBoxes: s.totalBoxes,
        reservedBoxes: s.reservedBoxes,
        availableBoxes,
        totalPieces: availableBoxes * s.variant.product.piecesPerBox,
        isLowStock,
        isOutOfStock,
        updatedAt: s.updatedAt,
      };
    });

    if (query.lowStockOnly) {
      enriched = enriched.filter((s) => s.isLowStock && !s.isOutOfStock);
    }
    if (query.outOfStock) {
      enriched = enriched.filter((s) => s.isOutOfStock);
    }

    enriched.sort((a, b) => {
      const ra = urgencyRank(a);
      const rb = urgencyRank(b);
      if (ra !== rb) return ra - rb;

      if (query.sortBy === 'productName') {
        return query.sortDir === 'asc'
          ? a.variant.product.name.localeCompare(b.variant.product.name, undefined, {
              sensitivity: 'base',
            })
          : b.variant.product.name.localeCompare(a.variant.product.name, undefined, {
              sensitivity: 'base',
            });
      }
      if (query.sortBy === 'sku') {
        return query.sortDir === 'asc'
          ? a.variant.product.sku.localeCompare(b.variant.product.sku)
          : b.variant.product.sku.localeCompare(a.variant.product.sku);
      }
      const key = query.sortBy === 'availableBoxes' ? 'availableBoxes' : 'totalBoxes';
      return query.sortDir === 'asc' ? a[key] - b[key] : b[key] - a[key];
    });

    const total = enriched.length;
    const paged = enriched.slice(skip, skip + take);

    return { stocks: paged, meta: buildPaginationMeta(total, page, take) };
  }

  async getVariantStockDetail(variantId: string) {
    const stock = await this.app.prisma.inventoryStock.findUnique({
      where: { variantId },
      include: {
        variant: {
          include: { product: { include: { category: true } } },
        },
      },
    });
    if (!stock) throw new AppError('Variant stock record not found', 404);

    const availableBoxes = stock.totalBoxes - stock.reservedBoxes;
    return {
      ...stock,
      availableBoxes,
      totalPieces: availableBoxes * stock.variant.product.piecesPerBox,
      isLowStock: availableBoxes <= stock.variant.product.minStockAlert && availableBoxes >= 0,
      isOutOfStock: availableBoxes <= 0,
    };
  }

  async getVariantLedger(variantId: string, query: LedgerQuery) {
    const { skip, take, page } = parsePagination(query);

    const variant = await this.app.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (!variant) throw new AppError('Variant not found', 404);

    const where: Record<string, unknown> = { variantId };
    if (query.type) where.movementType = query.type;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [entries, total] = await Promise.all([
      this.app.prisma.inventoryLedger.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
        },
      }),
      this.app.prisma.inventoryLedger.count({ where }),
    ]);

    const currentStock = await this.app.prisma.inventoryStock.findUnique({
      where: { variantId },
    });
    let runningBalance = currentStock?.totalBoxes ?? 0;

    const entriesWithBalance = entries.map((entry) => {
      const isInward = [
        MovementType.INWARD,
        MovementType.ADJUSTMENT_ADD,
        MovementType.TRANSFER_IN,
        MovementType.RETURN_INWARD,
      ].includes(entry.movementType as MovementType);

      const balanceAfter = runningBalance;
      runningBalance = isInward
        ? runningBalance - entry.boxes
        : runningBalance + entry.boxes;

      return {
        ...entry,
        balanceAfter,
        isInward,
        signedBoxes: isInward ? `+${entry.boxes}` : `-${entry.boxes}`,
      };
    });

    return {
      variant,
      currentStock: {
        totalBoxes: currentStock?.totalBoxes ?? 0,
        reservedBoxes: currentStock?.reservedBoxes ?? 0,
        availableBoxes:
          (currentStock?.totalBoxes ?? 0) - (currentStock?.reservedBoxes ?? 0),
      },
      entries: entriesWithBalance,
      meta: buildPaginationMeta(total, page, take),
    };
  }

  async adjustStock(variantId: string, input: AdjustStockInput, userId: string) {
    const stock = await this.app.prisma.inventoryStock.findUnique({
      where: { variantId },
      include: { variant: { include: { product: true } } },
    });
    if (!stock) throw new AppError('Variant stock not found', 404);

    const newTotal = stock.totalBoxes + input.boxes;
    if (newTotal < 0) {
      throw new AppError(
        `Cannot remove ${Math.abs(input.boxes)} boxes — only ${stock.totalBoxes} in stock.`,
        400,
        'STOCK_INSUFFICIENT',
      );
    }
    if (newTotal < stock.reservedBoxes) {
      throw new AppError(
        `Cannot reduce total below reserved quantity (${stock.reservedBoxes} boxes reserved for confirmed orders).`,
        400,
        'STOCK_BELOW_RESERVED',
      );
    }

    const movementType =
      input.boxes > 0 ? PrismaMovementType.ADJUSTMENT_ADD : PrismaMovementType.ADJUSTMENT_SUB;

    await this.app.prisma.$transaction([
      this.app.prisma.inventoryStock.update({
        where: { variantId },
        data: { totalBoxes: { increment: input.boxes } },
      }),
      this.app.prisma.inventoryLedger.create({
        data: {
          variantId,
          movementType,
          boxes: Math.abs(input.boxes),
          pieces: Math.abs(input.boxes) * stock.variant.product.piecesPerBox,
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: userId,
          notes: `${input.reason}${input.notes ? ' — ' + input.notes : ''}`,
          createdById: userId,
        },
      }),
    ]);

    await this.app.redis.del(`stock:variant:${variantId}`);

    return this.getVariantStockDetail(variantId);
  }

  async transferStock(input: TransferStockInput, userId: string) {
    if (input.fromVariantId === input.toVariantId) {
      throw new AppError('Source and destination variants must be different', 400);
    }

    const [fromStock, toVariantData] = await Promise.all([
      this.app.prisma.inventoryStock.findUnique({
        where: { variantId: input.fromVariantId },
        include: { variant: { include: { product: true } } },
      }),
      this.app.prisma.productVariant.findUnique({
        where: { id: input.toVariantId },
        include: { product: true },
      }),
    ]);

    if (!fromStock) throw new AppError('Source variant stock not found', 404);
    if (!toVariantData) throw new AppError('Destination variant not found', 404);

    const toExisting = await this.app.prisma.inventoryStock.findUnique({
      where: { variantId: input.toVariantId },
    });

    const fromAvailable = fromStock.totalBoxes - fromStock.reservedBoxes;
    if (input.boxes > fromAvailable) {
      throw new AppError(
        `Only ${fromAvailable} available boxes in source (${fromStock.reservedBoxes} reserved).`,
        400,
        'STOCK_INSUFFICIENT',
      );
    }

    const transferRef = `TRANSFER-${Date.now()}`;

    await this.app.prisma.$transaction([
      this.app.prisma.inventoryStock.update({
        where: { variantId: input.fromVariantId },
        data: { totalBoxes: { decrement: input.boxes } },
      }),
      this.app.prisma.inventoryStock.upsert({
        where: { variantId: input.toVariantId },
        update: { totalBoxes: { increment: input.boxes } },
        create: {
          variantId: input.toVariantId,
          totalBoxes: input.boxes,
          reservedBoxes: 0,
        },
      }),
      this.app.prisma.inventoryLedger.create({
        data: {
          variantId: input.fromVariantId,
          movementType: PrismaMovementType.TRANSFER_OUT,
          boxes: input.boxes,
          pieces: input.boxes * fromStock.variant.product.piecesPerBox,
          referenceType: 'TRANSFER',
          referenceId: transferRef,
          notes: `Transfer to ${toVariantData.product.sku}-${toVariantData.colourCode}: ${input.reason}`,
          createdById: userId,
        },
      }),
      this.app.prisma.inventoryLedger.create({
        data: {
          variantId: input.toVariantId,
          movementType: PrismaMovementType.TRANSFER_IN,
          boxes: input.boxes,
          pieces: input.boxes * toVariantData.product.piecesPerBox,
          referenceType: 'TRANSFER',
          referenceId: transferRef,
          notes: `Transfer from ${fromStock.variant.product.sku}-${fromStock.variant.colourCode}: ${input.reason}`,
          createdById: userId,
        },
      }),
    ]);

    await this.app.redis.del(`stock:variant:${input.fromVariantId}`);
    await this.app.redis.del(`stock:variant:${input.toVariantId}`);

    return {
      message: `${input.boxes} boxes transferred successfully`,
      transferRef,
      from: { variantId: input.fromVariantId, newTotal: fromStock.totalBoxes - input.boxes },
      to: {
        variantId: input.toVariantId,
        newTotal: (toExisting?.totalBoxes ?? 0) + input.boxes,
      },
    };
  }

  async getInventoryValuation() {
    const stocks = await this.app.prisma.inventoryStock.findMany({
      include: {
        variant: {
          include: { product: { include: { category: true } } },
        },
      },
      where: { variant: { isActive: true } },
    });

    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        totalBoxes: number;
        valuePaise: number;
        variantCount: number;
      }
    >();

    let grandTotalPaise = 0;
    let grandTotalBoxes = 0;
    let grandTotalReservedBoxes = 0;
    let unvaluedVariants = 0;

    for (const s of stocks) {
      const available = s.totalBoxes - s.reservedBoxes;
      const catId = s.variant.product.categoryId;
      const catName = s.variant.product.category.name;
      const mrp = s.variant.mrpPaise;

      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          categoryId: catId,
          categoryName: catName,
          totalBoxes: 0,
          valuePaise: 0,
          variantCount: 0,
        });
      }

      const cat = categoryMap.get(catId)!;
      cat.totalBoxes += available;
      cat.variantCount += 1;
      grandTotalBoxes += available;
      grandTotalReservedBoxes += s.reservedBoxes;

      if (mrp && mrp > 0) {
        const lineValue = available * mrp;
        cat.valuePaise += lineValue;
        grandTotalPaise += lineValue;
      } else {
        unvaluedVariants++;
      }
    }

    return {
      categories: [...categoryMap.values()],
      grandTotalPaise,
      grandTotalBoxes,
      grandTotalReservedBoxes,
      totalVariants: stocks.length,
      unvaluedVariants,
      generatedAt: new Date().toISOString(),
    };
  }

  async getLowStockVariants() {
    const stocks = await this.app.prisma.inventoryStock.findMany({
      include: {
        variant: { include: { product: { include: { category: true } } } },
      },
      where: { variant: { isActive: true } },
    });

    return stocks
      .map((s) => ({
        variantId: s.variantId,
        variant: s.variant,
        totalBoxes: s.totalBoxes,
        reservedBoxes: s.reservedBoxes,
        availableBoxes: s.totalBoxes - s.reservedBoxes,
        minStockAlert: s.variant.product.minStockAlert,
        isOutOfStock: s.totalBoxes - s.reservedBoxes <= 0,
        urgencyLevel:
          s.totalBoxes - s.reservedBoxes <= 0
            ? ('CRITICAL' as const)
            : s.totalBoxes - s.reservedBoxes <=
                Math.floor(s.variant.product.minStockAlert * 0.5)
              ? ('HIGH' as const)
              : ('MEDIUM' as const),
      }))
      .filter((s) => s.availableBoxes <= s.minStockAlert)
      .sort((a, b) => a.availableBoxes - b.availableBoxes);
  }

  async exportToExcel(): Promise<Buffer> {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stock Report');

    workbook.creator = 'SmartLoad';
    workbook.created = new Date();

    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Colour Code', key: 'colourCode', width: 12 },
      { header: 'Colour Name', key: 'colourName', width: 15 },
      { header: 'Length (mm)', key: 'length', width: 12 },
      { header: 'Width (mm)', key: 'width', width: 12 },
      { header: 'Thickness (mm)', key: 'thickness', width: 14 },
      { header: 'Pieces/Box', key: 'piecesPerBox', width: 12 },
      { header: 'Total Boxes', key: 'totalBoxes', width: 12 },
      { header: 'Reserved Boxes', key: 'reservedBoxes', width: 14 },
      { header: 'Available Boxes', key: 'availableBoxes', width: 14 },
      { header: 'Available Pieces', key: 'totalPieces', width: 15 },
      { header: 'Min Stock Alert', key: 'minAlert', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'MRP/Box (₹)', key: 'mrp', width: 12 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F2044' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    const stocks = await this.fetchAllStockRowsForExport();

    stocks.forEach((s, idx) => {
      const row = sheet.addRow({
        sku: s.variant.product.sku,
        productName: s.variant.product.name,
        category: s.variant.product.category.name,
        colourCode: s.variant.colourCode,
        colourName: s.variant.colourName,
        length: s.variant.lengthMm ?? '',
        width: s.variant.widthMm ?? '',
        thickness: s.variant.thicknessMm ?? '',
        piecesPerBox: s.variant.product.piecesPerBox,
        totalBoxes: s.totalBoxes,
        reservedBoxes: s.reservedBoxes,
        availableBoxes: s.availableBoxes,
        totalPieces: s.totalPieces,
        minAlert: s.variant.product.minStockAlert,
        status: s.isOutOfStock ? 'OUT OF STOCK' : s.isLowStock ? 'LOW STOCK' : 'OK',
        mrp: s.variant.mrpPaise ? (s.variant.mrpPaise / 100).toFixed(2) : '',
      });

      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF3F4F6';
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.alignment = { vertical: 'middle' };
      });

      const statusCell = row.getCell('status');
      if (s.isOutOfStock) {
        statusCell.font = { bold: true, color: { argb: 'FFB91C1C' } };
      } else if (s.isLowStock) {
        statusCell.font = { bold: true, color: { argb: 'FFB45309' } };
      } else {
        statusCell.font = { color: { argb: 'FF15803D' } };
      }
    });

    const totalsRow = sheet.addRow({
      sku: 'TOTAL',
      totalBoxes: stocks.reduce((acc, r) => acc + r.totalBoxes, 0),
      reservedBoxes: stocks.reduce((acc, r) => acc + r.reservedBoxes, 0),
      availableBoxes: stocks.reduce((acc, r) => acc + r.availableBoxes, 0),
      totalPieces: stocks.reduce((acc, r) => acc + r.totalPieces, 0),
    });
    totalsRow.font = { bold: true };

    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importOpeningStock(buffer: Buffer, userId: string) {
    const { parse } = await import('csv-parse/sync');
    const { stockImportRowSchema } = await import('./inventory.schema.js');

    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const results = {
      processed: 0,
      updated: 0,
      errors: [] as { row: number; message: string }[],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      try {
        const row = stockImportRowSchema.parse(rows[i]);

        const variant = await this.app.prisma.productVariant.findFirst({
          where: {
            colourCode: row.colourCode,
            product: { sku: row.sku },
          },
          include: { product: true },
        });

        if (!variant) {
          results.errors.push({
            row: rowNum,
            message: `No variant found for SKU=${row.sku} Colour=${row.colourCode}`,
          });
          continue;
        }

        await this.app.prisma.inventoryStock.upsert({
          where: { variantId: variant.id },
          update: { totalBoxes: row.totalBoxes },
          create: {
            variantId: variant.id,
            totalBoxes: row.totalBoxes,
            reservedBoxes: 0,
          },
        });

        await this.app.prisma.inventoryLedger.create({
          data: {
            variantId: variant.id,
            movementType: PrismaMovementType.INWARD,
            boxes: row.totalBoxes,
            pieces: row.totalBoxes * variant.product.piecesPerBox,
            referenceType: 'OPENING_STOCK',
            referenceId: `IMPORT-${Date.now()}-${rowNum}`,
            notes: row.notes ?? 'Opening stock import',
            createdById: userId,
          },
        });

        results.updated++;
      } catch (err) {
        results.errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      results.processed++;
    }

    return results;
  }
}
