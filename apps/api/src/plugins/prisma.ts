import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
// Use workspace path so typings always come from `prisma generate` output (incl. `scannerDevice`).
// The `@prisma/client` package symlink alone can diverge from that output in some installs.
import { PrismaClient } from '@smartload/prisma-client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPluginImpl: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
};

export const prismaPlugin = fp(prismaPluginImpl, {
  name: 'prisma',
});
