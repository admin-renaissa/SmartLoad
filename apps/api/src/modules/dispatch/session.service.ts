import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ScanResult, SessionStatus, POStatus } from '@prisma/client';
import type { ScanProcessResult } from '@smartload/shared';
import { Queue } from 'bullmq';
import { QUEUES } from '@smartload/shared';

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

const inventoryQueue = new Queue(QUEUES.INVENTORY_DEDUCTION, { connection });
const tallyQueue = new Queue(QUEUES.TALLY_SYNC, { connection });
const podQueue = new Queue(QUEUES.POD_CREATION, { connection });

export class SessionService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
  ) {}

  async createSession(dto: {
    poId: string;
    vehicleId: string;
    supervisorId: string;
    operatorId?: string;
  }) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.poId },
      include: { lineItems: true },
    });

    if (!po) throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 });
    if (!([POStatus.CONFIRMED, POStatus.PARTIALLY_LOADED] as POStatus[]).includes(po.status)) {
      throw Object.assign(new Error('PO must be CONFIRMED or PARTIALLY_LOADED to start a dispatch session'), { statusCode: 400 });
    }

    // Check vehicle not already in an open session
    const existingSession = await this.prisma.dispatchSession.findFirst({
      where: { vehicleId: dto.vehicleId, status: SessionStatus.OPEN },
    });
    if (existingSession) {
      throw Object.assign(new Error(`Vehicle already has an open session: ${existingSession.sessionCode}`), { statusCode: 409 });
    }

    // Generate session code
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.dispatchSession.count({
      where: { sessionCode: { startsWith: `DS-${today}` } },
    });
    const sessionCode = `DS-${today}-${String(count + 1).padStart(4, '0')}`;

    const totalBoxesExpected = po.lineItems.reduce((sum, li) => sum + (li.orderedBoxes - li.loadedBoxes), 0);

    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.dispatchSession.create({
        data: {
          sessionCode,
          poId: dto.poId,
          vehicleId: dto.vehicleId,
          supervisorId: dto.supervisorId,
          operatorId: dto.operatorId,
          totalBoxesExpected,
          status: SessionStatus.OPEN,
        },
        include: {
          purchaseOrder: {
            include: {
              client: true,
              lineItems: { include: { variant: { include: { product: true } } } },
            },
          },
          vehicle: true,
          supervisor: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
      });

      await tx.purchaseOrder.update({
        where: { id: dto.poId },
        data: { status: POStatus.PARTIALLY_LOADED },
      });

      return s;
    });

    // Cache session context in Redis
    await this.cacheSessionContext(session.id);

    return session;
  }

  // *** MOST CRITICAL FUNCTION — must complete in < 200ms ***
  async processScan(
    sessionId: string,
    rawBarcode: string,
    operatorId: string,
    deviceId?: string,
  ): Promise<ScanProcessResult> {
    const cleanBarcode = rawBarcode.trim().replace(/[\r\n]/g, '');

    // Step 1: Get session from cache or DB
    const sessionContextKey = `session:${sessionId}:context`;
    let sessionContext = await this.getSessionContext(sessionId);

    if (!sessionContext) {
      throw Object.assign(new Error('Session not found or expired'), { statusCode: 404 });
    }

    if (sessionContext.status !== 'OPEN') {
      throw Object.assign(new Error('Session is not open'), { statusCode: 400 });
    }

    // Step 2: Lookup variant (Redis cache first)
    const variantCacheKey = `variant:barcode:${cleanBarcode}`;
    let variant: Record<string, unknown> | null = null;
    const cachedVariant = await this.redis.get(variantCacheKey);

    if (cachedVariant) {
      variant = JSON.parse(cachedVariant);
    } else {
      const dbVariant = await this.prisma.productVariant.findUnique({
        where: { barcodeValue: cleanBarcode },
        include: { product: true },
      });
      if (dbVariant) {
        variant = dbVariant as unknown as Record<string, unknown>;
        await this.redis.setex(variantCacheKey, 3600, JSON.stringify(dbVariant));
      }
    }

    // Step 3: Match logic
    let result: ScanResult;
    let errorReason: string | undefined;
    let resolvedVariantId: string | undefined;
    let matchedLineItem: { id: string; variantId: string; orderedBoxes: number; loadedBoxes: number } | undefined;

    if (!variant) {
      result = ScanResult.UNKNOWN_BARCODE;
      errorReason = `Barcode '${cleanBarcode}' not found in product master`;
    } else {
      resolvedVariantId = (variant as { id: string }).id;
      const variantId = resolvedVariantId;

      // Find matching line item in PO
      matchedLineItem = sessionContext.lineItems.find(
        (li: { variantId: string }) => li.variantId === variantId,
      );

      if (!matchedLineItem) {
        result = ScanResult.WRONG_PRODUCT;
        errorReason = `Product variant ${variantId} is not in this purchase order`;
      } else if (matchedLineItem.loadedBoxes >= matchedLineItem.orderedBoxes) {
        result = ScanResult.EXCESS_QUANTITY;
        errorReason = `Already loaded ${matchedLineItem.loadedBoxes}/${matchedLineItem.orderedBoxes} boxes for this item`;
      } else {
        result = ScanResult.SUCCESS;
      }
    }

    // Step 4: On SUCCESS, update counts atomically
    if (result === ScanResult.SUCCESS && matchedLineItem) {
      await this.prisma.$transaction([
        this.prisma.pOLineItem.update({
          where: { id: matchedLineItem.id },
          data: {
            loadedBoxes: { increment: 1 },
            loadedPieces: {
              increment: (variant as { product: { piecesPerBox: number } })?.product?.piecesPerBox || 1,
            },
          },
        }),
        this.prisma.dispatchSession.update({
          where: { id: sessionId },
          data: { totalBoxesScanned: { increment: 1 } },
        }),
      ]);

      // Update Redis cache
      const updatedContext = await this.getSessionContextFromDB(sessionId);
      await this.redis.setex(sessionContextKey, 3600, JSON.stringify(updatedContext));
      sessionContext = updatedContext;
    }

    // Step 5: Log scan event asynchronously
    setImmediate(async () => {
      try {
        await this.prisma.scanEvent.create({
          data: {
            sessionId,
            operatorId,
            scannedBarcode: cleanBarcode,
            resolvedVariantId,
            result,
            errorReason,
            deviceId,
          },
        });
      } catch (err) {
        console.error('Failed to log scan event:', err);
      }
    });

    // Step 6: Build result
    const scanned = sessionContext.totalBoxesScanned + (result === ScanResult.SUCCESS ? 1 : 0);
    const expected = sessionContext.totalBoxesExpected;
    const lineItems: import('@smartload/shared').LineItemProgress[] = sessionContext.lineItems.map(
      (li: { id: string; variantId: string; orderedBoxes: number; loadedBoxes: number }) => ({
        lineItemId: li.id,
        variantId: li.variantId,
        productName: '',
        colourName: '',
        orderedBoxes: li.orderedBoxes,
        loadedBoxes: li.loadedBoxes + (result === ScanResult.SUCCESS && matchedLineItem?.id === li.id ? 1 : 0),
        isComplete: li.loadedBoxes + (result === ScanResult.SUCCESS && matchedLineItem?.id === li.id ? 1 : 0) >= li.orderedBoxes,
      })
    );

    return {
      result: result as unknown as import('@smartload/shared').ScanResult,
      variant: variant as unknown as import('@smartload/shared').ScanProcessResult['variant'],
      lineItem: matchedLineItem as unknown as import('@smartload/shared').ScanProcessResult['lineItem'],
      sessionProgress: {
        scanned,
        expected,
        percentComplete: expected > 0 ? Math.round((scanned / expected) * 100) : 0,
        lineItems,
      },
      scanEvent: { id: 'pending', scannedAt: new Date().toISOString() },
      alertLevel:
        result === ScanResult.SUCCESS
          ? 'success'
          : result === ScanResult.EXCESS_QUANTITY
            ? 'warning'
            : 'error',
      alertMessage: this.getAlertMessage(result, variant, matchedLineItem),
    };
  }

  private getAlertMessage(
    result: ScanResult,
    variant: Record<string, unknown> | null,
    lineItem?: { orderedBoxes: number; loadedBoxes: number },
  ): string {
    switch (result) {
      case ScanResult.SUCCESS: {
        const product = (variant as { product?: { name: string } })?.product;
        const v = variant as { colourName?: string } | null;
        return `✓ ACCEPTED — ${product?.name || 'Product'} ${v?.colourName || ''}`;
      }
      case ScanResult.WRONG_PRODUCT:
        return '✗ WRONG PRODUCT — Do not load. Return to shelf.';
      case ScanResult.WRONG_COLOUR:
        return '✗ WRONG COLOUR — Colour mismatch. Do not load.';
      case ScanResult.EXCESS_QUANTITY:
        return `⚠ QUANTITY EXCEEDED — Already loaded ${lineItem?.loadedBoxes}/${lineItem?.orderedBoxes} boxes. Supervisor required.`;
      case ScanResult.UNKNOWN_BARCODE:
        return '⚠ UNRECOGNISED BARCODE — Not in product master. Supervisor notified.';
      default:
        return 'Scan processed';
    }
  }

  async closeSession(sessionId: string, supervisorId: string, notes?: string, forcePartial?: boolean) {
    const session = await this.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: { include: { lineItems: true } },
      },
    });

    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    if (session.status !== SessionStatus.OPEN) {
      throw Object.assign(new Error('Session is already closed'), { statusCode: 400 });
    }

    const underLoadedItems = session.purchaseOrder.lineItems.filter(
      (li) => li.loadedBoxes < li.orderedBoxes,
    );

    if (underLoadedItems.length > 0 && !forcePartial) {
      throw Object.assign(new Error(`Cannot close: ${underLoadedItems.length} line items not fully loaded. Use forcePartial=true to override.`), {
        statusCode: 400,
        underLoadedItems: underLoadedItems.map((li) => ({
          id: li.id,
          variantId: li.variantId,
          orderedBoxes: li.orderedBoxes,
          loadedBoxes: li.loadedBoxes,
          remaining: li.orderedBoxes - li.loadedBoxes,
        })),
      });
    }

    const isPartial = underLoadedItems.length > 0;

    const closed = await this.prisma.$transaction(async (tx) => {
      const s = await tx.dispatchSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: new Date(),
          notes,
          isPartialDispatch: isPartial,
        },
        include: { purchaseOrder: { include: { lineItems: true } }, vehicle: true },
      });

      // Update PO status
      const allSessionsClosed = await tx.dispatchSession.count({
        where: { poId: session.poId, status: SessionStatus.OPEN },
      });

      if (allSessionsClosed === 0 || !isPartial) {
        await tx.purchaseOrder.update({
          where: { id: session.poId },
          data: { status: POStatus.DISPATCHED },
        });
      }

      return s;
    });

    // Async: deduct inventory, sync Tally, create POD
    await inventoryQueue.add('deduct', { sessionId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    await tallyQueue.add('push', { sessionId, type: 'DISPATCH_OUTWARD' }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    await podQueue.add('create', { sessionId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });

    // Clear session cache
    await this.redis.del(`session:${sessionId}:context`);

    return closed;
  }

  async getSessionDetails(sessionId: string) {
    return this.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: {
          include: {
            client: true,
            lineItems: { include: { variant: { include: { product: true } } } },
          },
        },
        vehicle: true,
        supervisor: { select: { id: true, name: true, email: true } },
        operator: { select: { id: true, name: true } },
        scanEvents: {
          orderBy: { scannedAt: 'desc' },
          take: 50,
          include: {
            operator: { select: { id: true, name: true } },
            resolvedVariant: { include: { product: true } },
          },
        },
      },
    });
  }

  async listActiveSessions() {
    return this.prisma.dispatchSession.findMany({
      where: { status: SessionStatus.OPEN },
      include: {
        purchaseOrder: { include: { client: { select: { id: true, name: true } } } },
        vehicle: true,
        supervisor: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  private async getSessionContext(sessionId: string) {
    const cacheKey = `session:${sessionId}:context`;
    const cached = await this.redis.get(cacheKey);

    if (cached) return JSON.parse(cached);
    return this.getSessionContextFromDB(sessionId);
  }

  private async getSessionContextFromDB(sessionId: string) {
    const session = await this.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: {
          include: {
            lineItems: true,
          },
        },
      },
    });

    if (!session) return null;

    const context = {
      id: session.id,
      sessionCode: session.sessionCode,
      status: session.status,
      totalBoxesExpected: session.totalBoxesExpected,
      totalBoxesScanned: session.totalBoxesScanned,
      lineItems: session.purchaseOrder.lineItems.map((li) => ({
        id: li.id,
        variantId: li.variantId,
        orderedBoxes: li.orderedBoxes,
        loadedBoxes: li.loadedBoxes,
      })),
    };

    const cacheKey = `session:${sessionId}:context`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(context));
    return context;
  }

  private async cacheSessionContext(sessionId: string) {
    return this.getSessionContextFromDB(sessionId);
  }
}
