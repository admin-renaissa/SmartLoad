import { createBridgeApp, setLastPollTime } from './bridge-api.js';
import { pingTally } from './tally-client.js';

const PORT = Number(process.env.BRIDGE_PORT) || 7474;
const POLL_MS = Number(process.env.TALLY_POLL_INTERVAL_MS ?? '60000');

function startTallyPollLoop() {
  if (POLL_MS <= 0) {
    console.log('📳 Tally poll loop disabled (TALLY_POLL_INTERVAL_MS=0)');
    return;
  }

  const tick = () => {
    void (async () => {
      const ok = await pingTally();
      setLastPollTime(new Date().toISOString());
      if (!ok) {
        console.warn(`[Tally Bridge] Poll: Tally not reachable at ${process.env.TALLY_URL || 'http://localhost:9000'}`);
      }
    })();
  };
  tick();
  setInterval(tick, POLL_MS);
}

async function start() {
  const app = await createBridgeApp();
  await app.listen({ port: PORT, host: process.env.BRIDGE_HOST || '127.0.0.1' });
  console.log(`🔗 SmartLoad Tally Bridge running on port ${PORT}`);
  console.log('📡 TallyPrime HTTP at', process.env.TALLY_URL || 'http://localhost:9000');
  startTallyPollLoop();
}

start().catch((err) => {
  console.error('Failed to start Tally Bridge:', err);
  process.exit(1);
});
