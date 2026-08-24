/**
 * Emit smartload.pod.confirmed.v1 when Connect emit flag is on.
 * Used by product POD acknowledge + smoke POST /renverse/shipments/:id/pod.
 *
 * Connect outages must not break POD CRUD — failures return skipped.
 * Tally bridge stays on-prem: SMARTLOAD_TALLY_MODE=onprem (default).
 */
export type PodConfirmedPayload = {
  shipmentId: string;
  orgId: string;
  podId?: string;
  skuLines?: Array<{ sku: string; qty: number }>;
  valuationHint?: number;
  confirmedAt?: string;
  /** Optional outbox writer for atomic/idempotent local record */
  writeOutbox?: (row: {
    eventId: string;
    type: string;
    orgId: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
};

export async function emitPodConfirmed(
  payload: PodConfirmedPayload,
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

  const connectUrl =
    process.env.RENVERSE_CONNECT_URL || 'http://localhost:9110';
  const token = process.env.CONNECT_SERVICE_TOKEN || 'dev-connect-token';
  const eventPayload = {
    shipmentId: payload.shipmentId,
    confirmedAt: payload.confirmedAt || new Date().toISOString(),
    podId: payload.podId || `pod_${payload.shipmentId}`,
    skuLines: payload.skuLines || [{ sku: 'SKU-1', qty: 1 }],
    valuationHint: Number(payload.valuationHint ?? 100),
  };
  const envelope = createEnvelope({
    type: 'smartload.pod.confirmed.v1',
    source: 'smartload',
    orgId: payload.orgId,
    payload: eventPayload,
  });

  if (payload.writeOutbox) {
    try {
      await payload.writeOutbox({
        eventId: envelope.id,
        type: 'smartload.pod.confirmed.v1',
        orgId: payload.orgId,
        payload: eventPayload,
      });
    } catch {
      // outbox optional — continue to publish attempt
    }
  }

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
