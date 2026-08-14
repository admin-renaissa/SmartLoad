import type { PrismaClient } from '@prisma/client';
import { PODStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { addHours, QUEUES } from '@smartload/shared';

export type ProcessorLogger = (message: string) => Promise<void>;

const connection = () => ({
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
});

interface PodDispatchVariables {
  companyName: string;
  poNumber: string;
  vehicleReg: string;
  driverName: string;
  driverPhone: string;
  podUrl: string;
  clientName: string;
  itemCount: string;
  totalBoxes: string;
}

/**
 * Enqueues SMS, WhatsApp, and optional email for POD link (BullMQ notifications queue).
 */
export async function enqueuePodDispatchNotifications(
  clientPhone: string | null | undefined,
  clientEmail: string | null | undefined,
  variables: PodDispatchVariables,
): Promise<void> {
  const queue = new Queue(QUEUES.NOTIFICATIONS, { connection: connection() });
  try {
    const phone = clientPhone?.trim();
    const email = clientEmail?.trim();
    if (phone) {
      await queue.add('pod-dispatch-sms', {
        channel: 'SMS' as const,
        recipientPhone: phone,
        type: 'POD_DISPATCH',
        variables: variables as unknown as Record<string, string>,
      });
      await queue.add('pod-dispatch-wa', {
        channel: 'WHATSAPP' as const,
        recipientPhone: phone,
        type: 'POD_DISPATCH',
        variables: variables as unknown as Record<string, string>,
      });
    }
    if (email) {
      await queue.add('pod-dispatch-email', {
        channel: 'EMAIL' as const,
        recipientEmail: email,
        type: 'POD_DISPATCH',
        variables: variables as unknown as Record<string, string>,
      });
    }
  } finally {
    await queue.close();
  }
}

/**
 * Creates proof-of-delivery rows and enqueues client notifications via BullMQ.
 */
export async function runPodCreationForSession(
  prisma: PrismaClient,
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
  const vehicle = session.vehicle;

  const cfgCompany = process.env.COMPANY_NAME ?? 'SmartLoad';

  const variables: PodDispatchVariables = {
    companyName: cfgCompany,
    poNumber: session.purchaseOrder.poNumber,
    vehicleReg: vehicle.registrationNumber,
    driverName: vehicle.driverName ?? '',
    driverPhone: vehicle.driverPhone ?? '',
    podUrl,
    clientName: client.name,
    itemCount: String(session.purchaseOrder.lineItems.filter((li) => li.loadedBoxes > 0).length),
    totalBoxes: String(session.totalBoxesScanned),
  };

  await enqueuePodDispatchNotifications(client.phone, client.email, variables);

  await log(`POD created: ${pod.id}, link: ${podUrl}`);
  return { podId: pod.id, podUrl };
}
