import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable @typescript-eslint/unbound-method -- Vitest expects mock function references */
import { SessionStatus, POStatus, ScanResult } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { BarcodeFormat, CODE_PREFIXES, generateDocCode } from '@smartload/shared';
import { SessionService } from '../session.service.js';
import { HIDKeyboardDriver } from '../../../hal/drivers/hid-keyboard.driver.js';
import { SerialDriver } from '../../../hal/drivers/serial.driver.js';
import { ZebraDataWedgeDriver } from '../../../hal/drivers/zebra-datawedge.driver.js';
import { CameraDriver } from '../../../hal/drivers/camera.driver.js';
import { HalService } from '../../../hal/hal.service.js';

function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function buildMockApp(overrides: Partial<Record<string, unknown>> = {}): FastifyInstance {
  const prisma = {
    purchaseOrder: { findUnique: vi.fn() },
    dispatchSession: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    vehicle: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    pOLineItem: { update: vi.fn() },
    scanEvent: {
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: 'evt-mock' })),
    },
    $transaction: vi.fn(),
  };

  const redis = {
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  };

  const hal = {
    processRawScan: vi.fn(),
  };

  const queues = {
    inventoryDeduction: { add: vi.fn() },
    tallySync: { add: vi.fn() },
    podCreation: { add: vi.fn() },
  };

  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    prisma,
    redis,
    hal,
    queues,
    log,
    ...overrides,
  } as unknown as FastifyInstance;
}

describe('SessionService.createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session with sessionCode DS-YYYYMMDD-XXXX', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);

    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'po1',
      status: POStatus.CONFIRMED,
      lineItems: [
        { orderedBoxes: 10, loadedBoxes: 3 },
        { orderedBoxes: 8, loadedBoxes: 0 },
      ],
    });
    (app.prisma.dispatchSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'veh1',
      isActive: true,
    });
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    const createdSession = {
      id: 'sess-new',
      sessionCode: generateDocCode(CODE_PREFIXES.DISPATCH_SESSION, 5),
      purchaseOrder: { client: { name: 'C' } },
      vehicle: { registrationNumber: 'MH12' },
      supervisor: { id: 'u1', name: 'S', email: 's@test', role: 'SUPERVISOR' },
      operator: null,
    };

    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        dispatchSession: {
          create: vi.fn().mockResolvedValue(createdSession),
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const ctxSession = {
      id: 'sess-new',
      poId: 'po1',
      status: SessionStatus.OPEN,
      supervisorId: 'sup1',
      operatorId: null,
      totalBoxesExpected: 15,
      totalBoxesScanned: 0,
      purchaseOrder: {
        lineItems: [
          {
            id: 'li1',
            variantId: 'v1',
            orderedBoxes: 10,
            loadedBoxes: 3,
            variant: { product: { name: 'P1', sku: 'S1', piecesPerBox: 4 }, colourName: 'Red' },
          },
          {
            id: 'li2',
            variantId: 'v2',
            orderedBoxes: 8,
            loadedBoxes: 0,
            variant: { product: { name: 'P2', sku: 'S2', piecesPerBox: 2 }, colourName: 'Blue' },
          },
        ],
      },
    };
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(ctxSession);

    const session = await svc.createSession(
      { poId: 'po1', vehicleId: 'veh1' },
      'sup1',
    );

    expect(session.sessionCode).toMatch(/^DS-\d{8}-\d{4}$/);
    expect(app.redis.setex).toHaveBeenCalled();
  });

  it('throws 400 when PO status is DRAFT', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'po1',
      status: POStatus.DRAFT,
      lineItems: [{ orderedBoxes: 1, loadedBoxes: 0 }],
    });

    await expect(svc.createSession({ poId: 'po1', vehicleId: 'v1' }, 'sup')).rejects.toMatchObject({
      statusCode: 400,
      code: 'PO_STATUS_INVALID',
    });
  });

  it('throws 409 when vehicle already has an open session', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'po1',
      status: POStatus.CONFIRMED,
      lineItems: [{ orderedBoxes: 5, loadedBoxes: 0 }],
    });
    (app.prisma.dispatchSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessionCode: 'DS-OPEN-0001',
    });

    await expect(svc.createSession({ poId: 'po1', vehicleId: 'veh1' }, 'sup')).rejects.toMatchObject({
      statusCode: 409,
      code: 'VEHICLE_BUSY',
    });
  });

  it('throws 404 when PO does not exist', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(svc.createSession({ poId: 'missing', vehicleId: 'v1' }, 'sup')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('calculates totalBoxesExpected from unloaded line items', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);

    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'po1',
      status: POStatus.CONFIRMED,
      lineItems: [
        { orderedBoxes: 10, loadedBoxes: 3 },
        { orderedBoxes: 8, loadedBoxes: 0 },
      ],
    });
    (app.prisma.dispatchSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'veh1',
      isActive: true,
    });
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    let capturedExpected: number | undefined;
    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        dispatchSession: {
          create: vi.fn().mockImplementation(({ data }: { data: { totalBoxesExpected: number } }) => {
            capturedExpected = data.totalBoxesExpected;
            return Promise.resolve({
              id: 's1',
              sessionCode: 'DS-X',
              purchaseOrder: { client: {} },
              vehicle: {},
              supervisor: { id: 'u', name: 'n', email: 'e', role: 'SUPERVISOR' },
              operator: null,
            });
          }),
        },
        purchaseOrder: { update: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's1',
      poId: 'po1',
      status: SessionStatus.OPEN,
      supervisorId: 'sup',
      operatorId: null,
      totalBoxesExpected: 15,
      totalBoxesScanned: 0,
      purchaseOrder: {
        lineItems: [
          {
            id: 'li1',
            variantId: 'v1',
            orderedBoxes: 10,
            loadedBoxes: 3,
            variant: { product: { name: 'P', sku: 'S', piecesPerBox: 1 }, colourName: 'R' },
          },
          {
            id: 'li2',
            variantId: 'v2',
            orderedBoxes: 8,
            loadedBoxes: 0,
            variant: { product: { name: 'P2', sku: 'S2', piecesPerBox: 1 }, colourName: 'B' },
          },
        ],
      },
    });

    await svc.createSession({ poId: 'po1', vehicleId: 'veh1' }, 'sup');
    expect(capturedExpected).toBe(15);
  });

  it('throws PO_COMPLETE when nothing left to load', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.purchaseOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'po1',
      status: POStatus.CONFIRMED,
      lineItems: [{ orderedBoxes: 5, loadedBoxes: 5 }],
    });
    (app.prisma.dispatchSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'v1',
      isActive: true,
    });

    await expect(svc.createSession({ poId: 'po1', vehicleId: 'v1' }, 'sup')).rejects.toMatchObject({
      code: 'PO_COMPLETE',
    });
  });
});

describe('SessionService.processScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function variantFixture(id: string, barcode: string, productId = 'p1') {
    return {
      id,
      productId,
      barcodeValue: barcode,
      colourName: 'Red',
      product: { name: 'Prod', sku: 'SKU', piecesPerBox: 2 },
    };
  }

  function contextFixture(overrides: Partial<{ status: SessionStatus; loadedBoxes: number; orderedBoxes: number }> = {}) {
    const orderedBoxes = overrides.orderedBoxes ?? 10;
    const loadedBoxes = overrides.loadedBoxes ?? 3;
    return {
      sessionId: 'sess1',
      poId: 'po1',
      status: overrides.status ?? SessionStatus.OPEN,
      supervisorId: 'sup',
      operatorId: 'op',
      totalBoxesExpected: orderedBoxes,
      totalBoxesScanned: loadedBoxes,
      lineItems: [
        {
          lineItemId: 'li1',
          variantId: 'v1',
          productId: 'p1',
          orderedBoxes,
          loadedBoxes,
          productName: 'Prod',
          colourName: 'Red',
          sku: 'SKU',
          piecesPerBox: 2,
        },
      ],
    };
  }

  it('returns SUCCESS and increments counts', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);

    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR\n',
      cleaned: 'BAR',
      format: BarcodeFormat.CODE128,
      scannedAt: new Date(),
    });

    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      return null;
    });

    (app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(variantFixture('v1', 'BAR'));
    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await svc.processScan(
      { sessionId: 'sess1', rawBarcode: 'BAR\n' },
      'op1',
    );

    expect(result.result).toBe(ScanResult.SUCCESS);
    expect(result.alertLevel).toBe('success');
    expect(result.sessionProgress.scanned).toBe(4);
    expect(app.prisma.pOLineItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'li1' },
        data: expect.objectContaining({
          loadedBoxes: { increment: 1 },
          loadedPieces: { increment: 2 },
        }),
      }),
    );
    expect(app.prisma.dispatchSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess1' },
        data: { totalBoxesScanned: { increment: 1 } },
      }),
    );
  });

  it('returns UNKNOWN_BARCODE when variant missing', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'X',
      cleaned: 'X',
      format: BarcodeFormat.UNKNOWN,
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      return null;
    });
    (app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await svc.processScan({ sessionId: 'sess1', rawBarcode: 'X' }, 'op');
    expect(result.result).toBe(ScanResult.UNKNOWN_BARCODE);
    expect(app.prisma.$transaction).not.toHaveBeenCalled();
    await flushImmediate();
    expect(app.prisma.scanEvent.create).toHaveBeenCalled();
  });

  it('returns WRONG_PRODUCT when variant not on PO', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      return null;
    });
    (app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      variantFixture('v999', 'BAR', 'p-other'),
    );

    const result = await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(result.result).toBe(ScanResult.WRONG_PRODUCT);
    expect(result.alertMessage).toContain('NOT in this order');
    expect(app.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns EXCESS_QUANTITY when line complete', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context'))
        return JSON.stringify(contextFixture({ orderedBoxes: 5, loadedBoxes: 5 }));
      return null;
    });
    (app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(variantFixture('v1', 'BAR'));

    const result = await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(result.result).toBe(ScanResult.EXCESS_QUANTITY);
    expect(result.alertLevel).toBe('warning');
    expect(app.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns SESSION_CLOSED when context not OPEN', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify(contextFixture({ status: SessionStatus.CLOSED })),
    );

    const result = await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(result.result).toBe(ScanResult.SESSION_CLOSED);
    expect(app.prisma.productVariant.findUnique).not.toHaveBeenCalled();
  });

  it('uses Redis variant cache without DB lookup', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    const v = variantFixture('v1', 'BAR');
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      if (String(key).startsWith('variant:barcode')) return JSON.stringify(v);
      return null;
    });
    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(app.prisma.productVariant.findUnique).not.toHaveBeenCalled();
  });

  it('writes Redis variant cache on DB hit', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    const v = variantFixture('v1', 'BAR');
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      return null;
    });
    (app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(v);
    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(app.redis.setex).toHaveBeenCalledWith(
      expect.stringContaining('variant:barcode'),
      expect.any(Number),
      JSON.stringify(v),
    );
  });

  it('completes processScan in under 200ms with mocks', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.hal.processRawScan as ReturnType<typeof vi.fn>).mockReturnValue({
      rawValue: 'BAR',
      cleaned: 'BAR',
      scannedAt: new Date(),
    });
    (app.redis.get as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (String(key).startsWith('session:context')) return JSON.stringify(contextFixture());
      return JSON.stringify(variantFixture('v1', 'BAR'));
    });
    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const start = Date.now();
    await svc.processScan({ sessionId: 'sess1', rawBarcode: 'BAR' }, 'op');
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe('SessionService.closeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSession = {
    id: 'sess1',
    supervisorId: 'sup1',
    status: SessionStatus.OPEN,
    poId: 'po1',
    purchaseOrder: {
      lineItems: [{ id: 'li1', loadedBoxes: 3, orderedBoxes: 10 }],
      client: {},
    },
  };

  it('throws INCOMPLETE_ITEMS without forcePartial', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseSession);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sup1',
      role: 'SUPERVISOR',
    });

    await expect(svc.closeSession('sess1', 'sup1', { forcePartial: false })).rejects.toMatchObject({
      code: 'INCOMPLETE_ITEMS',
    });
  });

  it('closes partial when forcePartial + reason', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseSession);
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sup1',
      role: 'SUPERVISOR',
    });

    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        dispatchSession: {
          update: vi.fn().mockResolvedValue({
            poId: 'po1',
            purchaseOrder: {
              lineItems: [{ loadedBoxes: 3, orderedBoxes: 10 }],
              client: {},
            },
          }),
        },
        purchaseOrder: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    await svc.closeSession('sess1', 'sup1', {
      forcePartial: true,
      partialReason: 'Item not available in stock — warehouse',
    });

    expect(app.redis.del).toHaveBeenCalledWith(expect.stringContaining('session:context:sess1'));
    expect(app.queues.inventoryDeduction.add).toHaveBeenCalledWith(
      'deduct-inventory',
      { sessionId: 'sess1' },
      expect.any(Object),
    );
    expect(app.queues.tallySync.add).toHaveBeenCalledWith(
      'push-dispatch',
      { sessionId: 'sess1', type: 'DISPATCH_OUTWARD' },
      expect.any(Object),
    );
    expect(app.queues.podCreation.add).toHaveBeenCalledWith(
      'create-pod',
      { sessionId: 'sess1' },
      expect.any(Object),
    );
  });

  it('sets PO FULLY_LOADED when all lines complete', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    const poUpdate = vi.fn().mockResolvedValue({});
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...baseSession,
      purchaseOrder: {
        lineItems: [{ id: 'li1', loadedBoxes: 10, orderedBoxes: 10 }],
        client: {},
      },
    });
    (app.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sup1',
      role: 'SUPERVISOR',
    });

    (app.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        dispatchSession: {
          update: vi.fn().mockResolvedValue({
            poId: 'po1',
            purchaseOrder: {
              lineItems: [{ loadedBoxes: 10, orderedBoxes: 10 }],
              client: {},
            },
          }),
        },
        purchaseOrder: { update: poUpdate },
      };
      return fn(tx);
    });

    await svc.closeSession('sess1', 'sup1', { forcePartial: false });
    expect(poUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: POStatus.FULLY_LOADED },
      }),
    );
  });
});

describe('SessionService.listSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters closedAt (local calendar day) when status is CLOSED and dateFrom/dateTo are YYYY-MM-DD', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    let captured: unknown;
    (app.prisma.dispatchSession.findMany as ReturnType<typeof vi.fn>).mockImplementation((args: { where: unknown }) => {
      captured = args.where;
      return Promise.resolve([]);
    });
    (app.prisma.dispatchSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await svc.listSessions({
      page: 1,
      limit: 10,
      status: 'CLOSED',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-01',
    });

    expect(captured).toMatchObject({
      status: 'CLOSED',
      closedAt: expect.objectContaining({
        not: null,
        gte: expect.any(Date),
        lte: expect.any(Date),
      }),
    });
    const w = captured as { closedAt: { gte: Date; lte: Date } };
    expect(w.closedAt.gte.getHours()).toBe(0);
    expect(w.closedAt.lte.getHours()).toBe(23);
  });

  it('filters openedAt when status is OPEN and dates are provided', async () => {
    const app = buildMockApp();
    const svc = new SessionService(app);
    let captured: unknown;
    (app.prisma.dispatchSession.findMany as ReturnType<typeof vi.fn>).mockImplementation((args: { where: unknown }) => {
      captured = args.where;
      return Promise.resolve([]);
    });
    (app.prisma.dispatchSession.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await svc.listSessions({
      page: 1,
      limit: 10,
      status: 'OPEN',
      dateFrom: '2026-05-01',
      dateTo: '2026-05-10',
    });

    expect(captured).toMatchObject({
      status: 'OPEN',
      openedAt: { gte: expect.any(Date), lte: expect.any(Date) },
    });
    expect(captured as Record<string, unknown>).not.toHaveProperty('closedAt');
  });
});

describe('HalService & drivers', () => {
  it('defaults to hid-keyboard driver', () => {
    const app = buildMockApp();
    const hal = new HalService(app);
    expect(hal.getActiveDriver().driverName).toBe('hid-keyboard');
  });

  it('HIDKeyboardDriver strips trailing newline', () => {
    const d = new HIDKeyboardDriver();
    expect(d.parseRawInput('TEST-BARCODE-123\n').cleaned).toBe('TEST-BARCODE-123');
  });

  it('HIDKeyboardDriver strips CRLF', () => {
    const d = new HIDKeyboardDriver();
    expect(d.parseRawInput('BARCODE\r\n').cleaned).toBe('BARCODE');
  });

  it('HIDKeyboardDriver detects QR for JSON payload string', () => {
    const d = new HIDKeyboardDriver();
    const out = d.parseRawInput('{"sku":"PVC","variantId":"abc","colourCode":"R"}\n');
    expect(out.format).toBe(BarcodeFormat.QR);
  });

  it('SerialDriver strips STX/ETX', () => {
    const d = new SerialDriver();
    expect(d.parseRawInput('\x02BARCODE-123\x03').cleaned).toBe('BARCODE-123');
  });

  it('ZebraDataWedgeDriver parses JSON payload', () => {
    const d = new ZebraDataWedgeDriver();
    const out = d.parseRawInput(
      '{"data":"QR-VALUE","labelType":"LABEL-TYPE-QRCODE","deviceId":"SN12345"}',
    );
    expect(out.cleaned).toBe('QR-VALUE');
    expect(out.format).toBe(BarcodeFormat.QR);
    expect(out.deviceId).toBe('SN12345');
  });

  it('CameraDriver maps dashed format labels to shared barcode enums', () => {
    const d = new CameraDriver();
    const out = d.parseRawInput(JSON.stringify({ value: 'ABC-123', format: 'CODE-128' }));
    expect(out.format).toBe(BarcodeFormat.CODE128);
    expect(out.cleaned).toBe('ABC-123');
  });

  it('HalService.setDriver throws for unknown driver', async () => {
    const app = buildMockApp();
    const hal = new HalService(app);
    await expect(hal.setDriver('rfid-unknown')).rejects.toThrow(/not found/);
  });
});
