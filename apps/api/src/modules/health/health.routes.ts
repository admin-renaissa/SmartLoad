import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const healthRoutesPlugin: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let database: 'ok' | 'error' = 'ok';
    let redisStatus: 'ok' | 'error' = 'ok';
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    try {
      await app.redis.ping();
    } catch {
      redisStatus = 'error';
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      services: { database, redis: redisStatus },
    };
  });
};

export const healthRoutes = fp(healthRoutesPlugin, {
  name: 'health-routes',
  dependencies: ['prisma', 'redis'],
});
