/**
 * Resolve local organizationId for product API requests.
 * Sources (in order): JWT claim → suite cookie → header → user membership.
 *
 * Suite addon: enforced when suite cookie / suite header present.
 * Pure local JWT (dual-mode standalone login) remains allowed without addon cookie.
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import {
  requireSmartloadAddon,
  isSuiteMode,
  isSuiteAddonExemptPath,
  ADDON_NOT_ENABLED,
} from '../renverse/addon-gate.js';
import type { AccessTokenClaims } from '@renverse/auth-sdk';

export type OrgContext = {
  organizationId: string | null;
  renverseOrgId: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    org: OrgContext;
  }
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function resolveOrgContext(
  request: FastifyRequest,
  prisma: any,
): Promise<OrgContext> {
  const jwtOrg = (request.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (jwtOrg) {
    return { organizationId: jwtOrg, renverseOrgId: null };
  }

  const renverseOrgId =
    readCookie(request, 'smartload_org_id') ||
    (request.headers['x-renverse-org-id'] as string | undefined) ||
    null;

  if (renverseOrgId && prisma?.organization) {
    try {
      const org = await prisma.organization.findUnique({
        where: { renverseOrgId },
      });
      if (org) {
        return { organizationId: org.id, renverseOrgId };
      }
    } catch {
      /* table may be absent pre-migrate */
    }
  }

  const userId = request.user?.userId;
  if (userId && prisma?.orgMembership) {
    try {
      const m = await prisma.orgMembership.findFirst({
        where: { userId },
        include: { organization: true },
      });
      if (m) {
        return {
          organizationId: m.organizationId,
          renverseOrgId: m.organization?.renverseOrgId ?? null,
        };
      }
    } catch {
      /* ignore */
    }
  }

  return { organizationId: null, renverseOrgId };
}

const orgContextPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('org', null);

  fastify.addHook('preHandler', async (request, reply) => {
    request.org = { organizationId: null, renverseOrgId: null };

    const hasUserHint =
      Boolean(request.user?.userId) ||
      Boolean(request.headers.cookie) ||
      Boolean(request.headers['x-renverse-org-id']);

    if (hasUserHint) {
      request.org = await resolveOrgContext(request, (fastify as any).prisma);
    }

    if (!isSuiteMode()) return;
    if (isSuiteAddonExemptPath(request.url)) return;
    if (!request.url.startsWith('/api/v1')) return;

    const cookieOrg = readCookie(request, 'smartload_org_id');
    const suiteForced = request.headers['x-renverse-suite'] === '1';
    const addonsHeader = String(request.headers['x-renverse-addons'] || '');

    // OIDC session cookie ⇒ already passed hasAddon at login
    if (cookieOrg) return;

    // Explicit suite probe / force: require addons[]
    if (suiteForced || addonsHeader) {
      const claims = {
        sub: request.user?.userId || 'anonymous',
        org_id: request.org.renverseOrgId || 'unknown',
        apps: [],
        addons: addonsHeader
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      } as AccessTokenClaims;
      const gate = requireSmartloadAddon(claims);
      if (!gate.ok) {
        return reply.code(403).send({
          success: false,
          data: null,
          error: ADDON_NOT_ENABLED,
          code: ADDON_NOT_ENABLED,
          message: gate.message,
        });
      }
    }
  });
};

export const orgContextPlugin = fp(orgContextPluginImpl, {
  name: 'org-context',
  dependencies: ['prisma', 'auth'],
});
