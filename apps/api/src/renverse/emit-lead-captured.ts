/**
 * Emit smartload.lead.captured.v1 when the smartload→renovax pair is enabled.
 * Connect outages must not break product APIs — failures return skipped.
 */
import { isPairApplyAllowed, type PairGateInput } from './pair-gate.js';

export type LeadCapturedPayload = {
  orgId: string;
  sourceId: string;
  email: string;
  name?: string;
  company?: string;
  consent?: boolean;
  attrs?: Record<string, unknown>;
  capturedAt?: string;
  idempotencyKey?: string;
  writeOutbox?: (row: {
    eventId: string;
    type: string;
    orgId: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
  checkPair?: (input: PairGateInput) => Promise<boolean>;
};

export async function emitLeadCaptured(
  payload: LeadCapturedPayload,
): Promise<{
  ok: true;
  skipped?: boolean;
  reason?: string;
  eventId?: string;
  published?: unknown;
  mode?: string;
}> {
  const mode = process.env.RENVERSE_MODE || 'standalone';
  let isFlagEnabled: (n: string) => boolean = () =>
    Boolean(process.env.RENVERSE_CONNECT_URL);
  let createEnvelope: (d: any) => any;
  let createConnectClient: (o: any) => { publish: (e: any) => Promise<any> };

  try {
    const auth = await import('@renverse/auth-sdk');
    const connect = await import('@renverse/connect-sdk');
    isFlagEnabled = auth.isFlagEnabled;
    createEnvelope = connect.createEnvelope;
    createConnectClient = connect.createConnectClient;
  } catch (e) {
    return {
      ok: true,
      skipped: true,
      reason: `packages_missing:${(e as Error).message}`,
    };
  }

  if (!isFlagEnabled('renverse.connect.emit')) {
    return { ok: true, skipped: true, reason: 'flag_off' };
  }

  const pairInput: PairGateInput = {
    mode,
    orgId: payload.orgId,
    sourceApp: 'smartload',
    targetApp: 'renovax',
    eventType: 'smartload.lead.captured.v1',
  };
  const pairOk = payload.checkPair
    ? await payload.checkPair(pairInput)
    : await isPairApplyAllowed(pairInput);
  if (!pairOk) {
    return { ok: true, skipped: true, reason: 'pair_disabled', mode };
  }

  const capturedAt = payload.capturedAt || new Date().toISOString();
  const idempotencyKey =
    payload.idempotencyKey || `lead_${payload.sourceId}_${payload.email}`;
  const eventPayload: Record<string, unknown> = {
    sourceId: payload.sourceId,
    email: payload.email,
    capturedAt,
    idempotencyKey,
  };
  if (payload.name !== undefined) eventPayload.name = payload.name;
  if (payload.company !== undefined) eventPayload.company = payload.company;
  if (payload.consent !== undefined) eventPayload.consent = payload.consent;
  if (payload.attrs !== undefined) eventPayload.attrs = payload.attrs;

  const envelope = createEnvelope({
    type: 'smartload.lead.captured.v1',
    source: 'smartload',
    orgId: payload.orgId,
    payload: eventPayload,
    idempotencyKey,
  });

  if (payload.writeOutbox) {
    try {
      await payload.writeOutbox({
        eventId: envelope.id,
        type: 'smartload.lead.captured.v1',
        orgId: payload.orgId,
        payload: eventPayload,
      });
    } catch {
      /* outbox optional */
    }
  }

  const connectUrl =
    process.env.RENVERSE_CONNECT_URL || 'http://localhost:9110';
  const token = process.env.CONNECT_SERVICE_TOKEN || 'dev-connect-token';
  try {
    const client = createConnectClient({
      baseUrl: connectUrl,
      serviceToken: token,
    });
    const published = await client.publish(envelope);
    return { ok: true, eventId: envelope.id, published, mode };
  } catch (e) {
    return {
      ok: true,
      skipped: true,
      reason: `connect_unavailable:${(e as Error).message}`,
      eventId: envelope.id,
      mode,
    };
  }
}
