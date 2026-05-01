import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { ScanResult, SessionStatus, POStatus, UserRole } from '@prisma/client';
import {
  AppError,
  generateDocCode,
  CODE_PREFIXES,
  parsePagination,
  buildPaginationMeta,
  REDIS_TTL,
  type ScanProcessResult,
  type LineItemProgress,
} from '@smartload/shared';
import type {
  CreateSessionInput,
  CloseSessionInput,
  ProcessScanInput,
  ListSessionsQuery,
} from './session.schema.js';
import type { ScannerInput } from '../../hal/hal.interface.js';
import { ZebraDataWedgeDriver } from '../../hal/drivers/zebra-datawedge.driver.js';
import { CameraDriver } from '../../hal/drivers/camera.driver.js';

const variantLookupInclude = {
  product: { include: { category: true } },
} as const;

type VariantLookupRow = Prisma.ProductVariantGetPayload<{ include: typeof variantLookupInclude }>;

interface CachedLineItem {
  lineItemId: string;
  variantId: string;
  orderedBoxes: number;
  loadedBoxes: number;
  productName: string;
  colourName: string;
  sku: string;
  piecesPerBox: number;
}

interface SessionContext {
  sessionId: string;
  poId: string;
  status: string;
  supervisorId: string;
  operatorId: string | null;
  lineItems: CachedLineItem[];
  totalBoxesExpected: number;
  totalBoxesScanned: number;
}

export class SessionService {
  constructor(private readonly app: FastifyInstance) {}

  private sessionContextKey = (id: string) => `session:context:${id}`;
  private variantCacheKey = (barcode: string) => `variant:barcode:${encodeURIComponent(barcode)}`;
  private dailySeqKey = () => `seq:session:${new Date().toISOString().slice(0, 10)}`;

  private async nextSessionCode(): Promise<string> {
    const seq = await this.app.redis.incr(this.dailySeqKey());
    if (seq === 1) await this.app.redis.expire(this.dailySeqKey(), 172800);
    return generateDocCode(CODE_PREFIXES.DISPATCH_SESSION, seq);
  }

  private async buildSessionContext(sessionId: string): Promise<SessionContext> {
    const session = await this.app.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: {
          include: {
            lineItems: {
              include: {
                variant: { include: { product: true } },
              },
            },
          },
        },
      },
    });
    if (!session) throw new AppError('Session not found', 404);

    const context: SessionContext = {
      sessionId: session.id,
      poId: session.poId,
      status: session.status,
      supervisorId: session.supervisorId,
      operatorId: session.operatorId,
      totalBoxesExpected: session.totalBoxesExpected,
      totalBoxesScanned: session.totalBoxesScanned,
      lineItems: session.purchaseOrder.lineItems.map((li) => ({
        lineItemId: li.id,
        variantId: li.variantId,
        orderedBoxes: li.orderedBoxes,
        loadedBoxes: li.loadedBoxes,
        productName: li.variant.product.name,
        colourName: li.variant.colourName,
        sku: li.variant.product.sku,
        piecesPerBox: li.variant.product.piecesPerBox,
      })),
    };

    await this.app.redis.setex(
      this.sessionContextKey(sessionId),
      REDIS_TTL.SESSION_CONTEXT,
      JSON.stringify(context),
    );
    return context;
  }

  private async getSessionContext(sessionId: string): Promise<SessionContext> {
    const cached = await this.app.redis.get(this.sessionContextKey(sessionId));
    if (cached) return JSON.parse(cached) as SessionContext;
    return this.buildSessionContext(sessionId);
  }

  private async invalidateSessionCache(sessionId: string): Promise<void> {
    await this.app.redis.del(this.sessionContextKey(sessionId));
  }

  async createSession(input: CreateSessionInput, supervisorId: string) {
    const po = await this.app.prisma.purchaseOrder.findUnique({
      where: { id: input.poId },
      include: { lineItems: true },
    });
    if (!po) throw new AppError('Purchase order not found', 404);
    if (po.status !== POStatus.CONFIRMED && po.status !== POStatus.PARTIALLY_LOADED) {
      throw new AppError(
        `Cannot start dispatch on a PO with status "${po.status}". PO must be CONFIRMED or PARTIALLY_LOADED.`,
        400,
        'PO_STATUS_INVALID',
      );
    }

    const existingSession = await this.app.prisma.dispatchSession.findFirst({
      where: { vehicleId: input.vehicleId, status: SessionStatus.OPEN },
    });
    if (existingSession) {
      throw new AppError(
        `Vehicle already has an open dispatch session: ${existingSession.sessionCode}. Close it before starting a new one.`,
        409,
        'VEHICLE_BUSY',
      );
    }

    const vehicle = await this.app.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
    });
    if (!vehicle || !vehicle.isActive) {
      throw new AppError('Vehicle not found or inactive', 404);
    }

    if (input.operatorId) {
      const operator = await this.app.prisma.user.findUnique({
        where: { id: input.operatorId },
      });
      if (!operator || !operator.isActive) {
        throw new AppError('Operator not found or inactive', 404);
      }
    }

    const totalBoxesExpected = po.lineItems.reduce(
      (sum, li) => sum + (li.orderedBoxes - li.loadedBoxes),
      0,
    );
    if (totalBoxesExpected === 0) {
      throw new AppError('All items on this PO are already fully loaded', 400, 'PO_COMPLETE');
    }

    const sessionCode = await this.nextSessionCode();

    const session = await this.app.prisma.$transaction(async (tx) => {
      const newSession = await tx.dispatchSession.create({
        data: {
          sessionCode,
          poId: input.poId,
          vehicleId: input.vehicleId,
          supervisorId,
          operatorId: input.operatorId ?? null,
          status: SessionStatus.OPEN,
          openedAt: new Date(),
          totalBoxesExpected,
          totalBoxesScanned: 0,
          notes: input.notes ?? null,
        },
        include: {
          purchaseOrder: { include: { client: true } },
          vehicle: true,
          supervisor: { select: { id: true, name: true, email: true, role: true } },
          operator: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      if (po.status === POStatus.CONFIRMED) {
        await tx.purchaseOrder.update({
          where: { id: input.poId },
          data: { status: POStatus.PARTIALLY_LOADED },
        });
      }

      return newSession;
    });

    await this.buildSessionContext(session.id);
    return session;
  }

  async processScan(input: ProcessScanInput, operatorId: string): Promise<ScanProcessResult> {
    const scannerInput = this.parseScannerInput(input.rawBarcode, input.deviceId);
    return this.processNormalizedScan(input.sessionId, scannerInput, operatorId, input.deviceId);
  }

  /** Camera scans use {@link CameraDriver}; keyboard wedge uses configured HAL driver. */
  private parseScannerInput(raw: string, deviceId?: string): ScannerInput {
    const trimmed = raw.trim();
    if (deviceId === 'camera') {
      return new CameraDriver().parseRawInput(raw, deviceId);
    }
    try {
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed) as { value?: unknown };
        if (typeof parsed?.value === 'string') {
          return new CameraDriver().parseRawInput(trimmed, deviceId);
        }
      }
    } catch {
      /* use HAL */
    }
    return this.app.hal.processRawScan(raw, deviceId);
  }

  async processDataWedgeScan(sessionId: string, body: unknown, operatorId: string): Promise<ScanProcessResult> {
    const raw = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    const scannerInput = new ZebraDataWedgeDriver().parseRawInput(raw);
    return this.processNormalizedScan(sessionId, scannerInput, operatorId, scannerInput.deviceId);
  }

  private async processNormalizedScan(
    sessionId: string,
    scannerInput: ScannerInput,
    operatorId: string,
    fallbackDeviceId?: string,
  ): Promise<ScanProcessResult> {
    const deviceId = scannerInput.deviceId ?? fallbackDeviceId;
    const startMs = Date.now();

    const context = await this.getSessionContext(sessionId);

    if (context.status !== SessionStatus.OPEN) {
      return this.buildResult(
        ScanResult.SESSION_CLOSED,
        null,
        null,
        context,
        startMs,
        'This dispatch session is already closed.',
      );
    }

    let variant: VariantLookupRow | null = null;

    const cachedVariant = await this.app.redis.get(this.variantCacheKey(scannerInput.cleaned));
    if (cachedVariant) {
      variant = JSON.parse(cachedVariant) as VariantLookupRow;
    } else {
      variant = await this.app.prisma.productVariant.findUnique({
        where: { barcodeValue: scannerInput.cleaned },
        include: variantLookupInclude,
      });
      if (variant) {
        await this.app.redis.setex(
          this.variantCacheKey(scannerInput.cleaned),
          REDIS_TTL.VARIANT_LOOKUP,
          JSON.stringify(variant),
        );
      }
    }

    if (!variant) {
      this.logScanEvent(
        sessionId,
        operatorId,
        scannerInput.cleaned,
        null,
        ScanResult.UNKNOWN_BARCODE,
        'Barcode not found in product master',
        deviceId,
      );
      return this.buildResult(
        ScanResult.UNKNOWN_BARCODE,
        null,
        null,
        context,
        startMs,
        `Barcode not recognised: ${scannerInput.cleaned.slice(0, 40)}`,
      );
    }

    const matchedLineItem = context.lineItems.find((li) => li.variantId === variant.id);

    if (!matchedLineItem) {
      this.logScanEvent(
        sessionId,
        operatorId,
        scannerInput.cleaned,
        variant.id,
        ScanResult.WRONG_PRODUCT,
        `Product "${variant.product.name} — ${variant.colourName}" is not in this order`,
        deviceId,
      );
      return this.buildResult(
        ScanResult.WRONG_PRODUCT,
        variant as unknown as Record<string, unknown>,
        null,
        context,
        startMs,
        `WRONG PRODUCT: "${variant.product.name} — ${variant.colourName}" (${variant.product.sku}) is NOT in this order. Return to shelf immediately.`,
      );
    }

    if (matchedLineItem.loadedBoxes >= matchedLineItem.orderedBoxes) {
      this.logScanEvent(
        sessionId,
        operatorId,
        scannerInput.cleaned,
        variant.id,
        ScanResult.EXCESS_QUANTITY,
        `Already loaded ${matchedLineItem.loadedBoxes}/${matchedLineItem.orderedBoxes} boxes`,
        deviceId,
      );
      return this.buildResult(
        ScanResult.EXCESS_QUANTITY,
        variant as unknown as Record<string, unknown>,
        matchedLineItem,
        context,
        startMs,
        `QUANTITY EXCEEDED: ${matchedLineItem.orderedBoxes} boxes of "${matchedLineItem.productName} — ${matchedLineItem.colourName}" already fully loaded. Supervisor approval required to add more.`,
      );
    }

    await this.app.prisma.$transaction([
      this.app.prisma.pOLineItem.update({
        where: { id: matchedLineItem.lineItemId },
        data: {
          loadedBoxes: { increment: 1 },
          loadedPieces: { increment: variant.product.piecesPerBox },
        },
      }),
      this.app.prisma.dispatchSession.update({
        where: { id: sessionId },
        data: { totalBoxesScanned: { increment: 1 } },
      }),
    ]);

    matchedLineItem.loadedBoxes += 1;
    context.totalBoxesScanned += 1;
    await this.app.redis.setex(
      this.sessionContextKey(sessionId),
      REDIS_TTL.SESSION_CONTEXT,
      JSON.stringify(context),
    );

    this.logScanEvent(sessionId, operatorId, scannerInput.cleaned, variant.id, ScanResult.SUCCESS, null, deviceId);

    const result = this.buildResult(
      ScanResult.SUCCESS,
      variant as unknown as Record<string, unknown>,
      matchedLineItem,
      context,
      startMs,
      `✓ ${variant.product.name} — ${variant.colourName} accepted. ${matchedLineItem.loadedBoxes}/${matchedLineItem.orderedBoxes} boxes loaded.`,
    );

    this.app.log.debug({ sessionId, barcode: scannerInput.cleaned, ms: Date.now() - startMs }, 'Scan processed');

    return result;
  }

  private logScanEvent(
    sessionId: string,
    operatorId: string,
    barcode: string,
    variantId: string | null,
    result: ScanResult,
    errorReason: string | null,
    deviceId?: string,
  ): void {
    setImmediate(() => {
      this.app.prisma.scanEvent
        .create({
          data: {
            sessionId,
            operatorId,
            scannedBarcode: barcode,
            resolvedVariantId: variantId,
            result,
            errorReason,
            deviceId: deviceId ?? null,
            scannedAt: new Date(),
          },
        })
        .catch((err) => this.app.log.error({ err }, 'Failed to write scan event'));
    });
  }

  private buildResult(
    result: ScanResult,
    variant: Record<string, unknown> | null,
    lineItem: CachedLineItem | null,
    context: SessionContext,
    startMs: number,
    alertMessage: string,
  ): ScanProcessResult {
    const alertLevel =
      result === ScanResult.SUCCESS ? 'success' : result === ScanResult.EXCESS_QUANTITY ? 'warning' : 'error';

    const lineItemProgress: LineItemProgress[] = context.lineItems.map((li) => ({
      lineItemId: li.lineItemId,
      variantId: li.variantId,
      productName: li.productName,
      colourName: li.colourName,
      orderedBoxes: li.orderedBoxes,
      loadedBoxes: li.loadedBoxes,
      isComplete: li.loadedBoxes >= li.orderedBoxes,
    }));

    const percentComplete =
      context.totalBoxesExpected === 0
        ? 100
        : Math.round((context.totalBoxesScanned / context.totalBoxesExpected) * 100);

    this.app.log.info({ result, ms: Date.now() - startMs, sessionId: context.sessionId }, `Scan result: ${result}`);

    return {
      result: result as ScanProcessResult['result'],
      alertLevel,
      alertMessage,
      variant: variant as ScanProcessResult['variant'],
      lineItem: lineItem
        ? ({
            id: lineItem.lineItemId,
            variantId: lineItem.variantId,
            orderedBoxes: lineItem.orderedBoxes,
            loadedBoxes: lineItem.loadedBoxes,
          } as unknown as ScanProcessResult['lineItem'])
        : null,
      sessionProgress: {
        scanned: context.totalBoxesScanned,
        expected: context.totalBoxesExpected,
        percentComplete,
        lineItems: lineItemProgress,
      },
      scanEvent: { id: 'pending', scannedAt: new Date().toISOString() },
    };
  }

  async closeSession(sessionId: string, supervisorId: string, input: CloseSessionInput) {
    const session = await this.app.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: { purchaseOrder: { include: { lineItems: true } } },
    });
    if (!session) throw new AppError('Session not found', 404);
    if (session.status !== SessionStatus.OPEN) {
      throw new AppError(`Session is already ${session.status}`, 400);
    }

    const closer = await this.app.prisma.user.findUnique({ where: { id: supervisorId } });
    if (!closer) throw new AppError('User not found', 404);

    if (session.supervisorId !== supervisorId && closer.role !== UserRole.ADMIN) {
      throw new AppError('Only the session supervisor or an admin can close a session', 403);
    }

    const incompleteItems = session.purchaseOrder.lineItems.filter((li) => li.loadedBoxes < li.orderedBoxes);
    const hasIncomplete = incompleteItems.length > 0;

    if (hasIncomplete && !input.forcePartial) {
      throw new AppError(
        `${incompleteItems.length} line item(s) are not fully loaded. Set forcePartial=true with a partialReason to close anyway.`,
        400,
        'INCOMPLETE_ITEMS',
      );
    }

    if (hasIncomplete && input.forcePartial && (!input.partialReason || input.partialReason.trim().length < 10)) {
      throw new AppError(
        'A reason of at least 10 characters is required for partial dispatch',
        400,
        'PARTIAL_REASON_REQUIRED',
      );
    }

    const updated = await this.app.prisma.$transaction(async (tx) => {
      const closed = await tx.dispatchSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: new Date(),
          notes: input.notes ?? null,
          isPartialDispatch: hasIncomplete && !!input.forcePartial,
          partialReason: input.partialReason ?? null,
        },
        include: {
          purchaseOrder: { include: { lineItems: true, client: true } },
          vehicle: true,
          supervisor: { select: { id: true, name: true } },
        },
      });

      const allLineItems = closed.purchaseOrder.lineItems;
      const allComplete = allLineItems.every((li) => li.loadedBoxes >= li.orderedBoxes);

      await tx.purchaseOrder.update({
        where: { id: closed.poId },
        data: { status: allComplete ? POStatus.FULLY_LOADED : POStatus.PARTIALLY_LOADED },
      });

      return closed;
    });

    await this.invalidateSessionCache(sessionId);

    void this.app.queues.inventoryDeduction.add(
      'deduct-inventory',
      { sessionId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    void this.app.queues.tallySync.add(
      'push-dispatch',
      { sessionId, type: 'DISPATCH_OUTWARD' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    void this.app.queues.podCreation.add(
      'create-pod',
      { sessionId },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
    );

    return updated;
  }

  async getSessionById(sessionId: string) {
    const session = await this.app.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: {
          include: {
            client: true,
            lineItems: {
              include: {
                variant: { include: { product: { include: { category: true } } } },
              },
            },
          },
        },
        vehicle: true,
        supervisor: { select: { id: true, name: true, email: true, role: true } },
        operator: { select: { id: true, name: true, email: true, role: true } },
        pod: { select: { id: true, status: true, linkToken: true, linkExpiresAt: true, createdAt: true } },
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
    if (!session) throw new AppError('Session not found', 404);

    const enrichedLineItems = session.purchaseOrder.lineItems.map((li) => ({
      ...li,
      lineItemId: li.id,
      productName: li.variant.product.name,
      colourName: li.variant.colourName,
      isComplete: li.loadedBoxes >= li.orderedBoxes,
      remainingBoxes: li.orderedBoxes - li.loadedBoxes,
      progressPercent:
        li.orderedBoxes === 0 ? 100 : Math.round((li.loadedBoxes / li.orderedBoxes) * 100),
    }));

    const errorCount = session.scanEvents.filter((e) => e.result !== ScanResult.SUCCESS).length;

    return {
      ...session,
      purchaseOrder: {
        ...session.purchaseOrder,
        lineItems: enrichedLineItems,
      },
      errorCount,
      progressPercent:
        session.totalBoxesExpected === 0
          ? 100
          : Math.round((session.totalBoxesScanned / session.totalBoxesExpected) * 100),
    };
  }

  async listSessions(query: ListSessionsQuery) {
    const { skip, take, page } = parsePagination(query);
    const where: Prisma.DispatchSessionWhereInput = {};
    if (query.status) where.status = query.status as SessionStatus;
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.poId) where.poId = query.poId;
    if (query.dateFrom || query.dateTo) {
      where.openedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [sessions, total] = await Promise.all([
      this.app.prisma.dispatchSession.findMany({
        where,
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: {
          purchaseOrder: { include: { client: true } },
          vehicle: true,
          supervisor: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          _count: { select: { scanEvents: true } },
        },
      }),
      this.app.prisma.dispatchSession.count({ where }),
    ]);

    return { sessions, meta: buildPaginationMeta(total, page, take) };
  }

  async listActiveSessions() {
    return this.app.prisma.dispatchSession.findMany({
      where: { status: SessionStatus.OPEN },
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
      orderBy: { openedAt: 'asc' },
    });
  }

  async listRecentScanErrors(limit: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.app.prisma.scanEvent.findMany({
      where: {
        scannedAt: { gte: start },
        result: { not: ScanResult.SUCCESS },
      },
      orderBy: { scannedAt: 'desc' },
      take: limit,
      include: {
        operator: { select: { id: true, name: true } },
        session: { select: { id: true, sessionCode: true } },
      },
    });
  }

  async getSupervisorDashboardSummary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [sessionsOpenedToday, activeSessions, boxesScannedToday, errorScansToday, podsPending] =
      await Promise.all([
        this.app.prisma.dispatchSession.count({ where: { openedAt: { gte: start } } }),
        this.app.prisma.dispatchSession.count({ where: { status: SessionStatus.OPEN } }),
        this.app.prisma.scanEvent.count({
          where: { scannedAt: { gte: start }, result: ScanResult.SUCCESS },
        }),
        this.app.prisma.scanEvent.count({
          where: { scannedAt: { gte: start }, result: { not: ScanResult.SUCCESS } },
        }),
        this.app.prisma.proofOfDelivery.count({
          where: { status: { in: ['PENDING', 'LINK_SENT'] } },
        }),
      ]);

    return {
      sessionsOpenedToday,
      activeSessions,
      boxesScannedToday,
      errorScansToday,
      podsPending,
    };
  }
}
