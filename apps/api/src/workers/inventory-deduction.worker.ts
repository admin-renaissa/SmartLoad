import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUES } from '@smartload/shared';

const prisma = new PrismaClient();
const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

export function startInventoryWorker() {
  const worker = new Worker(
    QUEUES.INVENTORY_DEDUCTION,
    async (job: Job<{ sessionId: string }>) => {
      const { sessionId } = job.data;
      console.log(`[InventoryWorker] Processing deduction for session: ${sessionId}`);

      const scanEvents = await prisma.scanEvent.findMany({
        where: { sessionId, result: 'SUCCESS' },
        include: { resolvedVariant: { include: { product: true } } },
      });

      // Group by variantId
      const byVariant = new Map<string, { boxes: number; piecesPerBox: number }>();
      for (const event of scanEvents) {
        if (!event.resolvedVariantId || !event.resolvedVariant) continue;
        const existing = byVariant.get(event.resolvedVariantId);
        const piecesPerBox = event.resolvedVariant.product.piecesPerBox;
        if (existing) {
          existing.boxes += 1;
        } else {
          byVariant.set(event.resolvedVariantId, { boxes: 1, piecesPerBox });
        }
      }

      const systemUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

      for (const [variantId, { boxes, piecesPerBox }] of byVariant.entries()) {
        await prisma.$transaction([
          prisma.inventoryStock.update({
            where: { variantId },
            data: {
              totalBoxes: { decrement: boxes },
              reservedBoxes: { decrement: boxes },
            },
          }),
          prisma.inventoryLedger.create({
            data: {
              variantId,
              movementType: 'OUTWARD',
              boxes,
              pieces: boxes * piecesPerBox,
              referenceType: 'DISPATCH_SESSION',
              referenceId: sessionId,
              notes: `Auto-deducted on session close: ${sessionId}`,
              createdById: systemUser!.id,
            },
          }),
        ]);

        // Check low stock
        const stock = await prisma.inventoryStock.findUnique({
          where: { variantId },
          include: { variant: { include: { product: true } } },
        });

        if (stock && stock.totalBoxes <= stock.variant.product.minStockAlert) {
          console.log(`[InventoryWorker] Low stock alert: ${variantId} — ${stock.totalBoxes} boxes remaining`);
          // Low stock notification would be queued here
        }
      }

      console.log(`[InventoryWorker] Deduction complete for session: ${sessionId}`);
    },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job) => {
    console.log(`[InventoryWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[InventoryWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
