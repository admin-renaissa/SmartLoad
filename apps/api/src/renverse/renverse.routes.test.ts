/**
 * Run: pnpm --filter @smartload/api exec tsx --test src/renverse/renverse.routes.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { renverseRoutes } from './renverse.routes.js';

async function withMode<T>(mode: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.RENVERSE_MODE;
  process.env.RENVERSE_MODE = mode;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.RENVERSE_MODE;
    else process.env.RENVERSE_MODE = prev;
  }
}

test('GET /renverse/peer/v1/:type/:id standalone 404', async () => {
  await withMode('standalone', async () => {
    const app = Fastify({ logger: false });
    await app.register(renverseRoutes);
    const res = await app.inject({
      method: 'GET',
      url: '/renverse/peer/v1/shipment/ship_1',
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error, 'standalone');
    await app.close();
  });
});

test('GET /renverse/peer/v1/:type/:id suite unauth 401', async () => {
  await withMode('suite', async () => {
    const app = Fastify({ logger: false });
    await app.register(renverseRoutes);
    const res = await app.inject({
      method: 'GET',
      url: '/renverse/peer/v1/shipment/ship_1',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'unauthorized');
    await app.close();
  });
});

test('POST /renverse/leads/capture standalone skips emit', async () => {
  await withMode('standalone', async () => {
    const app = Fastify({ logger: false });
    await app.register(renverseRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/renverse/leads/capture',
      payload: {
        orgId: 'org_demo00000001',
        sourceId: 'src_1',
        email: 'ops@example.com',
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.skipped, true);
    await app.close();
  });
});
