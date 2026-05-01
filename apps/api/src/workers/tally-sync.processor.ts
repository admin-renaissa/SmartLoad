import type { PrismaClient } from '@prisma/client';
import {
  TallySyncDataType,
  TallySyncDirection,
  TallySyncStatus,
} from '@prisma/client';
import {
  bridgePostPullParties,
  bridgePostPullOrders,
  bridgePostPullStockItems,
  bridgePostPushGrn,
  bridgePostPushStockJournal,
} from '../lib/tally-bridge.client.js';
import {
  applyPullOrdersToDatabase,
  syncPartiesToClients,
  type PullOrdersBridgeResponse,
  type TallyPartyRow,
} from '../modules/tally/tally-import.service.js';

export type ProcessorLogger = (message: string) => Promise<void>;

function resolveDataType(type: string): TallySyncDataType {
  const allowed = Object.values(TallySyncDataType) as string[];
  if (allowed.includes(type)) return type as TallySyncDataType;
  return TallySyncDataType.DISPATCH_OUTWARD;
}

export async function runTallySyncEnqueue(
  prisma: PrismaClient,
  params: { sessionId?: string; grnId?: string; type: string },
  log: ProcessorLogger,
): Promise<{ syncJobId: string; status: string }> {
  await log(`Legacy tally enqueue test hook: type=${params.type}`);
  return processTallySyncJob(prisma, { ...params, attemptNumber: 0 }, log);
}

export interface TallyJobPayload {
  sessionId?: string;
  grnId?: string;
  type: string;
  attemptNumber?: number;
}

async function upsertConfig(prisma: PrismaClient, key: string, value: string, userId?: string) {
  await prisma.systemConfig.upsert({
    where: { key },
    create: {
      key,
      value,
      description: `Tally pull snapshot: ${key}`,
      updatedById: userId ?? null,
    },
    update: { value, updatedById: userId ?? null },
  });
}

export async function buildSessionPayloadForBridge(
  prisma: PrismaClient,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const session = await prisma.dispatchSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      purchaseOrder: { include: { client: true, lineItems: true } },
      vehicle: true,
      scanEvents: {
        where: { result: 'SUCCESS' },
        orderBy: { scannedAt: 'asc' },
        include: {
          resolvedVariant: { include: { product: true } },
        },
      },
    },
  });

  return {
    id: session.id,
    sessionCode: session.sessionCode,
    closedAt: session.closedAt?.toISOString() ?? new Date().toISOString(),
    totalBoxesScanned: session.totalBoxesScanned,
    po: {
      id: session.purchaseOrder.id,
      poNumber: session.purchaseOrder.poNumber,
      client: session.purchaseOrder.client,
      lineItems: session.purchaseOrder.lineItems,
    },
    vehicle: session.vehicle,
    scanEvents: session.scanEvents.map((e) => ({
      id: e.id,
      scannedBarcode: e.scannedBarcode,
      result: e.result,
      resolvedVariant: e.resolvedVariant
        ? {
            id: e.resolvedVariant.id,
            colourName: e.resolvedVariant.colourName,
            colourCode: e.resolvedVariant.colourCode,
            product: e.resolvedVariant.product,
          }
        : null,
    })),
  };
}

async function buildGrnPayloadForBridge(prisma: PrismaClient, grnId: string): Promise<Record<string, unknown>> {
  const grn = await prisma.goodsReceiptNote.findUniqueOrThrow({
    where: { id: grnId },
    include: {
      lineItems: { include: { variant: { include: { product: true } } } },
    },
  });

  return {
    id: grn.id,
    grnNumber: grn.grnNumber,
    receivedDate: grn.receivedDate.toISOString(),
    notes: grn.notes,
    lineItems: grn.lineItems.map((li) => ({
      id: li.id,
      receivedBoxes: li.receivedBoxes,
      receivedPieces: li.receivedPieces,
      variant: li.variant,
    })),
  };
}

/**
 * Creates a TallySyncJob row and executes bridge calls when ENABLE_TALLY_SYNC=true.
 */
export async function processTallySyncJob(
  prisma: PrismaClient,
  params: TallyJobPayload,
  log: ProcessorLogger,
): Promise<{ syncJobId: string; status: string }> {
  const { sessionId, grnId, type } = params;
  const attemptNumber = params.attemptNumber ?? 0;
  const dataType = resolveDataType(type);
  const direction: TallySyncDirection = type.includes('PULL') ? 'PULL' : 'PUSH';

  const syncJob = await prisma.tallySyncJob.create({
    data: {
      direction,
      dataType,
      status: TallySyncStatus.PROCESSING,
      referenceId: sessionId ?? grnId ?? null,
      requestPayload: { sessionId, grnId, type, attemptNumber } as object,
      attempts: attemptNumber,
    },
  });

  const finish = async (
    status: TallySyncStatus,
    extras: {
      responsePayload?: object;
      errorMessage?: string | null;
      tallyVoucherId?: string | null;
    },
  ) => {
    await prisma.tallySyncJob.update({
      where: { id: syncJob.id },
      data: {
        status,
        processedAt: new Date(),
        responsePayload: extras.responsePayload ?? undefined,
        errorMessage: extras.errorMessage ?? undefined,
        tallyVoucherId: extras.tallyVoucherId ?? undefined,
      },
    });
  };

  try {
    if (process.env.ENABLE_TALLY_SYNC !== 'true') {
      await log('ENABLE_TALLY_SYNC is not true — marking job completed without bridge call');
      await finish(TallySyncStatus.COMPLETED, {
        responsePayload: { skipped: true, reason: 'ENABLE_TALLY_SYNC not true' },
      });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    await log(`Tally sync executing: type=${type}`);

    if (type === 'DISPATCH_OUTWARD' || dataType === TallySyncDataType.DISPATCH_OUTWARD) {
      if (!sessionId) throw new Error('sessionId required for DISPATCH_OUTWARD');
      const sessionPayload = await buildSessionPayloadForBridge(prisma, sessionId);
      const res = await bridgePostPushStockJournal(sessionPayload);
      if (!res.success) throw new Error(res.error || 'Stock journal push failed');
      const voucherId = res.voucherId ?? null;
      await prisma.dispatchSession.update({
        where: { id: sessionId },
        data: { tallyVoucherId: voucherId, tallySynced: true },
      });
      await finish(TallySyncStatus.COMPLETED, {
        responsePayload: res as object,
        tallyVoucherId: voucherId,
      });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    if (type === 'GRN_INWARD' || dataType === TallySyncDataType.GRN_INWARD) {
      if (!grnId) throw new Error('grnId required for GRN_INWARD');
      const grnPayload = await buildGrnPayloadForBridge(prisma, grnId);
      const res = await bridgePostPushGrn(grnPayload);
      if (!res.success) throw new Error(res.error || 'GRN push failed');
      const voucherId = res.voucherId ?? null;
      await prisma.goodsReceiptNote.update({
        where: { id: grnId },
        data: { tallyVoucherId: voucherId },
      });
      await finish(TallySyncStatus.COMPLETED, {
        responsePayload: res as object,
        tallyVoucherId: voucherId,
      });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    if (type === 'PULL_STOCK_ITEMS' || dataType === TallySyncDataType.PULL_STOCK_ITEMS) {
      const data = (await bridgePostPullStockItems()) as { items?: unknown[]; count?: number };
      await upsertConfig(
        prisma,
        'TALLY_LAST_STOCK_PULL',
        JSON.stringify({ pulledAt: new Date().toISOString(), ...data }),
      );
      await finish(TallySyncStatus.COMPLETED, { responsePayload: data as object });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    if (type === 'PULL_PARTIES' || dataType === TallySyncDataType.PULL_PARTIES) {
      const raw = await bridgePostPullParties();
      const data = raw as { parties?: TallyPartyRow[]; count?: number };
      await upsertConfig(
        prisma,
        'TALLY_LAST_PARTIES_PULL',
        JSON.stringify({ pulledAt: new Date().toISOString(), ...data }),
      );
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
      const sync = await syncPartiesToClients(prisma, data, admin?.id);
      await finish(TallySyncStatus.COMPLETED, {
        responsePayload: { ...data, sync } as object,
      });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    if (type === 'PULL_ORDERS' || dataType === TallySyncDataType.PULL_ORDERS) {
      const raw = await bridgePostPullOrders();
      const body = raw as PullOrdersBridgeResponse;
      await upsertConfig(
        prisma,
        'TALLY_LAST_ORDERS_PULL',
        JSON.stringify({ pulledAt: new Date().toISOString(), ...body }),
      );
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
      const importResult = await applyPullOrdersToDatabase(prisma, body, admin?.id);
      await finish(TallySyncStatus.COMPLETED, {
        responsePayload: { ...body, importResult } as object,
      });
      return { syncJobId: syncJob.id, status: 'COMPLETED' };
    }

    await finish(TallySyncStatus.FAILED, {
      errorMessage: `Unsupported tally job type: ${type}`,
    });
    return { syncJobId: syncJob.id, status: 'FAILED' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(`Tally sync failed: ${message}`);
    await prisma.tallySyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: TallySyncStatus.FAILED,
        errorMessage: message,
        processedAt: new Date(),
      },
    });
    throw err;
  }
}
