import { type Prisma, type PrismaClient, MovementType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { parsePagination } from '@smartload/shared';

const stockInclude = {
  variant: {
    include: {
      product: { include: { category: true } },
    },
  },
} as const;

export type StockSummaryFilters = {
  variantId?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  search?: string;
};

export type StockSummaryRow = {
  variant: Prisma.ProductVariantGetPayload<{
    include: { product: { include: { category: true } } };
  }>;
  product: Prisma.ProductGetPayload<{
    include: { category: true };
  }>;
  totalBoxes: number;
  reservedBoxes: number;
  availableBoxes: number;
  totalPieces: number;
  isLowStock: boolean;
};

function netBoxDelta(type: MovementType, boxes: number): number {
  switch (type) {
    case MovementType.INWARD:
    case MovementType.TRANSFER_IN:
      return Math.abs(boxes);
    case MovementType.OUTWARD:
    case MovementType.TRANSFER_OUT:
      return -Math.abs(boxes);
    case MovementType.ADJUSTMENT_ADD:
      return Math.abs(boxes);
    case MovementType.ADJUSTMENT_SUB:
      return -Math.abs(boxes);
    default:
      return 0;
  }
}

export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  private mapStockToSummaryRow(
    stock: Prisma.InventoryStockGetPayload<{
      include: typeof stockInclude;
    }>,
  ): StockSummaryRow {
    const { variant, totalBoxes, reservedBoxes } = stock;
    const { product } = variant;
    const availableBoxes = totalBoxes - reservedBoxes;
    const totalPieces = availableBoxes * product.piecesPerBox;
    const isLowStock = totalBoxes <= product.minStockAlert;
    return {
      variant,
      product,
      totalBoxes,
      reservedBoxes,
      availableBoxes,
      totalPieces,
      isLowStock,
    };
  }

  /**
   * Stock summary: joined InventoryStock → ProductVariant → Product → ProductCategory.
   * Sort: low stock first, then product name. Pagination applied after sort/filter.
   */
  async getStockSummary(options: { filters?: StockSummaryFilters; page: number; limit: number }) {
    const { filters = {} } = options;
    const { page, limit, skip } = parsePagination({ page: options.page, limit: options.limit });
    const search = filters.search?.trim();

    const where: Prisma.InventoryStockWhereInput = {
      variant: {
        isActive: true,
        ...(filters.variantId ? { id: filters.variantId } : {}),
        ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
        ...(search
          ? {
              OR: [
                { product: { name: { contains: search, mode: 'insensitive' } } },
                { product: { sku: { contains: search, mode: 'insensitive' } } },
                { colourName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const stocks = await this.prisma.inventoryStock.findMany({ where, include: stockInclude });

    let rows = stocks.map((s) => this.mapStockToSummaryRow(s));
    if (filters.lowStockOnly) {
      rows = rows.filter((r) => r.isLowStock);
    }

    rows.sort((a, b) => {
      if (a.isLowStock !== b.isLowStock) {
        return a.isLowStock ? -1 : 1;
      }
      return a.product.name.localeCompare(b.product.name, undefined, { sensitivity: 'base' });
    });

    const total = rows.length;
    const paged = rows.slice(skip, skip + limit);
    return { items: paged, total, page, limit };
  }

  /**
   * Ledger entries, newest first. Each entry includes running balance in boxes after the movement
   * (as if entries were applied oldest → newest).
   */
  async getVariantLedger(
    variantId: string,
    options: { page: number; limit: number; dateFrom?: string; dateTo?: string },
  ) {
    const { page, limit, skip } = parsePagination({ page: options.page, limit: options.limit });
    const from = options.dateFrom ? new Date(options.dateFrom) : undefined;
    const to = options.dateTo ? new Date(options.dateTo) : undefined;

    const all = await this.prisma.inventoryLedger.findMany({
      where: { variantId },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { name: true } } },
    });

    const beforeCount = (() => {
      if (from == null) return 0;
      return all
        .filter((e) => e.createdAt < from)
        .reduce((s, e) => s + netBoxDelta(e.movementType, e.boxes), 0);
    })();

    const inRange = all.filter((e) => {
      if (from && e.createdAt < from) return false;
      if (to && e.createdAt > to) return false;
      return true;
    });

    let run = beforeCount;
    const ascWithBalance: Array<
      (typeof inRange)[number] & { runningBalance: number; createdBy: { name: string } }
    > = [];

    for (const e of inRange) {
      run += netBoxDelta(e.movementType, e.boxes);
      ascWithBalance.push({
        ...e,
        runningBalance: run,
        createdBy: e.createdBy,
      });
    }

    const display = [...ascWithBalance].reverse();
    const total = display.length;
    const items = display.slice(skip, skip + limit);

    return { items, total, page, limit };
  }

  /**
   * Manual stock adjustment. ADMIN only (enforced on route). Resulting total boxes must be ≥ 0.
   */
  async adjustStock(args: { variantId: string; boxes: number; reason: string; userId: string }) {
    const { variantId, boxes, reason, userId } = args;
    if (!reason?.trim()) {
      throw Object.assign(new Error('Reason is required'), { statusCode: 400 });
    }
    if (boxes === 0) {
      throw Object.assign(new Error('boxes cannot be zero'), { statusCode: 400 });
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, inventoryStock: true },
    });
    if (!variant) {
      throw Object.assign(new Error('Variant not found'), { statusCode: 404 });
    }

    const currentBoxes = variant.inventoryStock?.totalBoxes ?? 0;
    const newTotal = currentBoxes + boxes;
    if (newTotal < 0) {
      throw Object.assign(new Error('Insufficient stock for this adjustment'), { statusCode: 400 });
    }

    const pieces = boxes * variant.product.piecesPerBox;
    const ref = `ADJ-${Date.now()}-${randomBytes(4).toString('hex')}`;

    return this.prisma.$transaction(async (tx) => {
      const isAdd = boxes > 0;
      const ledger = await tx.inventoryLedger.create({
        data: {
          variantId,
          movementType: isAdd ? MovementType.ADJUSTMENT_ADD : MovementType.ADJUSTMENT_SUB,
          boxes: Math.abs(boxes),
          pieces: Math.abs(pieces),
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: ref,
          notes: reason.trim(),
          createdById: userId,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });

      await tx.inventoryStock.upsert({
        where: { variantId },
        update: { totalBoxes: { increment: boxes } },
        create: { variantId, totalBoxes: Math.max(0, boxes), reservedBoxes: 0 },
      });

      return ledger;
    });
  }

  /**
   * Sum(available boxes × MRP) per variant, grouped by product category, plus grand total.
   */
  async getInventoryValuation() {
    const stocks = await this.prisma.inventoryStock.findMany({
      include: { variant: { include: { product: { include: { category: true } } } } },
    });

    const byCategoryMap = new Map<
      string,
      { categoryId: string; categoryName: string; totalValue: number; availableBoxes: number }
    >();
    let grandTotal = 0;

    for (const s of stocks) {
      const available = s.totalBoxes - s.reservedBoxes;
      const mrp = s.variant.mrpPaise ?? 0;
      const value = available * mrp;
      grandTotal += value;
      const cat = s.variant.product.category;
      if (!byCategoryMap.has(cat.id)) {
        byCategoryMap.set(cat.id, {
          categoryId: cat.id,
          categoryName: cat.name,
          totalValue: 0,
          availableBoxes: 0,
        });
      }
      const row = byCategoryMap.get(cat.id)!;
      row.totalValue += value;
      row.availableBoxes += available;
    }

    const byCategory = Array.from(byCategoryMap.values()).map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      totalValue: c.totalValue,
      totalBoxes: c.availableBoxes,
    }));

    return { grandTotal, byCategory };
  }

  /**
   * Repack / transfer: OUTWARD on source, INWARD on target in one transaction, shared reference.
   */
  async stockTransfer(args: {
    fromVariantId: string;
    toVariantId: string;
    boxes: number;
    reason: string;
    userId: string;
  }) {
    const { fromVariantId, toVariantId, boxes, reason, userId } = args;
    if (!reason?.trim()) {
      throw Object.assign(new Error('Reason is required'), { statusCode: 400 });
    }
    if (fromVariantId === toVariantId) {
      throw Object.assign(new Error('fromVariantId and toVariantId must differ'), { statusCode: 400 });
    }
    if (boxes <= 0) {
      throw Object.assign(new Error('boxes must be positive'), { statusCode: 400 });
    }

    const [fromV, toV] = await Promise.all([
      this.prisma.productVariant.findUnique({
        where: { id: fromVariantId },
        include: { product: true, inventoryStock: true },
      }),
      this.prisma.productVariant.findUnique({
        where: { id: toVariantId },
        include: { product: true, inventoryStock: true },
      }),
    ]);

    if (!fromV || !toV) {
      throw Object.assign(new Error('One or both variants not found'), { statusCode: 404 });
    }

    const fromTotal = fromV.inventoryStock?.totalBoxes ?? 0;
    const fromReserved = fromV.inventoryStock?.reservedBoxes ?? 0;
    const fromAvailable = fromTotal - fromReserved;
    if (fromAvailable < boxes) {
      throw Object.assign(
        new Error('Insufficient available stock in source variant'),
        { statusCode: 400 },
      );
    }

    if (!fromV.inventoryStock) {
      throw Object.assign(new Error('Source variant has no stock record'), { statusCode: 400 });
    }

    const ref = `TRF-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const piecesOut = boxes * fromV.product.piecesPerBox;
    const piecesIn = boxes * toV.product.piecesPerBox;
    const reasonNote = reason.trim();

    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryStock.update({
        where: { variantId: fromVariantId },
        data: { totalBoxes: { decrement: boxes } },
      });

      await tx.inventoryStock.upsert({
        where: { variantId: toVariantId },
        update: { totalBoxes: { increment: boxes } },
        create: { variantId: toVariantId, totalBoxes: boxes, reservedBoxes: 0 },
      });

      await tx.inventoryLedger.create({
        data: {
          variantId: fromVariantId,
          movementType: MovementType.OUTWARD,
          boxes,
          pieces: piecesOut,
          referenceType: 'STOCK_TRANSFER',
          referenceId: ref,
          notes: `Transfer out → ${toVariantId}. ${reasonNote}`,
          createdById: userId,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          variantId: toVariantId,
          movementType: MovementType.INWARD,
          boxes,
          pieces: piecesIn,
          referenceType: 'STOCK_TRANSFER',
          referenceId: ref,
          notes: `Transfer in ← ${fromVariantId}. ${reasonNote}`,
          createdById: userId,
        },
      });

      return { referenceId: ref, fromVariantId, toVariantId, boxes };
    });
  }
}
