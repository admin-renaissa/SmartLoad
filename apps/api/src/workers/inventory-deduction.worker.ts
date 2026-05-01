import { Worker, type Job } from 'bullmq';
import { PrismaClient, ScanResult, MovementType } from '@prisma/client';
import Redis from 'ioredis';
import { QUEUES } from '@smartload/shared';

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
    await job.log(`Starting inventory deduction for session ${sessionId}`);

    const session = await prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: { purchaseOrder: true },
    });
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.inventoryDeducted) {
      await job.log('Inventory already deducted — skipping');
      return { skipped: true };
    }

    const successEvents = await prisma.scanEvent.findMany({
      where: { sessionId, result: ScanResult.SUCCESS },
    });

    const variantBoxCount = new Map<string, number>();
    for (const event of successEvents) {
      if (!event.resolvedVariantId) continue;
      variantBoxCount.set(
        event.resolvedVariantId,
        (variantBoxCount.get(event.resolvedVariantId) ?? 0) + 1,
      );
    }

    if (variantBoxCount.size === 0) {
      await job.log('No successful scans found — nothing to deduct');
      await prisma.dispatchSession.update({
        where: { id: sessionId },
        data: { inventoryDeducted: true },
      });
      return { deducted: 0 };
    }

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...variantBoxCount.keys()] } },
      include: { product: true, inventoryStock: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const variant of variants) {
        const boxesDeducted = variantBoxCount.get(variant.id) ?? 0;
        if (boxesDeducted === 0) continue;

        const piecesDeducted = boxesDeducted * variant.product.piecesPerBox;

        const stock = await tx.inventoryStock.findUnique({ where: { variantId: variant.id } });
        if (!stock) {
          await job.log(`No inventory_stock row for variant ${variant.id} — skipping stock update`);
        } else {
          await tx.inventoryStock.update({
            where: { variantId: variant.id },
            data: {
              totalBoxes: { decrement: boxesDeducted },
              reservedBoxes: { decrement: Math.min(boxesDeducted, stock.reservedBoxes) },
            },
          });
        }

        await tx.inventoryLedger.create({
          data: {
            variantId: variant.id,
            movementType: MovementType.OUTWARD,
            boxes: boxesDeducted,
            pieces: piecesDeducted,
            referenceType: 'DISPATCH_SESSION',
            referenceId: sessionId,
            notes: `Dispatch session ${session.sessionCode} — PO ${session.purchaseOrder.poNumber}`,
            createdById: session.supervisorId,
          },
        });

        await job.log(`Deducted ${boxesDeducted} boxes of variant ${variant.id}`);
      }

      await tx.dispatchSession.update({
        where: { id: sessionId },
        data: { inventoryDeducted: true },
      });
    });

    const updatedStocks = await prisma.inventoryStock.findMany({
      where: { variantId: { in: [...variantBoxCount.keys()] } },
      include: { variant: { include: { product: true } } },
    });

    for (const stock of updatedStocks) {
      const availableBoxes = stock.totalBoxes - stock.reservedBoxes;
      if (availableBoxes <= stock.variant.product.minStockAlert && availableBoxes >= 0) {
        await redisConnection.lpush(
          'low-stock-alerts',
          JSON.stringify({
            variantId: stock.variantId,
            productName: stock.variant.product.name,
            colourName: stock.variant.colourName,
            availableBoxes,
            minAlert: stock.variant.product.minStockAlert,
          }),
        );
        await job.log(`Low stock alert queued for variant ${stock.variantId}`);
      }
    }

    await job.log(`Inventory deduction complete: ${variantBoxCount.size} variants processed`);
    return { deducted: variantBoxCount.size };
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
