/**
 * Product URLs for SmartLoad ↔ RenBooks POD E2E (suite GA).
 *
 * SmartLoad (product API, default :4000):
 *   POST /api/v1/pod/:id/acknowledge   — customer ack → emit smartload.pod.confirmed.v1
 *   POST /renverse/shipments/:id/pod   — smoke alias (same emit helper)
 *   GET  /renverse/status
 *
 * RenBooks (product, when nested under RenVerse):
 *   Consume loop in server/src/renverse/connect-consume.ts (smartload.pod.confirmed.v1)
 *
 * Env:
 *   RENVERSE_MODE=suite
 *   RENVERSE_CONNECT_URL=http://localhost:9110
 *   RENVERSE_FLAGS=renverse.connect.emit=true,renverse.connect.consume=true
 *   Apply migrations: pnpm db:migrate:deploy && pnpm db:backfill-org
 */
export const SMARTLOAD_POD_E2E = {
  acknowledgePath: '/api/v1/pod/:id/acknowledge',
  smokeEmitPath: '/renverse/shipments/:id/pod',
  eventType: 'smartload.pod.confirmed.v1',
} as const;
