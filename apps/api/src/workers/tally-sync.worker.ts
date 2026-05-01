import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import { runTallySyncEnqueue } from './tally-sync.processor.js';

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

export const tallySyncWorker = new Worker<JobData>(
  QUEUES.TALLY_SYNC,
  async (job: Job<JobData>) => {
    await runTallySyncEnqueue(prisma, job.data, async (msg) => {
      await job.log(msg);
    });
  },
  {
    connection,
    concurrency: 1,
  },
);

tallySyncWorker.on('failed', (job, err) => {
  console.error(`[tally-sync] Job ${job?.id} failed:`, err.message);
});
