/**
 * RenVerse suite join for SmartLoad (appKey: smartload, entitlement: addon).
 * Organization + OrgMembership tenancy; hasAddon gates; ISSA tools; POD smoke alias.
 *
 * SMARTLOAD_TALLY_MODE=onprem (default) — Tally bridge stays on-prem.
 */
import type { FastifyPluginAsync } from 'fastify';
import { emitPodConfirmed } from './emit-pod-confirmed.js';
import {
  createMemoryTenancyStore,
  createPrismaTenancyStore,
  ensureOrgAndMembership,
  assertSameOrg,
  siteIdForOrg,
  type TenancyStore,
} from './tenancy.js';
import {
  requireSmartloadAddon,
  isSuiteMode,
  ADDON_NOT_ENABLED,
} from './addon-gate.js';
import {
  createSmartloadIssaHandlers,
  SMARTLOAD_ISSA_PERSONA,
} from './issa-tools.js';
import { ensureCutoverColumn, isOrgCutover } from './suite-cutover.js';
import {
  clearRenverseLinkCookie,
  linkRenverseIdentityToUser,
  readRenverseLinkUserId,
  setRenverseLinkCookie,
} from './suite-link.js';
import {
  applyConsumeEnvelope,
  consumePendingEvents,
  isConnectServiceAuthorized,
  startConsumeLoop,
} from './connect-consume.js';

type AccessTokenClaims = {
  sub: string;
  org_id: string;
  roles?: string[];
  apps?: string[];
  addons?: string[];
  email?: string;
  name?: string;
};

const memoryStore = createMemoryTenancyStore();

function readCookie(
  req: { headers: { cookie?: string }; cookies?: Record<string, string> },
  name: string,
): string | undefined {
  if (req.cookies?.[name]) return req.cookies[name];
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function prismaTenancyStore(prisma: any): TenancyStore {
  return createPrismaTenancyStore(prisma);
}

async function resolveStore(fastify: any): Promise<TenancyStore> {
  try {
    if (fastify.prisma?.organization) {
      return prismaTenancyStore(fastify.prisma);
    }
  } catch {
    /* fall through */
  }
  return memoryStore;
}

export const renverseRoutes: FastifyPluginAsync = async (fastify) => {
  process.env.RENVERSE_APP_KEY = process.env.RENVERSE_APP_KEY || 'smartload';
  const mode = process.env.RENVERSE_MODE || 'standalone';
  const tallyMode = () => process.env.SMARTLOAD_TALLY_MODE || 'onprem';

  try {
    if ((fastify as any).prisma) {
      await ensureCutoverColumn((fastify as any).prisma);
    }
  } catch {
    /* boot without DB */
  }

  let pkgs: {
    createSuiteOidcRouter: (opts: any) => any;
    runFirstEnable: (opts: any) => Promise<any>;
    isFlagEnabled: (n: string) => boolean;
    createIssaToolRouter?: (opts: any) => any;
    hasAddon?: (c: any, k: string) => boolean;
  } | null = null;

  try {
    const adapter = await import('@renverse/suite-oidc-adapter');
    const auth = await import('@renverse/auth-sdk');
    let createIssaToolRouter: ((opts: any) => any) | undefined;
    try {
      const ai = await import('@renverse/ai-sdk');
      createIssaToolRouter = ai.createIssaToolRouter;
    } catch {
      /* optional */
    }
    pkgs = {
      createSuiteOidcRouter: adapter.createSuiteOidcRouter,
      runFirstEnable: adapter.runFirstEnable,
      isFlagEnabled: auth.isFlagEnabled,
      createIssaToolRouter,
      hasAddon: auth.hasAddon,
    };
  } catch (e) {
    fastify.log.warn(
      { err: e },
      '[renverse] @renverse packages unavailable — status-only mode',
    );
  }

  fastify.get('/renverse/status', async (req, reply) => {
    const orgId =
      typeof (req.query as { orgId?: string }).orgId === 'string'
        ? String((req.query as { orgId?: string }).orgId).trim()
        : '';
    let tenantCutover = false;
    if (orgId && (fastify as any).prisma) {
      try {
        tenantCutover = await isOrgCutover((fastify as any).prisma, orgId);
      } catch {
        tenantCutover = false;
      }
    }
    let authPhase: string = mode === 'suite' ? 'dual' : 'standalone';
    try {
      const { resolveAuthPhase } = await import('@renverse/auth-sdk');
      authPhase = resolveAuthPhase({ mode, tenantCutover });
    } catch {
      try {
        const { resolveAuthPhase } = await import('./suite-auth-gate.js');
        authPhase = resolveAuthPhase({ mode, tenantCutover });
      } catch {
        /* keep default */
      }
    }
    return reply.send({
      ok: true,
      mode,
      appKey: 'smartload',
      suiteRole: 'addon',
      entitlement: 'addon',
      oidc: mode === 'suite' && Boolean(pkgs),
      authPhase,
      identityOnly: authPhase === 'cutover',
      tenantCutover,
      packagesLoaded: Boolean(pkgs),
      contractsVersion: process.env.RENVERSE_CONTRACTS_VERSION || '1.0.0',
      tallyMode: tallyMode(),
      tallyNote:
        'SMARTLOAD_TALLY_MODE=onprem — Tally bridge stays on-prem (not cloud)',
      issaPersona: SMARTLOAD_ISSA_PERSONA,
      connectEmit: pkgs
        ? pkgs.isFlagEnabled('renverse.connect.emit')
        : Boolean(process.env.RENVERSE_CONNECT_URL),
      connectConsume: pkgs
        ? pkgs.isFlagEnabled('renverse.connect.consume')
        : Boolean(process.env.RENVERSE_CONNECT_URL),
      timestamp: new Date().toISOString(),
    });
  });

  function connectAuthOk(req: { headers: Record<string, unknown> }): boolean {
    const auth = String(req.headers.authorization || '');
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-connect-token'] || '');
    return isConnectServiceAuthorized(presented);
  }

  fastify.post('/renverse/events/consume', async (req, reply) => {
    if (!connectAuthOk(req as any)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const prisma = (fastify as any).prisma;
    if (!prisma) {
      return reply.code(503).send({ error: 'db_unavailable' });
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const envelope = {
      id: String(body.id || body.eventId || ''),
      type: String(body.type || ''),
      orgId: String(body.orgId || body.org_id || ''),
      payload: (body.payload || body.data || {}) as Record<string, unknown>,
    };
    if (!envelope.id || !envelope.type) {
      return reply.code(400).send({ error: 'id and type required' });
    }
    const result = await applyConsumeEnvelope(prisma, envelope as any);
    return reply.send({ ok: true, ...result });
  });

  fastify.post('/renverse/connect/consume', async (req, reply) => {
    if (!connectAuthOk(req as any)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const prisma = (fastify as any).prisma;
    if (!prisma) {
      return reply.code(503).send({ error: 'db_unavailable' });
    }
    const result = await consumePendingEvents(prisma);
    return reply.send({ ok: true, ...result });
  });

  fastify.post('/renverse/link/start', {
    preHandler: (fastify as any).requireAuth,
  }, async (req, reply) => {
    if (!isSuiteMode(mode)) {
      return reply.code(400).send({
        error: 'standalone_mode',
        message: 'RenVerse account linking is only available when RENVERSE_MODE=suite.',
      });
    }
    const userId = String((req as any).user?.userId || '');
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    setRenverseLinkCookie(reply as any, userId);
    return reply.send({
      ok: true,
      redirectUrl: `/auth/login?returnPath=${encodeURIComponent('/')}`,
    });
  });

  const requireAddonOr403 = (claims: AccessTokenClaims | null | undefined, reply: any) => {
    if (!isSuiteMode(mode)) return true;
    const gate = requireSmartloadAddon(claims as any);
    if (!gate.ok) {
      reply.code(403).send({
        error: ADDON_NOT_ENABLED,
        code: ADDON_NOT_ENABLED,
        message: gate.message,
      });
      return false;
    }
    return true;
  };

  fastify.get('/renverse/site', async (req, reply) => {
    const orgId =
      (req.query as { orgId?: string }).orgId ||
      (req.headers['x-renverse-org-id'] as string | undefined) ||
      readCookie(req as any, 'smartload_org_id');
    if (!orgId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (isSuiteMode(mode)) {
      const cookieOk = Boolean(readCookie(req as any, 'smartload_org_id'));
      const addonsHeader = String(req.headers['x-renverse-addons'] || '');
      const addons = addonsHeader
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!cookieOk) {
        if (!requireAddonOr403(
          { sub: 'probe', org_id: orgId, apps: [], addons } as AccessTokenClaims,
          reply,
        )) {
          return;
        }
      }
    }
    const store = await resolveStore(fastify);
    let org = await store.findOrgByRenverseId(orgId);
    if (!org) {
      org = await store.createOrg({
        name: `SmartLoad site ${orgId}`,
        renverseOrgId: orgId,
        siteId: siteIdForOrg(orgId),
      });
    }
    return reply.send({
      orgId,
      siteId: org.siteId,
      name: org.name,
      organizationId: org.id,
      tallyMode: tallyMode(),
    });
  });

  fastify.get<{ Params: { id: string } }>(
    '/renverse/shipments/:id',
    async (req, reply) => {
      const orgId =
        (req.query as { orgId?: string }).orgId ||
        (req.headers['x-renverse-org-id'] as string | undefined);
      if (!orgId) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      if (isSuiteMode(mode)) {
        const addons = String(req.headers['x-renverse-addons'] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!requireAddonOr403({ sub: 'x', org_id: orgId, apps: [], addons } as any, reply)) {
          return;
        }
      }
      try {
        const po = await (fastify as any).prisma?.purchaseOrder?.findUnique?.({
          where: { id: req.params.id },
        });
        if (!po) {
          return reply.code(404).send({ error: 'NOT_FOUND' });
        }
        const scope = assertSameOrg(po.organizationId, orgId);
        // organizationId on PO is local id — also accept renverse org via org lookup
        if (!scope.ok) {
          const store = await resolveStore(fastify);
          const org = await store.findOrgByRenverseId(orgId);
          const scope2 = assertSameOrg(po.organizationId, org?.id || '');
          if (!scope2.ok) {
            return reply.code(403).send({ error: 'ORG_SCOPE_MISMATCH' });
          }
        }
        return reply.send({
          shipmentId: po.id,
          poNumber: po.poNumber,
          status: po.status,
          organizationId: po.organizationId,
        });
      } catch {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/renverse/shipments/:id/pod',
    async (req, reply) => {
      const body = (req.body || {}) as Record<string, unknown>;
      const orgId = String(body.orgId || req.headers['x-renverse-org-id'] || '');
      if (isSuiteMode(mode) && orgId) {
        const addons = String(req.headers['x-renverse-addons'] || 'smartload')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!requireAddonOr403({ sub: 'x', org_id: orgId, apps: [], addons } as any, reply)) {
          return;
        }
      }
      const writeOutbox = async (row: {
        eventId: string;
        type: string;
        orgId: string;
        payload: Record<string, unknown>;
      }) => {
        try {
          await (fastify as any).prisma?.$executeRawUnsafe?.(
            `INSERT INTO renverse_outbox (event_id, type, org_id, payload)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (event_id) DO NOTHING`,
            row.eventId,
            row.type,
            row.orgId,
            JSON.stringify(row.payload),
          );
        } catch {
          /* table may not exist yet in unit env */
        }
      };
      const result = await emitPodConfirmed({
        shipmentId: String(req.params.id),
        orgId: orgId || 'org_demo00000001',
        podId: body.podId ? String(body.podId) : undefined,
        skuLines: body.skuLines as Array<{ sku: string; qty: number }> | undefined,
        valuationHint:
          body.valuationHint !== undefined
            ? Number(body.valuationHint)
            : undefined,
        writeOutbox,
      });
      return reply.send(result);
    },
  );

  if (mode !== 'suite' || !pkgs) {
    return;
  }

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
    resolveTenantCutover: async (req) => {
      const orgId =
        typeof req.query.orgId === 'string' ? req.query.orgId.trim() : '';
      const probeOrg = orgId || readCookie(req as any, 'smartload_org_id') || '';
      if (probeOrg && (fastify as any).prisma) {
        try {
          return await isOrgCutover((fastify as any).prisma, probeOrg);
        } catch {
          return false;
        }
      }
      return false;
    },
    async onJit(claims: AccessTokenClaims, req?: any) {
      const store = await resolveStore(fastify);
      const linkUserId = req ? readRenverseLinkUserId(req) : null;
      if (linkUserId && (fastify as any).prisma) {
        try {
          const linked = await linkRenverseIdentityToUser(
            (fastify as any).prisma,
            linkUserId,
            claims,
          );
          if (linked.ok) {
            const membership = await ensureOrgAndMembership(store, claims as any, {
              linkUserId: linked.userId,
            });
            return {
              localUserId: membership.localUserId,
              localTenantId: membership.localTenantId,
              suiteRole: claims.roles?.[0],
            };
          }
          fastify.log.warn({ reason: linked.reason }, '[renverse] account link skipped');
        } catch (e) {
          fastify.log.warn({ err: e }, '[renverse] account link failed');
        }
      }
      const membership = await ensureOrgAndMembership(store, claims as any, {
        linkUserId,
      });
      return {
        localUserId: membership.localUserId,
        localTenantId: membership.localTenantId,
        suiteRole: claims.roles?.[0],
      };
    },
    async onFirstEnable(claims: AccessTokenClaims, jit: any, session: any) {
      const result = await pkgs!.runFirstEnable({
        appKey: 'smartload',
        claims,
        session,
        jit,
        createLocalTenant: (orgId: string) => siteIdForOrg(orgId),
      });
      const store = await resolveStore(fastify);
      const membership = await ensureOrgAndMembership(store, claims as any);
      const prisma = (fastify as any).prisma;
      if (prisma && jit?.localUserId) {
        try {
          await prisma.$executeRawUnsafe(
            `INSERT INTO renverse_id_map_local
              (org_id, entity_type, source_app, source_id, target_app, target_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (org_id, entity_type, source_app, source_id, target_app)
             DO UPDATE SET target_id = EXCLUDED.target_id`,
            claims.org_id,
            'user',
            'identity',
            claims.sub,
            'smartload',
            jit.localUserId,
          );
        } catch (e) {
          fastify.log.warn({ err: e }, '[renverse] first-enable idmap skip');
        }
      }
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
      clearRenverseLinkCookie(res);
    },
  });

  const cookieParser = (await import('cookie-parser')).default;
  (fastify as any).use(cookieParser());
  (fastify as any).use(expressRouter);

  if (pkgs.createIssaToolRouter) {
    const toolSecret = process.env.ISSA_TOOL_TOKEN_SECRET || 'dev-issa-tool-secret';
    const issaUrl = process.env.RENVERSE_ISSA_URL || 'http://localhost:9120';
    const handlers = createSmartloadIssaHandlers({
      canRead: () => true,
      async getShipment(id) {
        try {
          const po = await (fastify as any).prisma.purchaseOrder.findUnique({
            where: { id },
          });
          if (!po) return null;
          let renverseOrgId: string | null = null;
          if (po.organizationId) {
            const org = await (fastify as any).prisma.organization.findUnique({
              where: { id: po.organizationId },
            });
            renverseOrgId = org?.renverseOrgId ?? null;
          }
          return {
            id: po.id,
            organizationId: renverseOrgId,
            status: po.status,
            poNumber: po.poNumber,
          };
        } catch {
          return null;
        }
      },
      async getPod(id) {
        try {
          const pod = await (fastify as any).prisma.proofOfDelivery.findUnique({
            where: { id },
            include: { session: { include: { purchaseOrder: true } } },
          });
          if (!pod) return null;
          const orgLocalId = pod.session?.purchaseOrder?.organizationId;
          let renverseOrgId: string | null = null;
          if (orgLocalId) {
            const org = await (fastify as any).prisma.organization.findUnique({
              where: { id: orgLocalId },
            });
            renverseOrgId = org?.renverseOrgId ?? null;
          }
          return {
            id: pod.id,
            organizationId: renverseOrgId,
            status: pod.status,
            shipmentId: pod.session?.poId,
            acknowledgedAt: pod.acknowledgedAt?.toISOString?.() ?? null,
          };
        } catch {
          return null;
        }
      },
    });
    const issaRouter = pkgs.createIssaToolRouter({
      appKey: 'smartload',
      secret: toolSecret,
      issuer: issaUrl,
      handlers,
      authorize: () => true,
    });
    (fastify as any).use(issaRouter);
  }

  fastify.log.info(
    `[renverse] SmartLoad suite OIDC + tenancy mounted (tally=${tallyMode()}, entitlement=addon)`,
  );

  if ((fastify as any).prisma) {
    startConsumeLoop((fastify as any).prisma);
  }
};
