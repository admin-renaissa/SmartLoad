import { Worker, type Job } from 'bullmq';
import { PrismaClient, TallySyncDataType, TallySyncDirection, TallySyncStatus } from '@prisma/client';
import { QUEUES } from '@smartload/shared';

const prisma = new PrismaClient();

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
};

interface JobData {
  sessionId?: string;
  grnId?: string;
  type: string;
}

function resolveDataType(type: string): TallySyncDataType {
  const allowed = Object.values(TallySyncDataType) as string[];
  if (allowed.includes(type)) return type as TallySyncDataType;
  return TallySyncDataType.DISPATCH_OUTWARD;
}

export const tallySyncWorker = new Worker<JobData>(
  QUEUES.TALLY_SYNC,
  async (job: Job<JobData>) => {
    const { sessionId, grnId, type } = job.data;
    await job.log(`Tally sync queued: type=${type}, sessionId=${sessionId ?? 'N/A'}`);

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

    await job.log(`TallySyncJob created: ${syncJob.id} — will be processed when Tally Bridge is configured`);

    if (process.env.ENABLE_TALLY_SYNC === 'true') {
      await job.log('ENABLE_TALLY_SYNC=true but Phase 4 bridge handles execution');
    }

    return { syncJobId: syncJob.id, status: 'PENDING' };
  },
  {
    connection,
    concurrency: 1,
  },
);

tallySyncWorker.on('failed', (job, err) => {
  console.error(`[tally-sync] Job ${job?.id} failed:`, err.message);
});
