/**
 * RenVerse suite join scaffolding for SmartLoad (appKey: smartload, entitlement: addon).
 * Mirrors apps/suite-host-smartload.
 *
 * SMARTLOAD_TALLY_MODE=onprem (default) — Tally bridge stays on-prem; this API
 * does not embed a cloud Tally engine.
 */
import type { FastifyPluginAsync } from 'fastify';
import { emitPodConfirmed } from './emit-pod-confirmed.js';

type AccessTokenClaims = {
  sub: string;
  org_id: string;
  roles?: string[];
};

const jitStore = new Map<
  string,
  { localUserId: string; localTenantId: string; orgId: string }
>();
const sites = new Map<string, { orgId: string; siteId: string; name: string }>();

const tallyMode = () => process.env.SMARTLOAD_TALLY_MODE || 'onprem';

export const renverseRoutes: FastifyPluginAsync = async (fastify) => {
  process.env.RENVERSE_APP_KEY = process.env.RENVERSE_APP_KEY || 'smartload';
  const mode = process.env.RENVERSE_MODE || 'standalone';

  let pkgs: {
    createSuiteOidcRouter: (opts: any) => any;
    runFirstEnable: (opts: any) => Promise<any>;
    isFlagEnabled: (n: string) => boolean;
  } | null = null;

  try {
    const adapter = await import('@renverse/suite-oidc-adapter');
    const auth = await import('@renverse/auth-sdk');
    pkgs = {
      createSuiteOidcRouter: adapter.createSuiteOidcRouter,
      runFirstEnable: adapter.runFirstEnable,
      isFlagEnabled: auth.isFlagEnabled,
    };
  } catch (e) {
    fastify.log.warn(
      { err: e },
      '[renverse] @renverse packages unavailable — status-only mode',
    );
  }

  fastify.get('/renverse/status', async (_req, reply) => {
    return reply.send({
      ok: true,
      mode,
      appKey: 'smartload',
      suiteRole: 'addon',
      entitlement: 'addon',
      oidc: mode === 'suite' && Boolean(pkgs),
      packagesLoaded: Boolean(pkgs),
      contractsVersion: process.env.RENVERSE_CONTRACTS_VERSION || '1.0.0',
      tallyMode: tallyMode(),
      tallyNote:
        'SMARTLOAD_TALLY_MODE=onprem — Tally bridge stays on-prem (not cloud)',
      connectEmit: pkgs
        ? pkgs.isFlagEnabled('renverse.connect.emit')
        : Boolean(process.env.RENVERSE_CONNECT_URL),
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/renverse/site', async (req, reply) => {
    const orgId =
      (req.query as { orgId?: string }).orgId ||
      (req.headers['x-renverse-org-id'] as string | undefined);
    if (!orgId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const site =
      sites.get(orgId) ||
      ({
        orgId,
        siteId: `site_${orgId}`,
        name: `SmartLoad site ${orgId}`,
      } as const);
    return reply.send({ ...site, tallyMode: tallyMode() });
  });

  fastify.post<{ Params: { id: string } }>(
    '/renverse/shipments/:id/pod',
    async (req, reply) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await emitPodConfirmed({
        shipmentId: String(req.params.id),
        orgId: String(body.orgId || 'org_demo00000001'),
        podId: body.podId ? String(body.podId) : undefined,
        skuLines: body.skuLines as Array<{ sku: string; qty: number }> | undefined,
        valuationHint:
          body.valuationHint !== undefined
            ? Number(body.valuationHint)
            : undefined,
      });
      return reply.send(result);
    },
  );

  if (mode !== 'suite' || !pkgs) {
    return;
  }

  // Mount Express suite OIDC router via @fastify/middie
  const middie = (await import('@fastify/middie')).default;
  await fastify.register(middie);

  const port = process.env.PORT || '4000';
  const oidcConfig = {
    issuer: process.env.RENVERSE_OIDC_ISSUER || 'http://localhost:9100',
    clientId: process.env.RENVERSE_OIDC_CLIENT_ID || 'app_smartload_web',
    redirectUri:
      process.env.RENVERSE_OIDC_REDIRECT_URI ||
      `http://localhost:${port}/auth/callback`,
    appKey: 'smartload' as const,
    entitlement: 'addon' as const,
  };

  const expressRouter = pkgs.createSuiteOidcRouter({
    config: oidcConfig,
    async onJit(claims: AccessTokenClaims) {
      const key = `${claims.org_id}:${claims.sub}`;
      const existing = jitStore.get(key);
      if (existing) {
        return {
          localUserId: existing.localUserId,
          localTenantId: existing.localTenantId,
          suiteRole: claims.roles?.[0],
        };
      }
      const siteId = `site_${claims.org_id}`;
      sites.set(claims.org_id, {
        orgId: claims.org_id,
        siteId,
        name: `SmartLoad site ${claims.org_id}`,
      });
      return {
        localUserId: `local_${claims.sub}`,
        localTenantId: siteId,
        suiteRole: claims.roles?.[0],
      };
    },
    async onFirstEnable(claims: AccessTokenClaims, jit: any, session: any) {
      const result = await pkgs!.runFirstEnable({
        appKey: 'smartload',
        claims,
        session,
        jit,
        createLocalTenant: (orgId: string) => `site_${orgId}`,
      });
      jitStore.set(`${claims.org_id}:${claims.sub}`, {
        localUserId: result.localUserId,
        localTenantId: result.localTenantId,
        orgId: claims.org_id,
      });
      return result;
    },
    async onSession(_req: any, res: any, session: any, jit: any) {
      res.cookie('smartload_suite_sub', session.claims.sub, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      res.cookie('smartload_local_user', jit.localUserId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      res.cookie('smartload_local_tenant', jit.localTenantId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      res.cookie('smartload_org_id', session.claims.org_id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    },
  });

  // cookie-parser for OIDC cookies on Express middleware path
  const cookieParser = (await import('cookie-parser')).default;
  (fastify as any).use(cookieParser());
  (fastify as any).use(expressRouter);

  fastify.log.info(
    `[renverse] SmartLoad suite OIDC mounted (tally=${tallyMode()}, entitlement=addon)`,
  );
};
