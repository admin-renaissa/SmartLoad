import { Worker, type Job } from 'bullmq';
import { PrismaClient, PODStatus } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { addHours, QUEUES } from '@smartload/shared';

const prisma = new PrismaClient();
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

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
    const { sessionId } = job.data;
    await job.log(`Creating POD for session ${sessionId}`);

    const session = await prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        vehicle: true,
        purchaseOrder: {
          include: {
            client: true,
            lineItems: { include: { variant: { include: { product: true } } } },
          },
        },
      },
    });
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.podCreated) {
      await job.log('POD already created — skipping');
      return { skipped: true };
    }

    const linkToken = randomUUID();
    const linkExpiresAt = addHours(new Date(), 72);

    const pod = await prisma.$transaction(async (tx) => {
      const newPod = await tx.proofOfDelivery.create({
        data: {
          sessionId,
          linkToken,
          linkExpiresAt,
          status: PODStatus.LINK_SENT,
        },
      });

      for (const li of session.purchaseOrder.lineItems) {
        if (li.loadedBoxes > 0) {
          await tx.pODLineItem.create({
            data: {
              podId: newPod.id,
              lineItemId: li.id,
              deliveredBoxes: li.loadedBoxes,
              acknowledgedBoxes: 0,
              discrepancyBoxes: 0,
            },
          });
        }
      }

      await tx.dispatchSession.update({
        where: { id: sessionId },
        data: { podCreated: true },
      });

      return newPod;
    });

    const podUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/pod/${linkToken}`;
    const client = session.purchaseOrder.client;

    await redisConnection.lpush(
      'notification-queue',
      JSON.stringify({
        type: 'POD_DISPATCH',
        channel: ['SMS', 'WHATSAPP'],
        phone: client.phone,
        email: client.email,
        variables: {
          companyName: process.env.COMPANY_NAME ?? 'SmartLoad',
          poNumber: session.purchaseOrder.poNumber,
          vehicleReg: session.vehicle.registrationNumber,
          podUrl,
          clientName: client.name,
          itemCount: session.purchaseOrder.lineItems.filter((li) => li.loadedBoxes > 0).length,
          totalBoxes: session.totalBoxesScanned,
        },
      }),
    );

    await job.log(`POD created: ${pod.id}, link: ${podUrl}`);
    return { podId: pod.id, podUrl };
  },
  {
    connection,
    concurrency: 5,
  },
);

podCreationWorker.on('failed', (job, err) => {
  console.error(`[pod-creation] Job ${job?.id} failed:`, err.message);
});
