/**
 * Org pair gate — skip sibling emit/consume unless the org pair is enabled.
 * Standalone never applies sibling sync.
 *
 * Prefers `@renverse/connect-sdk` `isPairApplyAllowed` when a Connect client
 * is provided; otherwise probes Connect `/v1/sync-pairs/enabled`.
 */

export type PairDecision = {
  enabled: boolean;
  policy: 'off' | 'manual' | 'auto';
};

type ConnectClientLike = {
  pairEnabled: (input: {
    orgId: string;
    sourceApp: string;
    targetApp: string;
    eventType?: string;
  }) => Promise<{ enabled: boolean; items: unknown[] }>;
};

type PairEnabledBody = {
  enabled?: boolean;
  items?: Array<{ policy?: string }>;
};

export type PairGateInput = {
  mode?: string;
  orgId: string;
  sourceApp: string;
  targetApp: string;
  eventType?: string;
  client?: ConnectClientLike;
  connectUrl?: string;
  serviceToken?: string;
  fetchImpl?: typeof fetch;
};

function isSuiteMode(mode?: string): boolean {
  return String(mode || process.env.RENVERSE_MODE || '').toLowerCase() === 'suite';
}

export async function fetchPairDecision(input: PairGateInput): Promise<PairDecision> {
  if (!isSuiteMode(input.mode)) {
    return { enabled: false, policy: 'off' };
  }
  if (input.client) {
    try {
      const { isPairApplyAllowed: sdkPair } = await import('@renverse/connect-sdk');
      const enabled = await sdkPair(input.client, input);
      return { enabled, policy: enabled ? 'manual' : 'off' };
    } catch {
      return { enabled: false, policy: 'off' };
    }
  }
  const base = String(
    input.connectUrl || process.env.RENVERSE_CONNECT_URL || '',
  ).replace(/\/$/, '');
  if (!base || !input.orgId) return { enabled: false, policy: 'off' };
  const token =
    input.serviceToken ||
    process.env.CONNECT_SERVICE_TOKEN ||
    process.env.RENVERSE_CONNECT_TOKEN ||
    'dev-connect-token';
  const url = new URL(`${base}/v1/sync-pairs/enabled`);
  url.searchParams.set('orgId', input.orgId);
  url.searchParams.set('sourceApp', input.sourceApp);
  url.searchParams.set('targetApp', input.targetApp);
  if (input.eventType) url.searchParams.set('eventType', input.eventType);
  try {
    const fetchFn = input.fetchImpl || fetch;
    const res = await fetchFn(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { enabled: false, policy: 'off' };
    const body = (await res.json()) as PairEnabledBody;
    const policy = String(body.items?.[0]?.policy || 'manual');
    const normalized =
      policy === 'auto' || policy === 'off' || policy === 'manual' ? policy : 'manual';
    return { enabled: Boolean(body.enabled), policy: normalized };
  } catch {
    return { enabled: false, policy: 'off' };
  }
}

export async function isPairApplyAllowed(input: PairGateInput): Promise<boolean> {
  const decision = await fetchPairDecision(input);
  return decision.enabled;
}
