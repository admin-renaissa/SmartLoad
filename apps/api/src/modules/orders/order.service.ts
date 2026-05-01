import type { PrismaClient } from '@prisma/client';
import { POStatus } from '@prisma/client';

export interface CreatePODto {
  clientId: string;
  orderDate: string;
  expectedDispatchDate?: string;
  notes?: string;
  lineItems: Array<{
    variantId: string;
    orderedBoxes: number;
    /** Unit price in paise */
    ratePerBoxPaise: number;
    gstPercent?: number;
  }>;
}

export class OrderService {
  constructor(private prisma: PrismaClient) {}

  async createPO(dto: CreatePODto, createdById: string) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

    // Validate all variants exist
    const variantIds = dto.lineItems.map((li) => li.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true, inventoryStock: true },
    });

    if (variants.length !== variantIds.length) {
      throw Object.assign(new Error('One or more product variants not found'), { statusCode: 400 });
    }

    // Generate PO number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.purchaseOrder.count({
      where: { poNumber: { startsWith: `PO-${today}` } },
    });
    const poNumber = `PO-${today}-${String(count + 1).padStart(4, '0')}`;

    // Calculate line items
    const lineItemsData = dto.lineItems.map((li) => {
      const variant = variants.find((v) => v.id === li.variantId)!;
      const gstPercent = li.gstPercent ?? 18;
      const orderedPieces = li.orderedBoxes * variant.product.piecesPerBox;
      const totalAmountPaise = Math.round(
        li.ratePerBoxPaise * li.orderedBoxes * (1 + gstPercent / 100)
      );
      return { ...li, orderedPieces, gstPercent, totalAmountPaise };
    });

    const totalAmountPaise = lineItemsData.reduce((sum, li) => sum + li.totalAmountPaise, 0);

    const po = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          poNumber,
          clientId: dto.clientId,
          orderDate: new Date(dto.orderDate),
          expectedDispatchDate: dto.expectedDispatchDate ? new Date(dto.expectedDispatchDate) : null,
          notes: dto.notes,
          totalAmountPaise,
          status: POStatus.CONFIRMED,
          createdById,
          lineItems: {
            create: lineItemsData.map((li) => ({
              variantId: li.variantId,
              orderedBoxes: li.orderedBoxes,
              orderedPieces: li.orderedPieces,
              ratePerBoxPaise: li.ratePerBoxPaise,
              gstPercent: li.gstPercent,
              totalAmountPaise: li.totalAmountPaise,
            })),
          },
        },
        include: {
          client: true,
          lineItems: { include: { variant: { include: { product: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Reserve stock for each line item
      for (const li of lineItemsData) {
        await tx.inventoryStock.upsert({
          where: { variantId: li.variantId },
          update: { reservedBoxes: { increment: li.orderedBoxes } },
          create: { variantId: li.variantId, totalBoxes: 0, reservedBoxes: li.orderedBoxes },
        });
      }

      return order;
    });

    // Stock warnings (non-blocking)
    const warnings: string[] = [];
    for (const li of lineItemsData) {
      const stock = variants.find((v) => v.id === li.variantId)?.inventoryStock;
      const available = (stock?.totalBoxes || 0) - (stock?.reservedBoxes || 0);
      if (available < li.orderedBoxes) {
        warnings.push(`Variant ${li.variantId}: ordered ${li.orderedBoxes} boxes, only ${available} available`);
      }
    }

    return { po, warnings };
  }

  async getPOWithDetails(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        client: true,
        lineItems: {
          include: {
            variant: {
              include: {
                product: { include: { category: true } },
                inventoryStock: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        sessions: {
          orderBy: { openedAt: 'desc' },
          include: {
            vehicle: true,
            supervisor: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    });

    if (!po) throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 });
    return po;
  }

  async listPOs(filters: {
    status?: POStatus;
    clientId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 25, ...rest } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (rest.status) where.status = rest.status;
    if (rest.clientId) where.clientId = rest.clientId;
    if (rest.dateFrom || rest.dateTo) {
      where.orderDate = {
        ...(rest.dateFrom ? { gte: new Date(rest.dateFrom) } : {}),
        ...(rest.dateTo ? { lte: new Date(rest.dateTo) } : {}),
      };
    }
    if (rest.search) {
      where.OR = [
        { poNumber: { contains: rest.search, mode: 'insensitive' } },
        { client: { name: { contains: rest.search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          client: { select: { id: true, name: true, clientCode: true } },
          _count: { select: { lineItems: true } },
          lineItems: { select: { orderedBoxes: true, loadedBoxes: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { orders, total };
  }

  async cancelPO(id: string, reason: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!po) throw Object.assign(new Error('PO not found'), { statusCode: 404 });
    if (po.status === POStatus.DISPATCHED || po.status === POStatus.DELIVERED) {
      throw Object.assign(new Error('Cannot cancel a dispatched or delivered order'), { statusCode: 400 });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: POStatus.CANCELLED, notes: reason, updatedById: userId },
      });

      // Release reserved stock
      for (const li of po.lineItems) {
        await tx.inventoryStock.updateMany({
          where: { variantId: li.variantId },
          data: { reservedBoxes: { decrement: li.orderedBoxes } },
        });
      }
    });
  }
}
