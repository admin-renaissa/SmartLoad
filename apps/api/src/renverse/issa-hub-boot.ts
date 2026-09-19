import { hasAddon, isFlagEnabled, type AccessTokenClaims } from '@renverse/auth-sdk';
import { createToolHost } from '@renverse/ai-sdk';
import { SMARTLOAD_ISSA_PERSONA } from './issa-tools.js';

export const SMARTLOAD_ISSA_TOOL_IDS = [
  'smartload.shipment.get',
  'smartload.pod.status',
] as const;

export function authorizeSmartloadIssaTool(ctx: {
  claims: AccessTokenClaims & { addons?: string[] };
  arguments: Record<string, unknown>;
}): boolean {
  if (ctx.arguments.deny === true) return false;
  if (!ctx.claims.org_id?.startsWith('org_') || !ctx.claims.sub) return false;
  const addons = (ctx.claims as { addons?: string[] }).addons;
  if (Array.isArray(addons) && addons.length > 0) {
    return hasAddon(ctx.claims, 'smartload');
  }
  return true;
}

export async function registerIssaHubOnBoot(): Promise<{ registered: boolean; reason?: string }> {
  if (!isFlagEnabled('renverse.issa')) {
    return { registered: false, reason: 'flag_off' };
  }

  const hub =
    process.env.RENVERSE_ISSA_HUB_URL ||
    process.env.ISSA_HUB_URL ||
    process.env.RENVERSE_ISSA_URL ||
    '';
  if (!hub.trim()) {
    return { registered: false, reason: 'no_hub_url' };
  }

  const host = createToolHost({
    baseUrl: hub,
    getServiceToken: () => process.env.ISSA_SERVICE_TOKEN || 'dev-issa-token',
    toolTokenSecret: process.env.ISSA_TOOL_TOKEN_SECRET || 'dev-issa-tool-secret',
    issuer: process.env.RENVERSE_ISSA_URL || hub,
  });

  let toolsRegistered = 0;
  for (const toolId of SMARTLOAD_ISSA_TOOL_IDS) {
    try {
      await host.registerTool({
        toolId,
        owningApp: 'smartload',
        httpPath: `/issa/tools/${toolId}`,
        creditClass: 'read',
        active: true,
      });
      toolsRegistered += 1;
    } catch (e) {
      console.warn('[renverse] ISSA tool register failed', toolId, (e as Error).message);
    }
  }

  try {
    await host.registerPersona({
      personaId: SMARTLOAD_ISSA_PERSONA,
      name: 'Ops assistant',
      description: 'SmartLoad ops assistant',
      owningApp: 'smartload',
      allowedTools: [...SMARTLOAD_ISSA_TOOL_IDS],
      visibility: 'suite',
      active: true,
      tier: 'featured',
    });
  } catch (e) {
    console.warn('[renverse] ISSA persona register failed', (e as Error).message);
  }

  if (toolsRegistered > 0) {
    console.log('[renverse] ISSA tools registered with Hub', { tools: toolsRegistered });
    return { registered: true };
  }
  return { registered: false, reason: 'register_failed' };
}
