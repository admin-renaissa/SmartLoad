import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { HalService } from '../hal/hal.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    hal: HalService;
  }
}

const halPluginImpl: FastifyPluginAsync = async (fastify) => {
  const hal = new HalService(fastify);
  await hal.loadDriverFromConfig();
  fastify.decorate('hal', hal);
};

export const halPlugin = fp(halPluginImpl, {
  name: 'hal',
  dependencies: ['prisma'],
});
