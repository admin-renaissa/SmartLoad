// Load .env from monorepo root before anything else
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { prismaPlugin } from './plugins/prisma.js';
import { redisPlugin } from './plugins/redis.js';
import { authPlugin } from './plugins/auth.js';
import { auditPlugin } from './plugins/audit.js';
import { bullmqPlugin } from './plugins/bullmq.js';
import { errorHandler } from './middleware/error-handler.js';
import { socketPlugin } from './plugins/socket.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { productRoutes } from './modules/products/product.routes.js';
import { productVariantRoutes } from './modules/products/product-variant.routes.js';
import { clientRoutes } from './modules/clients/client.routes.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { sessionRoutes } from './modules/dispatch/session.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { grnRoutes } from './modules/inventory/grn.routes.js';
import { vehicleRoutes } from './modules/vehicles/vehicle.routes.js';
import { podRoutes } from './modules/pod/pod.routes.js';
import { tallyRoutes } from './modules/tally/tally.routes.js';
import { integrationsRoutes } from './modules/integrations/integrations.routes.js';
import { reportRoutes } from './modules/reports/report.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { auditLogRoutes } from './modules/audit/audit.routes.js';

const isDev = process.env.NODE_ENV !== 'production';

export async function buildServer() {
  const app = Fastify({
    logger: isDev
      ? { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } }
      : { level: 'info' },
  });

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: process.env.APP_BASE_URL || true,
    credentials: true,
  });

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'change-me-jwt-secret',
    sign: { expiresIn: '15m' },
  });

  // File uploads
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Rate limiting
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: '1 minute',
  });

  // Custom plugins
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(auditPlugin);
  await app.register(bullmqPlugin);
  await app.register(socketPlugin);

  // Error handler
  app.setErrorHandler(errorHandler);

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

  // API routes under /api/v1
  const apiPrefix = '/api/v1';
  await app.register(authRoutes, { prefix: `${apiPrefix}/auth` });
  await app.register(userRoutes, { prefix: `${apiPrefix}/users` });
  await app.register(productRoutes, { prefix: `${apiPrefix}/products` });
  await app.register(productVariantRoutes, { prefix: `${apiPrefix}` });
  await app.register(clientRoutes, { prefix: `${apiPrefix}/clients` });
  await app.register(orderRoutes, { prefix: `${apiPrefix}/orders` });
  await app.register(sessionRoutes, { prefix: `${apiPrefix}/sessions` });
  await app.register(inventoryRoutes, { prefix: `${apiPrefix}/inventory` });
  await app.register(grnRoutes, { prefix: `${apiPrefix}/grn` });
  await app.register(vehicleRoutes, { prefix: `${apiPrefix}/vehicles` });
  await app.register(podRoutes, { prefix: `${apiPrefix}/pod` });
  await app.register(tallyRoutes, { prefix: `${apiPrefix}/tally` });
  await app.register(integrationsRoutes, { prefix: `${apiPrefix}/integrations` });
  await app.register(reportRoutes, { prefix: `${apiPrefix}/reports` });
  await app.register(dashboardRoutes, { prefix: `${apiPrefix}/dashboard` });
  await app.register(settingsRoutes, { prefix: `${apiPrefix}/settings` });
  await app.register(auditLogRoutes, { prefix: `${apiPrefix}/audit-logs` });

  return app;
}

async function start() {
  try {
    const app = await buildServer();
    const port = Number(process.env.PORT) || 4000;
    const host = process.env.HOST || '0.0.0.0';
    await app.listen({ port, host });
    console.log(`🚀 SmartLoad API running on http://${host}:${port}`);
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

start();
