import { get, set } from 'idb-keyval';

const QUEUE_KEY = 'smartload-offline-scan-queue';

export type QueuedScan = {
  sessionId: string;
  rawBarcode: string;
  deviceId?: string;
  ts: number;
};

async function readAll(): Promise<QueuedScan[]> {
  const raw = await get<QueuedScan[]>(QUEUE_KEY);
  return Array.isArray(raw) ? raw : [];
}

export async function countQueuedForSession(sessionId: string): Promise<number> {
  const q = await readAll();
  return q.filter((x) => x.sessionId === sessionId).length;
}

export async function enqueueOfflineScan(item: QueuedScan): Promise<void> {
  const q = await readAll();
  q.push(item);
  await set(QUEUE_KEY, q);
}

/** Returns number of scans successfully replayed for this session. */
export async function flushQueuedScansForSession(
  sessionId: string,
  post: (rawBarcode: string, deviceId?: string) => Promise<unknown>,
): Promise<number> {
  const q = await readAll();
  const keep: QueuedScan[] = [];
  let flushed = 0;
  for (const item of q) {
    if (item.sessionId !== sessionId) {
      keep.push(item);
      continue;
    }
    try {
      await post(item.rawBarcode, item.deviceId);
      flushed += 1;
    } catch {
      keep.push(item);
    }
  }
  await set(QUEUE_KEY, keep);
  return flushed;
}
