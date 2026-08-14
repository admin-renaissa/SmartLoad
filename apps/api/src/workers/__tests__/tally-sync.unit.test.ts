/**
 * Unit tests for processTallySyncJob.
 * All Prisma and bridge calls are mocked — no DB or Redis required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TallySyncStatus } from '@prisma/client';

// ── Bridge client mock ────────────────────────────────────────────────────────
vi.mock('../../lib/tally-bridge.client.js', () => ({
  bridgePostPullStockItems: vi.fn(),
  bridgePostPullParties: vi.fn(),
  bridgePostPullOrders: vi.fn(),
  bridgePostPushStockJournal: vi.fn(),
  bridgePostPushGrn: vi.fn(),
}));

// ── Tally-import service mock ─────────────────────────────────────────────────
vi.mock('../../modules/tally/tally-import.service.js', () => ({
  applyPullOrdersToDatabase: vi.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
  syncPartiesToClients: vi.fn().mockResolvedValue({ synced: 0 }),
}));

import {
  bridgePostPullStockItems,
  bridgePostPullParties,
  bridgePostPullOrders,
  bridgePostPushStockJournal,
  bridgePostPushGrn,
} from '../../lib/tally-bridge.client.js';

import { processTallySyncJob } from '../tally-sync.processor.js';

// ── Prisma mock ───────────────────────────────────────────────────────────────
function makePrisma(overrides: Partial<Record<string, unknown>> = {}): PrismaClient {
  const mockJob = {
    id: 'job-001',
    direction: 'PULL',
    dataType: 'PULL_STOCK_ITEMS',
    status: TallySyncStatus.PROCESSING,
  };

  return {
    tallySyncJob: {
      create: vi.fn().mockResolvedValue(mockJob),
      update: vi.fn().mockResolvedValue(mockJob),
      findUnique: vi.fn().mockResolvedValue(mockJob),
    },
    systemConfig: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'admin-1', role: 'ADMIN' }),
    },
    dispatchSession: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'ses-001',
        sessionCode: 'SES-001',
        closedAt: new Date(),
        totalBoxesScanned: 10,
        purchaseOrder: { id: 'po-1', poNumber: 'PO-001', client: { id: 'c-1' }, lineItems: [] },
        vehicle: { id: 'v-1', registrationNumber: 'MH01AB1234' },
        scanEvents: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    goodsReceiptNote: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'grn-001',
        grnNumber: 'GRN-001',
        receivedDate: new Date(),
        notes: null,
        lineItems: [],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const log = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.resetAllMocks();
  log.mockResolvedValue(undefined);
  delete process.env.ENABLE_TALLY_SYNC;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processTallySyncJob', () => {
  describe('when ENABLE_TALLY_SYNC is not true', () => {
    it('marks job COMPLETED with skipped=true without calling bridge', async () => {
      delete process.env.ENABLE_TALLY_SYNC;
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'PULL_STOCK_ITEMS' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPullStockItems)).not.toHaveBeenCalled();

      const updateCall = vi.mocked(
        (prisma.tallySyncJob as ReturnType<typeof vi.fn>).update
          ?? (prisma as unknown as { tallySyncJob: { update: ReturnType<typeof vi.fn> } }).tallySyncJob.update,
      );
      expect(updateCall).toHaveBeenCalled();
    });
  });

  describe('when ENABLE_TALLY_SYNC=true', () => {
    beforeEach(() => {
      process.env.ENABLE_TALLY_SYNC = 'true';
    });

    it('PULL_STOCK_ITEMS: calls bridge and upserts config', async () => {
      vi.mocked(bridgePostPullStockItems).mockResolvedValue({
        success: true,
        data: [{ name: 'PVC Sheet' }],
        count: 1,
      });
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'PULL_STOCK_ITEMS' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPullStockItems)).toHaveBeenCalledOnce();
    });

    it('PULL_PARTIES: calls bridge, syncs to clients', async () => {
      vi.mocked(bridgePostPullParties).mockResolvedValue({
        success: true,
        data: [{ name: 'ABC Ltd', gstin: '27AADCB2230M1Z3' }],
        count: 1,
      });
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'PULL_PARTIES' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPullParties)).toHaveBeenCalledOnce();
    });

    it('PULL_ORDERS: calls bridge and applies to DB', async () => {
      vi.mocked(bridgePostPullOrders).mockResolvedValue({
        success: true,
        orders: [],
        count: 0,
      });
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'PULL_ORDERS' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPullOrders)).toHaveBeenCalledOnce();
    });

    it('DISPATCH_OUTWARD: pushes session to bridge, updates session', async () => {
      vi.mocked(bridgePostPushStockJournal).mockResolvedValue({
        success: true,
        voucherId: 'VOC-001',
      });
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'DISPATCH_OUTWARD', sessionId: 'ses-001' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPushStockJournal)).toHaveBeenCalledOnce();
    });

    it('DISPATCH_OUTWARD throws when sessionId missing', async () => {
      const prisma = makePrisma();
      await expect(
        processTallySyncJob(prisma, { type: 'DISPATCH_OUTWARD' }, log),
      ).rejects.toThrow('sessionId required');
    });

    it('GRN_INWARD: pushes GRN to bridge, updates GRN record', async () => {
      vi.mocked(bridgePostPushGrn).mockResolvedValue({
        success: true,
        voucherId: 'GRN-VOC-001',
      });
      const prisma = makePrisma();

      const result = await processTallySyncJob(
        prisma,
        { type: 'GRN_INWARD', grnId: 'grn-001' },
        log,
      );

      expect(result.status).toBe('COMPLETED');
      expect(vi.mocked(bridgePostPushGrn)).toHaveBeenCalledOnce();
    });

    it('GRN_INWARD throws when grnId missing', async () => {
      const prisma = makePrisma();
      await expect(
        processTallySyncJob(prisma, { type: 'GRN_INWARD' }, log),
      ).rejects.toThrow('grnId required');
    });

    it('unknown type throws Invalid TallySyncDataType error', async () => {
      const prisma = makePrisma();
      await expect(
        processTallySyncJob(prisma, { type: 'UNKNOWN_TYPE_XYZ' }, log),
      ).rejects.toThrow('Invalid TallySyncDataType: UNKNOWN_TYPE_XYZ');
    });

    it('bridge failure marks job as FAILED and re-throws', async () => {
      vi.mocked(bridgePostPullStockItems).mockRejectedValue(new Error('Tally not reachable'));
      const prisma = makePrisma();

      await expect(
        processTallySyncJob(prisma, { type: 'PULL_STOCK_ITEMS' }, log),
      ).rejects.toThrow('Tally not reachable');
    });
  });
});
