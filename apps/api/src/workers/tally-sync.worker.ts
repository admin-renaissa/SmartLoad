import { Worker, Queue, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import { processTallySyncJob } from './tally-sync.processor.js';

const prisma = new PrismaClient();

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
};

if (process.env.ENABLE_TALLY_SYNC === 'true') {
  const intervalMin = Math.max(1, parseInt(process.env.TALLY_PULL_INTERVAL_MINUTES || '15', 10));
  const intervalMs = intervalMin * 60 * 1000;
  const scheduleQueue = new Queue(QUEUES.TALLY_SYNC, { connection });
  void (async () => {
    try {
      await scheduleQueue.add('pull', { type: 'PULL_PARTIES' }, {
        repeat: { every: intervalMs },
        jobId: 'scheduled-tally-pull-parties',
      });
      await scheduleQueue.add('pull', { type: 'PULL_ORDERS' }, {
        repeat: { every: intervalMs },
        jobId: 'scheduled-tally-pull-orders',
      });
    } catch (err) {
      console.error('[tally-sync] Failed to register scheduled pull jobs:', err);
    } finally {
      await scheduleQueue.close();
    }
  })();
}

interface JobData {
  sessionId?: string;
  grnId?: string;
  type: string;
}

export const tallySyncWorker = new Worker<JobData>(
  QUEUES.TALLY_SYNC,
  async (job: Job<JobData>) => {
    await processTallySyncJob(
      prisma,
      { ...job.data, attemptNumber: job.attemptsMade + 1 },
      async (msg) => {
        await job.log(msg);
      },
    );
  },
  {
    connection,
    concurrency: 1,
  },
);

tallySyncWorker.on('failed', (job, err) => {
  console.error(`[tally-sync] Job ${job?.id} failed:`, err.message);
});
