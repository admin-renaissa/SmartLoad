import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPluginImpl: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, 'Redis error');
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async (server) => {
    await server.redis.quit();
  });
};

export const redisPlugin = fp(redisPluginImpl, {
  name: 'redis',
});
