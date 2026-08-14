import axios, { type AxiosInstance } from 'axios';

function baseUrl(): string {
  return (process.env.TALLY_BRIDGE_URL || 'http://localhost:7474').replace(/\/$/, '');
}

function authHeader(): string {
  return `Bearer ${process.env.TALLY_BRIDGE_SECRET || 'change-me'}`;
}

function client(): AxiosInstance {
  return axios.create({
    baseURL: baseUrl(),
    timeout: 120_000,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    validateStatus: (s) => s < 600,
  });
}

export async function bridgeGetHealth(): Promise<{
  status: string;
  tallyConnected?: boolean;
  lastSyncAt?: string | null;
}> {
  const { data } = await client().get('/health');
  return data;
}

export async function bridgePostPullStockItems(): Promise<unknown> {
  const { data, status } = await client().post('/pull/stock-items', {});
  if (status >= 400) throw new Error((data as { error?: string })?.error || `HTTP ${status}`);
  return data;
}

export async function bridgePostPullParties(): Promise<unknown> {
  const { data, status } = await client().post('/pull/parties', {});
  if (status >= 400) throw new Error((data as { error?: string })?.error || `HTTP ${status}`);
  return data;
}

export async function bridgePostPullOrders(): Promise<unknown> {
  const { data, status } = await client().post('/pull/orders', {});
  if (status >= 400) throw new Error((data as { error?: string })?.error || `HTTP ${status}`);
  return data;
}

export async function bridgePostPushStockJournal(session: Record<string, unknown>): Promise<{
  success?: boolean;
  voucherId?: string;
  error?: string;
}> {
  const { data, status } = await client().post('/push/stock-journal', { session });
  if (status >= 400) {
    throw new Error((data as { error?: string })?.error || `HTTP ${status}`);
  }
  return data as { success?: boolean; voucherId?: string; error?: string };
}

export async function bridgePostPushGrn(grn: Record<string, unknown>): Promise<{
  success?: boolean;
  voucherId?: string;
  error?: string;
}> {
  const { data, status } = await client().post('/push/grn', { grn });
  if (status >= 400) {
    throw new Error((data as { error?: string })?.error || `HTTP ${status}`);
  }
  return data as { success?: boolean; voucherId?: string; error?: string };
}
