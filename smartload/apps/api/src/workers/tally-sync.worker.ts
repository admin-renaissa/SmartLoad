import { Worker, type Job } from 'bullmq';
import { PrismaClient, type Prisma } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import axios from 'axios';

const prisma = new PrismaClient();
const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

interface TallySyncJobData {
  type: 'DISPATCH_OUTWARD' | 'GRN_INWARD' | 'PULL_STOCK' | 'PULL_PARTIES';
  sessionId?: string;
  grnId?: string;
}

export function startTallySyncWorker() {
  const worker = new Worker(
    QUEUES.TALLY_SYNC,
    async (job: Job<TallySyncJobData>) => {
      const { type, sessionId, grnId } = job.data;
      console.log(`[TallyWorker] Processing ${type}`);

      const syncJob = await prisma.tallySyncJob.create({
        data: {
          direction: type.startsWith('PULL') ? 'PULL' : 'PUSH',
          dataType: type,
          referenceId: sessionId || grnId,
          status: 'PROCESSING',
          attempts: 1,
        },
      });

      try {
        if (!process.env.TALLY_BRIDGE_URL) {
          console.log(`[TallyWorker MOCK] Would push ${type} to Tally Bridge`);
          await prisma.tallySyncJob.update({
            where: { id: syncJob.id },
            data: { status: 'COMPLETED', processedAt: new Date() },
          });
          return;
        }

        let endpoint = '';
        let payload: Record<string, unknown> = {};

        if (type === 'DISPATCH_OUTWARD' && sessionId) {
          endpoint = '/push/stock-journal';
          const session = await prisma.dispatchSession.findUnique({
            where: { id: sessionId },
            include: {
              po: { include: { client: true } },
              scanEvents: {
                where: { result: 'SUCCESS' },
                include: { resolvedVariant: { include: { product: true } } },
              },
            },
          });
          payload = { session };
        } else if (type === 'GRN_INWARD' && grnId) {
          endpoint = '/push/grn';
          const grn = await prisma.goodsReceiptNote.findUnique({
            where: { id: grnId },
            include: { lineItems: { include: { variant: { include: { product: true } } } } },
          });
          payload = { grn };
        } else if (type === 'PULL_STOCK') {
          endpoint = '/pull/stock-items';
        } else if (type === 'PULL_PARTIES') {
          endpoint = '/pull/parties';
        }

        const response = await axios.post(
          `${process.env.TALLY_BRIDGE_URL}${endpoint}`,
          payload,
          {
            headers: { Authorization: `Bearer ${process.env.TALLY_BRIDGE_SECRET}` },
            timeout: 30000,
          },
        );

        await prisma.tallySyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            responsePayload: response.data as Prisma.InputJsonValue,
            tallyVoucherId: (response.data as { voucherId?: string })?.voucherId,
          },
        });

        if (sessionId && type === 'DISPATCH_OUTWARD') {
          await prisma.dispatchSession.update({
            where: { id: sessionId },
            data: { tallyVoucherId: (response.data as { voucherId?: string })?.voucherId },
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await prisma.tallySyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: job.attemptsMade >= 3 ? 'PERMANENTLY_FAILED' : 'FAILED',
            errorMessage,
            nextRetryAt: new Date(Date.now() + Math.pow(2, job.attemptsMade) * 5000),
          },
        });
        throw err;
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[TallyWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
