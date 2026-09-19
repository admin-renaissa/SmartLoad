import type { ConnectClient } from './types.js';

/** Standalone apps never apply sibling sync. */
export async function isPairApplyAllowed(
  client: ConnectClient,
  input: {
    mode?: string;
    orgId: string;
    sourceApp: string;
    targetApp: string;
    eventType?: string;
  },
): Promise<boolean> {
  if (String(input.mode || process.env.RENVERSE_MODE || '').toLowerCase() !== 'suite') {
    return false;
  }
  const result = await client.pairEnabled({
    orgId: input.orgId,
    sourceApp: input.sourceApp,
    targetApp: input.targetApp,
    eventType: input.eventType,
  });
  return result.enabled;
}
