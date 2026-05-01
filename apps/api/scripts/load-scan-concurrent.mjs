#!/usr/bin/env node
/**
 * Concurrent scan load against a running API (real HTTP).
 *
 * Prerequisites: API running, valid JWT, OPEN session id, barcode matching your catalog.
 *
 *   cd apps/api && \
 *   ACCESS_TOKEN="$(jq -r .accessToken <<<"$LOGIN_JSON")" \
 *   SESSION_ID=cuid BARCODE='your-barcode' \
 *   CONCURRENCY=20 TOTAL=100 \
 *   node scripts/load-scan-concurrent.mjs
 *
 * Env:
 *   API_URL          default http://localhost:4000
 *   ACCESS_TOKEN     Bearer JWT (required)
 *   SESSION_ID       dispatch session id (required)
 *   BARCODE          rawBarcode body (required)
 *   CONCURRENCY      parallel workers (default 10)
 *   TOTAL            total requests (default 50)
 */

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN = process.env.ACCESS_TOKEN;
const SESSION_ID = process.env.SESSION_ID;
const BARCODE = process.env.BARCODE;
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 10);
const TOTAL = Math.max(1, Number(process.env.TOTAL) || 50);

if (!TOKEN || !SESSION_ID || !BARCODE) {
  console.error('Missing ACCESS_TOKEN, SESSION_ID, or BARCODE');
  process.exit(1);
}

const url = `${API_URL}/api/v1/sessions/${SESSION_ID}/scan`;

async function one(i) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rawBarcode: BARCODE, deviceId: 'hid-keyboard' }),
  });
  const ms = Math.round(performance.now() - t0);
  const ok = res.ok;
  return { i, ok, status: res.status, ms };
}

let idx = 0;
const latencies = [];

async function worker() {
  while (true) {
    const my = idx++;
    if (my >= TOTAL) break;
    const r = await one(my);
    latencies.push(r.ms);
    if (!r.ok) {
      console.error(`FAIL #${my} ${r.status} ${r.ms}ms`);
    }
  }
}

const tStart = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const wallMs = Math.round(performance.now() - tStart);

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

console.log(JSON.stringify({
  url,
  total: TOTAL,
  concurrency: CONCURRENCY,
  wallMs,
  latencyMs: { min: latencies[0], p50, p95, max: latencies[latencies.length - 1] },
}, null, 2));
