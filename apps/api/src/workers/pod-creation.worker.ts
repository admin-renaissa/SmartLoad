import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import { runPodCreationForSession } from './pod-creation.processor.js';

const prisma = new PrismaClient();

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
};

interface JobData {
  sessionId: string;
}

export const podCreationWorker = new Worker<JobData>(
  QUEUES.POD_CREATION,
  async (job: Job<JobData>) => {
    await runPodCreationForSession(prisma, job.data.sessionId, async (msg) => {
      await job.log(msg);
    });
  },
  {
    connection,
    concurrency: 5,
  },
);

podCreationWorker.on('failed', (job, err) => {
  console.error(`[pod-creation] Job ${job?.id} failed:`, err.message);
});
