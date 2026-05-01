import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { QUEUES } from '@smartload/shared';
import { runInventoryDeductionForSession } from './inventory-deduction.processor.js';

const prisma = new PrismaClient();
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
};

interface JobData {
  sessionId: string;
}

export const inventoryDeductionWorker = new Worker<JobData>(
  QUEUES.INVENTORY_DEDUCTION,
  async (job: Job<JobData>) => {
    const { sessionId } = job.data;
    await runInventoryDeductionForSession(prisma, redisConnection, sessionId, async (msg) => {
      await job.log(msg);
    });
  },
  {
    connection,
    concurrency: 2,
  },
);

inventoryDeductionWorker.on('completed', (job) => {
  console.log(`[inventory-deduction] Job ${job.id} completed`);
});

inventoryDeductionWorker.on('failed', (job, err) => {
  console.error(`[inventory-deduction] Job ${job?.id} failed:`, err.message);
});
