import type { AccessTokenClaims, AppKey, Session } from '@renverse/auth-sdk';
import { createConnectClient } from '@renverse/connect-sdk';

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
 * AppLink first-enable + Connect IdMap user/tenant rows.
 * Algorithm: contracts/applink/provisioning.md
 */
export async function runFirstEnable(opts: {
  appKey: AppKey;
  claims: AccessTokenClaims;
  session: Session;
  jit: JitResult;
  createLocalTenant: (orgId: string) => string | Promise<string>;
}): Promise<JitResult> {
  const orgId = opts.claims.org_id;
  const authHeader = { authorization: `Bearer ${opts.session.accessToken}` };

  let linkRes = await fetch(
    `${identityBase}/v1/orgs/${orgId}/applinks/${opts.appKey}`,
    { headers: authHeader },
  );

  let externalTenantId: string;
  if (linkRes.status === 404) {
    externalTenantId = await Promise.resolve(opts.createLocalTenant(orgId));
    const createRes = await fetch(
      `${identityBase}/v1/orgs/${orgId}/applinks/${opts.appKey}`,
      {
        method: 'POST',
        headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ externalTenantId }),
      },
    );
    if (createRes.status === 409) {
      linkRes = await fetch(
        `${identityBase}/v1/orgs/${orgId}/applinks/${opts.appKey}`,
        { headers: authHeader },
      );
      if (!linkRes.ok) {
        throw new Error(`applink conflict then get failed: ${linkRes.status}`);
      }
      const existing = (await linkRes.json()) as {
        externalTenantId: string;
      };
      externalTenantId = existing.externalTenantId;
    } else if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`applink create failed: ${createRes.status} ${text}`);
    }
  } else if (linkRes.ok) {
    const existing = (await linkRes.json()) as { externalTenantId: string };
    externalTenantId = existing.externalTenantId;
  } else {
    throw new Error(`applink get failed: ${linkRes.status}`);
  }

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
