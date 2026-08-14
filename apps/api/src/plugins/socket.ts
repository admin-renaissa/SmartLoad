import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { registerScanGateway } from '../modules/dispatch/scan.gateway.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketServer;
  }
}

const socketPluginImpl: FastifyPluginAsync = async (fastify) => {
  const io = new SocketServer(fastify.server, {
    cors: {
      origin: process.env.APP_BASE_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  fastify.decorate('io', io);

  registerScanGateway(fastify);

  fastify.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
};

export const socketPlugin = fp(socketPluginImpl, {
  name: 'socket',
  dependencies: ['@fastify/jwt', 'hal'],
});
