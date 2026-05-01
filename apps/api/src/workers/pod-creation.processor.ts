import type { PrismaClient } from '@prisma/client';
import { PODStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addHours } from '@smartload/shared';

export type ProcessorLogger = (message: string) => Promise<void>;

export type NotificationRedis = {
  lpush: (key: string, value: string) => Promise<number>;
};

/**
 * Creates proof-of-delivery rows and enqueues client notification (real Redis list).
 */
export async function runPodCreationForSession(
  prisma: PrismaClient,
  redis: NotificationRedis,
  sessionId: string,
  log: ProcessorLogger,
): Promise<{ skipped?: boolean; podId?: string; podUrl?: string }> {
  await log(`Creating POD for session ${sessionId}`);

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
    await log('POD already created — skipping');
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

  await redis.lpush(
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

  await log(`POD created: ${pod.id}, link: ${podUrl}`);
  return { podId: pod.id, podUrl };
}
