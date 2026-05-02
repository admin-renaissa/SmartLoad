/**
 * Unit tests for tally-bridge.client.ts — mocks axios, verifies HTTP routing
 * and error-propagation logic without hitting a real bridge.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
  },
}));

function makeAxiosInstance(opts: { status?: number; data?: unknown; throw?: Error }) {
  const fn = opts.throw
    ? vi.fn().mockRejectedValue(opts.throw)
    : vi.fn().mockResolvedValue({ status: opts.status ?? 200, data: opts.data ?? {} });
  return {
    get: fn,
    post: fn,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bridgeGetHealth', () => {
  it('returns data from /health', async () => {
    const inst = makeAxiosInstance({ data: { status: 'ok', tallyConnected: true, lastSyncAt: '2025-01-01' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgeGetHealth } = await import('../tally-bridge.client.js');
    const result = await bridgeGetHealth();
    expect(result.status).toBe('ok');
    expect(result.tallyConnected).toBe(true);
    expect(inst.get).toHaveBeenCalledWith('/health');
  });
});

describe('bridgePostPullStockItems', () => {
  it('returns data on 200', async () => {
    const payload = { success: true, data: [{ name: 'PVC Sheet' }], count: 1 };
    const inst = makeAxiosInstance({ data: payload });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPullStockItems } = await import('../tally-bridge.client.js');
    const result = await bridgePostPullStockItems();
    expect(result).toEqual(payload);
  });

  it('throws on HTTP 4xx with error message from body', async () => {
    const inst = makeAxiosInstance({ status: 401, data: { error: 'Unauthorized' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPullStockItems } = await import('../tally-bridge.client.js');
    await expect(bridgePostPullStockItems()).rejects.toThrow('Unauthorized');
  });

  it('throws on HTTP 500 with fallback message', async () => {
    const inst = makeAxiosInstance({ status: 500, data: {} });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPullStockItems } = await import('../tally-bridge.client.js');
    await expect(bridgePostPullStockItems()).rejects.toThrow('HTTP 500');
  });
});

describe('bridgePostPullParties', () => {
  it('returns party data on 200', async () => {
    const payload = { success: true, data: [{ name: 'ABC Ltd' }], count: 1 };
    const inst = makeAxiosInstance({ data: payload });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPullParties } = await import('../tally-bridge.client.js');
    const result = await bridgePostPullParties();
    expect(result).toEqual(payload);
  });
});

describe('bridgePostPushStockJournal', () => {
  it('returns voucherId on success', async () => {
    const inst = makeAxiosInstance({ data: { success: true, voucherId: 'VOC-001' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPushStockJournal } = await import('../tally-bridge.client.js');
    const result = await bridgePostPushStockJournal({ sessionCode: 'SES-001', items: [] });
    expect(result.voucherId).toBe('VOC-001');
    expect(result.success).toBe(true);
  });

  it('throws on HTTP 400', async () => {
    const inst = makeAxiosInstance({ status: 400, data: { error: 'Missing session' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPushStockJournal } = await import('../tally-bridge.client.js');
    await expect(bridgePostPushStockJournal({ sessionCode: '' })).rejects.toThrow('Missing session');
  });
});

describe('bridgePostPushGrn', () => {
  it('returns voucherId on success', async () => {
    const inst = makeAxiosInstance({ data: { success: true, voucherId: 'GRN-VOC-001' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPushGrn } = await import('../tally-bridge.client.js');
    const result = await bridgePostPushGrn({ grnNumber: 'GRN-001', lineItems: [] });
    expect(result.voucherId).toBe('GRN-VOC-001');
  });

  it('throws on HTTP 4xx', async () => {
    const inst = makeAxiosInstance({ status: 422, data: { error: 'Validation error' } });
    vi.mocked(axios.create).mockReturnValue(inst as ReturnType<typeof axios.create>);

    const { bridgePostPushGrn } = await import('../tally-bridge.client.js');
    await expect(bridgePostPushGrn({ grnNumber: '' })).rejects.toThrow('Validation error');
  });
});
