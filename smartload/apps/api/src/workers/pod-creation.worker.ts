import { Worker, Queue, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { QUEUES, POD_LINK_EXPIRY_HOURS } from '@smartload/shared';

const prisma = new PrismaClient();
const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};
const notifQueue = new Queue(QUEUES.NOTIFICATIONS, { connection });

export function startPodWorker() {
  const worker = new Worker(
    QUEUES.POD_CREATION,
    async (job: Job<{ sessionId: string }>) => {
      const { sessionId } = job.data;
      console.log(`[PODWorker] Creating POD for session: ${sessionId}`);

      // Check if POD already exists
      const existing = await prisma.proofOfDelivery.findUnique({ where: { sessionId } });
      if (existing) {
        console.log(`[PODWorker] POD already exists for session: ${sessionId}`);
        return;
      }

      const session = await prisma.dispatchSession.findUnique({
        where: { id: sessionId },
        include: {
          purchaseOrder: {
            include: {
              client: true,
              lineItems: true,
            },
          },
          vehicle: true,
        },
      });

      if (!session) throw new Error(`Session not found: ${sessionId}`);

      const linkToken = randomUUID();
      const linkExpiresAt = new Date(Date.now() + POD_LINK_EXPIRY_HOURS * 60 * 60 * 1000);
      const podUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/pod/${linkToken}`;

      const pod = await prisma.proofOfDelivery.create({
        data: {
          sessionId,
          linkToken,
          linkExpiresAt,
          status: 'PENDING',
          lineItems: {
            create: session.purchaseOrder.lineItems.map((li) => ({
              lineItemId: li.id,
              deliveredBoxes: li.loadedBoxes,
            })),
          },
        },
      });

      // Send notification to client
      await notifQueue.add('send', {
        channel: 'SMS',
        recipientPhone: session.purchaseOrder.client.phone,
        type: 'POD_DISPATCH',
        variables: {
          poNumber: session.purchaseOrder.poNumber,
          podUrl,
          vehicleReg: session.vehicle.registrationNumber,
          driverName: session.vehicle.driverName,
          driverPhone: session.vehicle.driverPhone,
        },
      });

      console.log(`[PODWorker] POD created: ${pod.id}, link: ${podUrl}`);
    },
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[PODWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
