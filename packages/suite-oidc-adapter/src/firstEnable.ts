import type { AccessTokenClaims, AppKey, Session } from '@renverse/auth-sdk';
import { createConnectClient } from '@renverse/connect-sdk';
import { NeedsMappingError } from './mappingStudio.js';

export type JitResult = {
  localUserId: string;
  localTenantId: string;
  suiteRole?: string;
};

const identityBase =
  process.env.RENVERSE_OIDC_ISSUER || 'http://localhost:9100';
const connectBase =
  process.env.RENVERSE_CONNECT_URL || 'http://localhost:9110';
const connectToken =
  process.env.CONNECT_SERVICE_TOKEN || 'dev-connect-token';

/**
 * Missing AppLink is no longer a silent create. Callers redirect to
 * Accounts Mapping Studio. `createLocalTenant` is unused here.
 */
export async function runFirstEnable(opts: {
  appKey: AppKey;
  claims: AccessTokenClaims;
  session: Session;
  jit: JitResult;
  /** @deprecated Ignored. Local tenants are created only from Mapping Studio. */
  createLocalTenant?: (orgId: string) => string | Promise<string>;
}): Promise<JitResult> {
  const orgId = opts.claims.org_id;
  const authHeader = { authorization: `Bearer ${opts.session.accessToken}` };

  const linkRes = await fetch(
    `${identityBase}/v1/orgs/${orgId}/applinks/${opts.appKey}`,
    { headers: authHeader },
  );

  if (linkRes.status === 404) {
    throw new NeedsMappingError(orgId, opts.appKey);
  }
  if (!linkRes.ok) {
    throw new Error(`applink get failed: ${linkRes.status}`);
  }
  const existing = (await linkRes.json()) as { externalTenantId: string };
  const externalTenantId = existing.externalTenantId;

  const connect = createConnectClient({
    baseUrl: connectBase,
    serviceToken: connectToken,
  });

  await connect.putIdMap({
    orgId,
    entityType: 'user',
    sourceApp: 'identity',
    sourceId: opts.claims.sub,
    targetApp: opts.appKey,
    targetId: opts.jit.localUserId,
  });
  await connect.putIdMap({
    orgId,
    entityType: 'tenant',
    sourceApp: 'identity',
    sourceId: orgId,
    targetApp: opts.appKey,
    targetId: externalTenantId,
  });

  return {
    ...opts.jit,
    localTenantId: externalTenantId,
  };
}
