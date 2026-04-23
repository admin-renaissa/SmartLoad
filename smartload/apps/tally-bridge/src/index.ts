import { createBridgeApp } from './bridge-api.js';

const PORT = Number(process.env.BRIDGE_PORT) || 7474;

async function start() {
  const app = await createBridgeApp();
  await app.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`🔗 SmartLoad Tally Bridge running on port ${PORT}`);
  console.log('📡 Connecting to Tally at', process.env.TALLY_URL || 'http://localhost:9000');
}

start().catch((err) => {
  console.error('Failed to start Tally Bridge:', err);
  process.exit(1);
});
