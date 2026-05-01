import type { PrismaClient } from '@prisma/client';
import { TallySyncDataType, TallySyncDirection, TallySyncStatus } from '@prisma/client';

export type ProcessorLogger = (message: string) => Promise<void>;

function resolveDataType(type: string): TallySyncDataType {
  const allowed = Object.values(TallySyncDataType) as string[];
  if (allowed.includes(type)) return type as TallySyncDataType;
  return TallySyncDataType.DISPATCH_OUTWARD;
}

/**
 * Persists a pending Tally sync job for Phase 4 bridge pickup (real DB row).
 */
export async function runTallySyncEnqueue(
  prisma: PrismaClient,
  params: { sessionId?: string; grnId?: string; type: string },
  log: ProcessorLogger,
): Promise<{ syncJobId: string; status: string }> {
  const { sessionId, grnId, type } = params;
  await log(`Tally sync queued: type=${type}, sessionId=${sessionId ?? 'N/A'}`);

  const dataType = resolveDataType(type);
  const direction: TallySyncDirection = type.includes('PULL') ? 'PULL' : 'PUSH';

  const syncJob = await prisma.tallySyncJob.create({
    data: {
      direction,
      dataType,
      status: TallySyncStatus.PENDING,
      referenceId: sessionId ?? grnId ?? null,
      requestPayload: { sessionId, grnId, type },
      attempts: 0,
    },
  });

  await log(`TallySyncJob created: ${syncJob.id} — will be processed when Tally Bridge is configured`);

  if (process.env.ENABLE_TALLY_SYNC === 'true') {
    await log('ENABLE_TALLY_SYNC=true but Phase 4 bridge handles execution');
  }

  return { syncJobId: syncJob.id, status: 'PENDING' };
}
