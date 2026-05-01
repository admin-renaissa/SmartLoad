/**
 * Live integration tests: real Postgres (DATABASE_URL) + Redis (REDIS_URL).
 * Does not run in default `pnpm test`. Opt in:
 *   RUN_WORKER_INTEGRATION_TESTS=true pnpm --filter @smartload/api run test:integration
 *
 * Uses isolated IDs per run and deletes all created rows when finished.
 */
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PrismaClient,
  UserRole,
  POStatus,
  VehicleType,
  SessionStatus,
  ScanResult,
} from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUES } from '@smartload/shared';
import { runInventoryDeductionForSession } from '../inventory-deduction.processor.js';
import { runPodCreationForSession } from '../pod-creation.processor.js';
import { runTallySyncEnqueue } from '../tally-sync.processor.js';

const RUN = process.env.RUN_WORKER_INTEGRATION_TESTS === 'true';

describe.skipIf(!RUN)('worker processors — integration (real DB + Redis)', () => {
  const prisma = new PrismaClient();
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  it('runInventoryDeductionForSession decrements stock, writes ledger, marks session deducted', async () => {
    const sfx = randomBytes(6).toString('hex');
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    const category = await prisma.productCategory.findFirst({ where: { isActive: true } });
    if (!admin) throw new Error('Seed an ADMIN user before integration tests');
    if (!category) throw new Error('Seed at least one product category before integration tests');

    const barcodeValue = `BAR-INT-${sfx}`;
    const sku = `SKU-INT-${sfx}`;
    const poNumber = `PO-INT-${sfx}`;
    const sessionCode = `DS-INT-${sfx}`;
    const regNo = `MH${sfx.slice(0, 8).toUpperCase()}`;
    const clientCode = `CL-${sfx}`;

    const product = await prisma.product.create({
      data: {
        sku,
        name: `Integration Product ${sfx}`,
        categoryId: category.id,
        piecesPerBox: 10,
        minStockAlert: 0,
        isActive: true,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        colourCode: 'INT',
        colourName: 'Integration',
        barcodeValue,
        barcodeFormat: 'QR',
        lengthMm: 100,
        widthMm: 100,
        thicknessMm: 1,
        isActive: true,
      },
    });

    await prisma.inventoryStock.create({
      data: {
        variantId: variant.id,
        totalBoxes: 100,
        reservedBoxes: 5,
      },
    });

    const client = await prisma.client.create({
      data: {
        clientCode,
        name: `Client ${sfx}`,
        phone: '+919999999999',
        billingAddress: {},
        shippingAddress: {},
        isActive: true,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        registrationNumber: regNo,
        type: VehicleType.TRUCK,
        driverName: 'Test Driver',
        driverPhone: '+919988776655',
        isActive: true,
      },
    });

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        clientId: client.id,
        orderDate: new Date(),
        status: POStatus.FULLY_LOADED,
        totalAmountPaise: 0,
        createdById: admin.id,
        lineItems: {
          create: {
            variantId: variant.id,
            orderedBoxes: 10,
            orderedPieces: 100,
            ratePerBoxPaise: 10000,
            gstPercent: 18,
            totalAmountPaise: 118000,
            loadedBoxes: 2,
            loadedPieces: 20,
          },
        },
      },
      include: { lineItems: true },
    });

    const session = await prisma.dispatchSession.create({
      data: {
        sessionCode,
        poId: po.id,
        vehicleId: vehicle.id,
        supervisorId: admin.id,
        operatorId: admin.id,
        status: SessionStatus.CLOSED,
        closedAt: new Date(),
        totalBoxesExpected: 10,
        totalBoxesScanned: 2,
        inventoryDeducted: false,
        podCreated: false,
      },
    });

    await prisma.scanEvent.createMany({
      data: [
        {
          sessionId: session.id,
          operatorId: admin.id,
          scannedBarcode: barcodeValue,
          resolvedVariantId: variant.id,
          result: ScanResult.SUCCESS,
        },
        {
          sessionId: session.id,
          operatorId: admin.id,
          scannedBarcode: barcodeValue,
          resolvedVariantId: variant.id,
          result: ScanResult.SUCCESS,
        },
      ],
    });

    const log = async (_msg: string) => {};

    const out = await runInventoryDeductionForSession(prisma, redis, session.id, log);
    expect(out.deducted).toBe(1);
    expect(out.skipped).toBeUndefined();

    const updatedSession = await prisma.dispatchSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.inventoryDeducted).toBe(true);

    const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { variantId: variant.id } });
    expect(stock.totalBoxes).toBe(98);
    expect(stock.reservedBoxes).toBe(3);

    const ledgerRows = await prisma.inventoryLedger.findMany({
      where: { referenceType: 'DISPATCH_SESSION', referenceId: session.id },
    });
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0]?.boxes).toBe(2);
    expect(ledgerRows[0]?.pieces).toBe(20);

    await prisma.inventoryLedger.deleteMany({
      where: { referenceType: 'DISPATCH_SESSION', referenceId: session.id },
    });
    await prisma.scanEvent.deleteMany({ where: { sessionId: session.id } });
    await prisma.dispatchSession.delete({ where: { id: session.id } });
    await prisma.pOLineItem.deleteMany({ where: { poId: po.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.inventoryStock.delete({ where: { variantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  it('runPodCreationForSession creates POD, lines, enqueues BullMQ notification jobs', async () => {
    const sfx = randomBytes(6).toString('hex');
    const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });
    const category = await prisma.productCategory.findFirst({ where: { isActive: true } });
    if (!admin || !category) throw new Error('Missing seed admin or category');

    const barcodeValue = `BAR-POD-${sfx}`;
    const sku = `SKU-POD-${sfx}`;
    const poNumber = `PO-POD-${sfx}`;
    const sessionCode = `DS-POD-${sfx}`;
    const regNo = `MH${sfx.slice(2, 10).toUpperCase()}`;
    const clientCode = `CLP-${sfx}`;

    const product = await prisma.product.create({
      data: {
        sku,
        name: `POD Product ${sfx}`,
        categoryId: category.id,
        piecesPerBox: 10,
        minStockAlert: 0,
        isActive: true,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        colourCode: 'POD',
        colourName: 'PodColour',
        barcodeValue,
        barcodeFormat: 'QR',
        lengthMm: 100,
        widthMm: 100,
        thicknessMm: 1,
        isActive: true,
      },
    });

    await prisma.inventoryStock.create({
      data: { variantId: variant.id, totalBoxes: 50, reservedBoxes: 0 },
    });

    const client = await prisma.client.create({
      data: {
        clientCode,
        name: `Pod Client ${sfx}`,
        phone: '+918888888888',
        billingAddress: {},
        shippingAddress: {},
        isActive: true,
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        registrationNumber: regNo,
        type: VehicleType.TRUCK,
        driverName: 'Pod Driver',
        driverPhone: '+917777777777',
        isActive: true,
      },
    });

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        clientId: client.id,
        orderDate: new Date(),
        status: POStatus.FULLY_LOADED,
        totalAmountPaise: 0,
        createdById: admin.id,
        lineItems: {
          create: {
            variantId: variant.id,
            orderedBoxes: 5,
            orderedPieces: 50,
            ratePerBoxPaise: 10000,
            gstPercent: 18,
            totalAmountPaise: 59000,
            loadedBoxes: 3,
            loadedPieces: 30,
          },
        },
      },
      include: { lineItems: true },
    });

    const session = await prisma.dispatchSession.create({
      data: {
        sessionCode,
        poId: po.id,
        vehicleId: vehicle.id,
        supervisorId: admin.id,
        operatorId: admin.id,
        status: SessionStatus.CLOSED,
        closedAt: new Date(),
        totalBoxesExpected: 5,
        totalBoxesScanned: 3,
        inventoryDeducted: true,
        podCreated: false,
      },
    });

    const notifQueue = new Queue(QUEUES.NOTIFICATIONS, {
      connection: {
        host: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port || '6379', 10),
      },
    });
    const beforeWaiting = await notifQueue.getWaitingCount();

    const log = async (_msg: string) => {};
    const result = await runPodCreationForSession(prisma, session.id, log);
    expect(result.podId).toBeDefined();
    expect(result.podUrl).toContain('/pod/');

    const pod = await prisma.proofOfDelivery.findUnique({
      where: { sessionId: session.id },
      include: { lineItems: true },
    });
    expect(pod).not.toBeNull();
    expect(pod!.lineItems.length).toBeGreaterThan(0);

    const updated = await prisma.dispatchSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.podCreated).toBe(true);

    const afterWaiting = await notifQueue.getWaitingCount();
    expect(afterWaiting).toBeGreaterThanOrEqual(beforeWaiting + 2);

    await notifQueue.close();

    await prisma.pODLineItem.deleteMany({ where: { podId: pod!.id } });
    await prisma.proofOfDelivery.delete({ where: { id: pod!.id } });
    await prisma.dispatchSession.delete({ where: { id: session.id } });
    await prisma.pOLineItem.deleteMany({ where: { poId: po.id } });
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.inventoryStock.delete({ where: { variantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });

  });

  it('runTallySyncEnqueue persists TallySyncJob', async () => {
    const log = async (_msg: string) => {};
    const { syncJobId } = await runTallySyncEnqueue(
      prisma,
      { sessionId: undefined, type: 'DISPATCH_OUTWARD' },
      log,
    );

    const row = await prisma.tallySyncJob.findUnique({ where: { id: syncJobId } });
    expect(row).not.toBeNull();

    await prisma.tallySyncJob.delete({ where: { id: syncJobId } });
  });
});
