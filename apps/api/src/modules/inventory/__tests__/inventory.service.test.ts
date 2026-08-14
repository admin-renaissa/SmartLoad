import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
/* eslint-disable @typescript-eslint/unbound-method */
import type { FastifyInstance } from 'fastify';
import {
  MovementType as PrismaMovementType,
  SessionStatus,
  VehicleType as PrismaVehicleType,
} from '@prisma/client';
import { AppError, VehicleType } from '@smartload/shared';
import { InventoryService } from '../inventory.service.js';
import { GRNService } from '../grn.service.js';
import { VehicleService } from '../../vehicles/vehicles.service.js';
import { ManifestService } from '../../dispatch/manifest.service.js';
import { adjustStockSchema } from '../inventory.schema.js';
import { createGRNSchema } from '../grn.schema.js';
import { createVehicleSchema } from '../../vehicles/vehicles.schema.js';

vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

function buildApp(): FastifyInstance {
  return {
    prisma: {
      inventoryStock: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      inventoryLedger: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      productVariant: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
      goodsReceiptNote: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      gRNLineItem: { create: vi.fn() },
      vehicle: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      dispatchSession: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
        update: vi.fn(),
      },
      systemConfig: { findUnique: vi.fn().mockResolvedValue({ value: '' }) },
      $transaction: vi.fn(),
    },
    redis: { del: vi.fn(), incr: vi.fn(), expire: vi.fn() },
    queues: { tallySync: { add: vi.fn() } },
  } as unknown as FastifyInstance;
}

function productBase() {
  return {
    piecesPerBox: 10,
    sku: 'SKU1',
    name: 'Product',
    minStockAlert: 5,
    category: { id: 'cat', name: 'Cat' },
  };
}

function stockDoc(variantId: string, totalBoxes: number, reservedBoxes: number) {
  return {
    variantId,
    totalBoxes,
    reservedBoxes,
    variant: {
      id: variantId,
      colourCode: 'CC',
      colourName: 'Colour',
      lengthMm: 1,
      widthMm: 2,
      thicknessMm: 3,
      mrpPaise: 500,
      product: productBase(),
    },
    updatedAt: new Date(),
  };
}

describe('InventoryService.adjustStock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments totalBoxes when boxes is positive', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    const vId = 'variant-1';

    (
      app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(stockDoc(vId, 10, 2)).mockResolvedValueOnce(stockDoc(vId, 15, 2));
    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });

    const out = await svc.adjustStock(vId, { boxes: 5, reason: 'Received extra stock qty' }, 'user-1');

    expect(app.prisma.inventoryStock.update).toHaveBeenCalledWith({
      where: { variantId: vId },
      data: { totalBoxes: { increment: 5 } },
    });
    expect(app.prisma.inventoryLedger.create.mock.calls[0][0].data).toMatchObject({
      variantId: vId,
      movementType: PrismaMovementType.ADJUSTMENT_ADD,
      boxes: 5,
      pieces: 50,
      referenceType: 'MANUAL_ADJUSTMENT',
      createdById: 'user-1',
    });
    expect(out.totalBoxes).toBe(15);
    expect(out.availableBoxes).toBe(13);
  });

  it('decrements totalBoxes when boxes is negative', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    const vId = 'variant-2';
    (
      app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(stockDoc(vId, 10, 0)).mockResolvedValueOnce(stockDoc(vId, 6, 0));
    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });

    await svc.adjustStock(vId, { boxes: -4, reason: 'Damaged goods written off qty' }, 'u1');

    expect(app.prisma.inventoryStock.update).toHaveBeenCalledWith({
      where: { variantId: vId },
      data: { totalBoxes: { increment: -4 } },
    });
    expect(app.prisma.inventoryLedger.create.mock.calls[0][0].data).toMatchObject({
      movementType: PrismaMovementType.ADJUSTMENT_SUB,
      boxes: 4,
    });
  });

  it('throws 400 STOCK_INSUFFICIENT when removal exceeds total', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    (app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(stockDoc('v', 5, 0));

    await expect(svc.adjustStock('v', { boxes: -6, reason: 'Physical stock correction qty' }, 'u1')).rejects.toMatchObject(
      { constructor: AppError, statusCode: 400, code: 'STOCK_INSUFFICIENT' },
    );
    expect(app.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 400 STOCK_BELOW_RESERVED when new total would be below reserved', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    (app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(stockDoc('v', 10, 8));
    await expect(
      svc.adjustStock('v', { boxes: -5, reason: 'Damaged stock removal qty' }, 'u1'),
    ).rejects.toMatchObject({ code: 'STOCK_BELOW_RESERVED' });
  });

  it('combines reason and notes in ledger notes', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    const doc = stockDoc('v', 10, 0);
    (
      app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(doc).mockResolvedValueOnce(doc);
    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });
    await svc.adjustStock(
      'v',
      { boxes: 1, reason: 'Damaged', notes: 'Water damage from roof leak' },
      'u1',
    );
    expect(app.prisma.inventoryLedger.create.mock.calls[0][0].data.notes).toBe(
      'Damaged — Water damage from roof leak',
    );
  });
});

describe('adjustStockSchema', () => {
  it('throws when boxes is zero', () => {
    expect(() => adjustStockSchema.parse({ boxes: 0, reason: 'xxxxxxxxxx min ten' })).toThrow();
  });
});

describe('InventoryService.transferStock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates stock and shares transfer ref across ledgers', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const fromStock = stockDoc('from', 20, 5);
    (
      app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(fromStock).mockResolvedValueOnce({
      variantId: 'to',
      totalBoxes: 10,
      reservedBoxes: 0,
    });
    (
      app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: 'to', colourCode: 'Z', product: productBase() });
    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (ops: Promise<unknown>[]) => {
      await Promise.all(ops);
    });

    const out = await svc.transferStock(
      {
        fromVariantId: 'from',
        toVariantId: 'to',
        boxes: 8,
        reason: 'Repack consolidate batch qty',
      },
      'admin',
    );

    expect(app.prisma.inventoryStock.update).toHaveBeenCalledWith({
      where: { variantId: 'from' },
      data: { totalBoxes: { decrement: 8 } },
    });
    expect(app.prisma.inventoryStock.upsert).toHaveBeenCalledWith({
      where: { variantId: 'to' },
      update: { totalBoxes: { increment: 8 } },
      create: { variantId: 'to', totalBoxes: 8, reservedBoxes: 0 },
    });
    expect(app.prisma.inventoryLedger.create).toHaveBeenCalledTimes(2);
    expect(app.prisma.inventoryLedger.create.mock.calls[0][0].data.referenceId).toBe(
      app.prisma.inventoryLedger.create.mock.calls[1][0].data.referenceId,
    );
    expect(out.transferRef).toBe('TRANSFER-1700000000000');
    expect(app.prisma.inventoryLedger.create.mock.calls[0][0].data.movementType).toBe(
      PrismaMovementType.TRANSFER_OUT,
    );
    expect(app.prisma.inventoryLedger.create.mock.calls[1][0].data.movementType).toBe(
      PrismaMovementType.TRANSFER_IN,
    );
    vi.restoreAllMocks();
  });

  it('throws STOCK_INSUFFICIENT against available', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    (
      app.prisma.inventoryStock.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(stockDoc('from', 20, 15));
    (
      app.prisma.productVariant.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: 'to',
      colourCode: 'X',
      product: productBase(),
    });
    await expect(
      svc.transferStock({ fromVariantId: 'from', toVariantId: 'to', boxes: 10, reason: 'Test transfer qty' }, 'u'),
    ).rejects.toThrow(/Only 5 available/);
  });

  it('throws when from === to variant', async () => {
    const app = buildApp();
    const svc = new InventoryService(app);
    await expect(
      svc.transferStock(
        {
          fromVariantId: 'x',
          toVariantId: 'x',
          boxes: 1,
          reason: 'Invalid same variant id',
        },
        'u',
      ),
    ).rejects.toMatchObject({ constructor: AppError });
  });
});

describe('GRNService.createGRN', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubGrnVariants(app: FastifyInstance) {
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (app.redis.expire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (app.prisma.productVariant.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'v1', isActive: true, product: { piecesPerBox: 2 } },
      { id: 'v2', isActive: true, product: { piecesPerBox: 4 } },
    ]);
  }

  function stubGetGrnById(app: FastifyInstance) {
    (
      app.prisma.goodsReceiptNote.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: 'g1',
      grnNumber: 'GRN-TEST',
      receivedDate: new Date(),
      notes: null,
      lineItems: [
        {
          receivedBoxes: 1,
          receivedPieces: 2,
          variant: {
            colourName: 'x',
            colourCode: 'x',
            lengthMm: null,
            widthMm: null,
            thicknessMm: null,
            product: productBase(),
            inventoryStock: { totalBoxes: 0 },
          },
        },
      ],
      createdBy: { id: 'u', name: 'User', role: 'ADMIN' },
    });
  }

  it('grn header number matches /^GRN-\\d{8}-\\d{4}$/', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 3, 15, 12, 0, 0));
    const app = buildApp();
    const svc = new GRNService(app);
    stubGrnVariants(app);
    stubGetGrnById(app);

    let capturedNumber = '';

    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (fn: (tx: Record<string, unknown>) => unknown) => {
      const tx = {
        goodsReceiptNote: {
          create: vi.fn(async (opts: { data: { grnNumber: string } }) => {
            capturedNumber = opts.data.grnNumber;
            return { id: 'g1', ...opts.data, notes: null, createdById: 'u' };
          }),
        },
        gRNLineItem: { create: vi.fn().mockResolvedValue({}) },
        inventoryStock: { upsert: vi.fn().mockResolvedValue({}) },
        inventoryLedger: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await svc.createGRN(
      {
        receivedDate: '2026-04-02',
        lineItems: [{ variantId: 'v1', receivedBoxes: 1 }],
      },
      'u',
    );

    vi.useRealTimers();
    expect(capturedNumber).toMatch(/^GRN-\d{8}-\d{4}$/);

    expect(app.queues.tallySync.add).toHaveBeenCalledWith(
      'grn-inward',
      { grnId: 'g1', type: 'GRN_INWARD' },
      expect.any(Object),
    );
  });

  it('increments stock and creates inward ledgers inside transaction', async () => {
    const app = buildApp();
    const svc = new GRNService(app);
    stubGrnVariants(app);
    stubGetGrnById(app);

    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (fn: (tx: Record<string, unknown>) => unknown) => {
      const stockUpserts: Record<string, unknown>[] = [];
      const ledgerCalls: Record<string, unknown>[] = [];
      const tx = {
        goodsReceiptNote: {
          create: vi.fn().mockResolvedValue({ id: 'g1', grnNumber: 'N', notes: null, createdById: 'u' }),
        },
        gRNLineItem: { create: vi.fn().mockResolvedValue({}) },
        inventoryStock: {
          upsert: vi.fn().mockImplementation((arg: Record<string, unknown>) => {
            stockUpserts.push(arg);
            return Promise.resolve({});
          }),
        },
        inventoryLedger: {
          create: vi.fn().mockImplementation((arg: Record<string, unknown>) => {
            ledgerCalls.push(arg);
            return Promise.resolve({});
          }),
        },
      };
      const r = await fn(tx);
      expect(stockUpserts).toHaveLength(2);
      expect(stockUpserts[0]).toMatchObject({
        where: { variantId: 'v1' },
        update: { totalBoxes: { increment: 10 } },
      });
      expect(stockUpserts[1]).toMatchObject({
        where: { variantId: 'v2' },
        update: { totalBoxes: { increment: 5 } },
      });
      expect(ledgerCalls).toHaveLength(2);
      expect((ledgerCalls[0] as { data: { movementType: unknown } }).data.movementType).toBe(
        PrismaMovementType.INWARD,
      );
      expect((ledgerCalls[1] as { data: { movementType: unknown } }).data.movementType).toBe(
        PrismaMovementType.INWARD,
      );
      return r;
    });

    await svc.createGRN(
      {
        receivedDate: '2026-02-02',
        lineItems: [
          { variantId: 'v1', receivedBoxes: 10 },
          { variantId: 'v2', receivedBoxes: 5 },
        ],
      },
      'u',
    );

    expect(app.queues.tallySync.add).toHaveBeenCalled();
  });

  it('throws VARIANTS_NOT_FOUND when variant missing', async () => {
    const app = buildApp();
    const svc = new GRNService(app);
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (
      app.prisma.productVariant.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { id: 'v1', isActive: true, product: { piecesPerBox: 1 } },
    ]);

    await expect(
      svc.createGRN(
        {
          receivedDate: '2026-01-01',
          lineItems: [
            { variantId: 'v1', receivedBoxes: 1 },
            { variantId: 'missing', receivedBoxes: 1 },
          ],
        },
        'u',
      ),
    ).rejects.toMatchObject({ code: 'VARIANTS_NOT_FOUND' });
    expect(app.queues.tallySync.add).not.toHaveBeenCalled();
  });

  it('Zod rejects duplicate variantIds', () => {
    expect(() =>
      createGRNSchema.parse({
        receivedDate: '2026-01-01',
        lineItems: [
          { variantId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx1', receivedBoxes: 1 },
          { variantId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx1', receivedBoxes: 2 },
        ],
      }),
    ).toThrow(/Duplicate/);
  });

  it('does not enqueue tally when transaction fails mid-way', async () => {
    const app = buildApp();
    const svc = new GRNService(app);
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (
      app.prisma.productVariant.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { id: 'a', isActive: true, product: { piecesPerBox: 1 } },
      { id: 'b', isActive: true, product: { piecesPerBox: 1 } },
    ]);

    let n = 0;
    (
      app.prisma.$transaction as ReturnType<typeof vi.fn>
    ).mockImplementation(async (fn: (tx: Record<string, unknown>) => unknown) => {
      const tx = {
        goodsReceiptNote: {
          create: vi.fn().mockResolvedValue({ id: 'gfail', grnNumber: 'G', notes: null, createdById: 'u' }),
        },
        gRNLineItem: { create: vi.fn().mockResolvedValue({}) },
        inventoryStock: { upsert: vi.fn().mockResolvedValue({}) },
        inventoryLedger: {
          create: vi.fn().mockImplementation(async () => {
            n += 1;
            if (n === 2) throw new Error('ledger boom');
            return {};
          }),
        },
      };
      return fn(tx);
    });

    await expect(
      svc.createGRN(
        {
          receivedDate: '2026-01-01',
          lineItems: [
            { variantId: 'a', receivedBoxes: 2 },
            { variantId: 'b', receivedBoxes: 3 },
          ],
        },
        'u',
      ),
    ).rejects.toThrow();

    expect(app.queues.tallySync.add).not.toHaveBeenCalled();
  });
});

describe('VehicleService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createVehicle uppercases registration', async () => {
    const app = buildApp();
    const svc = new VehicleService(app);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (app.prisma.vehicle.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await svc.createVehicle({
      registrationNumber: 'mh12ab1234',
      type: VehicleType.TRUCK,
      driverName: 'Ram',
      driverPhone: '+919876543210',
    });
    expect(app.prisma.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ registrationNumber: 'MH12AB1234' }),
      }),
    );
  });

  it('throws VEHICLE_EXISTS', async () => {
    const app = buildApp();
    const svc = new VehicleService(app);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'v' });
    await expect(
      svc.createVehicle({
        registrationNumber: 'MH12AB1234',
        type: VehicleType.TRUCK,
        driverName: 'A',
        driverPhone: '+910000000001',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'VEHICLE_EXISTS' });
  });

  it('deactivateVehicle rejects open session', async () => {
    const app = buildApp();
    const svc = new VehicleService(app);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      dispatchSessions: [{ sessionCode: 'DS-open' }],
    });
    await expect(svc.deactivateVehicle('vid')).rejects.toThrow(/DS-open/);
  });

  it('deactivates when idle', async () => {
    const app = buildApp();
    const svc = new VehicleService(app);
    (app.prisma.vehicle.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ dispatchSessions: [] });
    (app.prisma.vehicle.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await svc.deactivateVehicle('vid');
    expect(app.prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'vid' },
      data: { isActive: false },
    });
  });
});

describe('createVehicleSchema plates', () => {
  const base = {
    registrationNumber: 'MH12AB1234',
    type: VehicleType.TRUCK,
    driverName: 'Driver',
    driverPhone: '+919876543210',
  };
  it.each(['MH12AB1234', 'DL1CAF1234', 'KA05ME0001'])('accepts %s', (reg) => {
    expect(() => createVehicleSchema.parse({ ...base, registrationNumber: reg })).not.toThrow();
  });
  it.each(['1234ABCD', 'ABCDEFGH', 'MH1234'])('rejects %s', (reg) => {
    expect(() => createVehicleSchema.parse({ ...base, registrationNumber: reg })).toThrow();
  });
});

function baseSessionEntity() {
  const lineItems = [
    {
      orderedBoxes: 5,
      loadedBoxes: 5,
      orderedPieces: 50,
      loadedPieces: 50,
      variant: {
        colourName: 'Red',
        colourCode: 'R',
        lengthMm: 1,
        widthMm: 2,
        thicknessMm: 3,
        product: { sku: 'SKU-A', name: 'Alpha', piecesPerBox: 10 },
      },
    },
    {
      orderedBoxes: 3,
      loadedBoxes: 1,
      orderedPieces: 30,
      loadedPieces: 10,
      variant: {
        colourName: 'Blue',
        colourCode: 'B',
        lengthMm: null,
        widthMm: null,
        thicknessMm: null,
        product: { sku: 'SKU-B', name: 'Beta', piecesPerBox: 10 },
      },
    },
    {
      orderedBoxes: 2,
      loadedBoxes: 0,
      orderedPieces: 20,
      loadedPieces: 0,
      variant: {
        colourName: 'Green',
        colourCode: 'G',
        lengthMm: null,
        widthMm: null,
        thicknessMm: null,
        product: { sku: 'SKU-C', name: 'Gamma', piecesPerBox: 10 },
      },
    },
  ];
  return {
    id: 'sid',
    sessionCode: 'DS-T',
    status: SessionStatus.OPEN,
    totalBoxesScanned: 6,
    totalBoxesExpected: 10,
    openedAt: new Date('2026-01-01'),
    closedAt: null as Date | null,
    isPartialDispatch: false,
    partialReason: null as string | null,
    purchaseOrder: {
      poNumber: 'PO-1',
      orderDate: new Date('2026-01-01'),
      notes: null as string | null,
      lineItems,
      client: {
        name: 'Client',
        clientCode: 'C1',
        gstin: 'GST',
        phone: '+910000000000',
        shippingAddress: {
          line1: 'Line 1',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411045',
        },
      },
    },
    vehicle: {
      registrationNumber: 'MH99XX9999',
      type: PrismaVehicleType.TRUCK,
      driverName: 'D',
      driverPhone: '+910000000000',
    },
    supervisor: { id: 's', name: 'Sup' },
    operator: null as { id: string; name: string } | null,
    manifestPdfUrl: null as string | null,
  };
}

describe('ManifestService', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => vi.useRealTimers());

  async function lastSetContentHtml(run: () => Promise<Buffer>): Promise<string> {
    await run();
    const puppeteer = await import('puppeteer');
    const launch = puppeteer.default.launch as ReturnType<typeof vi.fn>;
    const last = launch.mock.results.at(-1)?.value as Promise<unknown> | undefined;
    expect(last).toBeDefined();
    const browser = (await last!) as {
      newPage: ReturnType<typeof vi.fn>;
    };
    const page = await browser.newPage();
    const setContent = page.setContent as ReturnType<typeof vi.fn>;
    const call = setContent.mock.calls.at(-1);
    expect(call).toBeDefined();
    return call![0] as string;
  }

  it('manifest HTML includes all SKUs', async () => {
    const app = buildApp();
    const svc = new ManifestService(app);
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseSessionEntity());
    const html = await lastSetContentHtml(() => svc.generateManifestPDF('sid'));
    expect(html).toContain('SKU-A');
    expect(html).toContain('SKU-B');
    expect(html).toContain('SKU-C');
  });

  it('partial dispatch shows reason block', async () => {
    const app = buildApp();
    const svc = new ManifestService(app);
    const s = baseSessionEntity();
    s.isPartialDispatch = true;
    s.partialReason = 'Truck overloaded';
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    const html = await lastSetContentHtml(() => svc.generateManifestPDF('sid'));
    expect(html).toContain('Partial Dispatch Reason');
    expect(html).toContain('Truck overloaded');
  });

  it('challan rejects OPEN session', async () => {
    const app = buildApp();
    const svc = new ManifestService(app);
    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseSessionEntity());
    await expect(svc.generateDeliveryChallan('sid')).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 400,
    });
  });

  it('CLOSED session challan totals 10 × ₹1000 + 18% GST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 5, 1, 12, 0, 0));

    const app = buildApp();
    const svc = new ManifestService(app);
    const s = baseSessionEntity();
    s.status = SessionStatus.CLOSED;
    s.closedAt = new Date('2026-06-01');
    s.purchaseOrder.lineItems = [
      {
        orderedBoxes: 20,
        loadedBoxes: 10,
        orderedPieces: 200,
        loadedPieces: 100,
        ratePerBoxPaise: 100_000,
        gstPercent: 18,
        variant: {
          colourName: 'R',
          colourCode: 'R',
          lengthMm: null,
          widthMm: null,
          thicknessMm: null,
          product: { sku: 'S', name: 'Prod', piecesPerBox: 10, hsnCode: '39204990' },
        },
      },
    ];

    (app.prisma.dispatchSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    (
      app.prisma.systemConfig.findUnique as ReturnType<typeof vi.fn>
    ).mockImplementation(async ({ where }: { where: { key: string } }) => ({
      value: {
        COMPANY_NAME: 'Acme',
        COMPANY_GSTIN: 'GST',
        COMPANY_ADDRESS: 'Addr, Maharashtra, India',
        COMPANY_PHONE: 'P',
        COMPANY_EMAIL: '@',
      }[where.key],
    }));
    (app.redis.incr as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (app.redis.expire as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (app.prisma.dispatchSession.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const html = await lastSetContentHtml(() => svc.generateDeliveryChallan('sid'));
    expect(html).toContain('10000.00');
    expect(html).toContain('1800.00');
    expect(html).toContain('11800.00');
    expect(html).toMatch(/DC-2026-0001/);
  });
});
