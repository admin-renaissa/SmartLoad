import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import { QUEUES } from '@smartload/shared';

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      inventoryDeduction: Queue;
      tallySync: Queue;
      podCreation: Queue;
      notifications: Queue;
    };
  }
}

const connection = () => ({
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
});

const bullmqPluginImpl: FastifyPluginAsync = async (fastify) => {
  const conn = connection();
  const inventoryDeduction = new Queue(QUEUES.INVENTORY_DEDUCTION, { connection: conn });
  const tallySync = new Queue(QUEUES.TALLY_SYNC, { connection: conn });
  const podCreation = new Queue(QUEUES.POD_CREATION, { connection: conn });
  const notifications = new Queue(QUEUES.NOTIFICATIONS, { connection: conn });

  fastify.decorate('queues', {
    inventoryDeduction,
    tallySync,
    podCreation,
    notifications,
  });

  fastify.addHook('onClose', async () => {
    await Promise.all([
      inventoryDeduction.close(),
      tallySync.close(),
      podCreation.close(),
      notifications.close(),
    ]);
  });
};

export const bullmqPlugin = fp(bullmqPluginImpl, { name: 'bullmq' });
