/**
 * Org / membership tenancy helpers (EP-SL-01).
 * Organization maps to RenIdentity org; Client remains a counterparty under org.
 */
import type { AccessTokenClaims } from '@renverse/auth-sdk';
import type { UserRole } from '@smartload/shared';

export type OrgRow = {
  id: string;
  name: string;
  renverseOrgId: string;
  siteId: string;
};

export type MembershipRow = {
  localUserId: string;
  localTenantId: string;
  organizationId: string;
  role: UserRole;
  suiteRole?: string;
};

export function suiteFloorToLocalRole(suiteRole?: string): UserRole {
  const r = String(suiteRole || 'org_member').toLowerCase();
  if (r === 'org_owner' || r === 'org_admin') return 'ADMIN' as UserRole;
  if (r === 'org_billing' || r === 'org_readonly') return 'ACCOUNTS' as UserRole;
  return 'OPERATOR' as UserRole;
}

export function siteIdForOrg(renverseOrgId: string): string {
  return `site_${renverseOrgId}`;
}

/** Cross-org IDOR guard. Suite mode: null resource or request org → deny. */
export function assertSameOrg(
  resourceOrgId: string | null | undefined,
  requestOrgId: string | null | undefined,
  opts?: { suiteStrict?: boolean },
): { ok: true } | { ok: false; status: 403; code: 'ORG_SCOPE_MISMATCH' } {
  const suiteStrict =
    opts?.suiteStrict ??
    String(process.env.RENVERSE_MODE || 'standalone').toLowerCase() === 'suite';
  if (!requestOrgId) {
    if (suiteStrict) return { ok: false, status: 403, code: 'ORG_SCOPE_MISMATCH' };
    return { ok: true };
  }
  if (!resourceOrgId) {
    if (suiteStrict) return { ok: false, status: 403, code: 'ORG_SCOPE_MISMATCH' };
    return { ok: true };
  }
  if (resourceOrgId !== requestOrgId) {
    return { ok: false, status: 403, code: 'ORG_SCOPE_MISMATCH' };
  }
  return { ok: true };
}

/** Prisma where fragment for list filters. */
export function orgWhere(
  organizationId: string | null | undefined,
): { organizationId: string } | Record<string, never> {
  if (!organizationId) return {};
  return { organizationId };
}

export type TenancyStore = {
  findOrgByRenverseId(renverseOrgId: string): Promise<OrgRow | null>;
  createOrg(input: {
    name: string;
    renverseOrgId: string;
    siteId: string;
  }): Promise<OrgRow>;
  findUserBySub(sub: string): Promise<{ id: string; email: string } | null>;
  findUserById?(userId: string): Promise<{ id: string; email: string; renverseSub?: string | null } | null>;
  findUsersByEmail?(email: string): Promise<Array<{ id: string; email: string; renverseSub?: string | null }>>;
  linkUserSub?(userId: string, sub: string): Promise<void>;
  createSuiteUser(input: {
    sub: string;
    email: string;
    name: string;
    role: UserRole;
    /** Prefer linking this local user (from Phase A link cookie). */
    linkUserId?: string | null;
  }): Promise<{ id: string }>;
  upsertMembership(input: {
    organizationId: string;
    userId: string;
    role: UserRole;
    suiteRole?: string;
    floorRole: UserRole;
  }): Promise<void>;
};

/** In-memory store for unit tests / DB-unavailable fallback. */
export function createMemoryTenancyStore(): TenancyStore & {
  orgs: Map<string, OrgRow>;
  users: Map<string, { id: string; email: string; sub: string }>;
  memberships: Map<string, MembershipRow>;
} {
  const orgs = new Map<string, OrgRow>();
  const users = new Map<string, { id: string; email: string; sub: string }>();
  const memberships = new Map<string, MembershipRow>();
  return {
    orgs,
    users,
    memberships,
    async findOrgByRenverseId(renverseOrgId) {
      return orgs.get(renverseOrgId) ?? null;
    },
    async createOrg(input) {
      const row: OrgRow = {
        id: `org_local_${input.renverseOrgId}`,
        name: input.name,
        renverseOrgId: input.renverseOrgId,
        siteId: input.siteId,
      };
      orgs.set(input.renverseOrgId, row);
      return row;
    },
    async findUserBySub(sub) {
      return users.get(sub) ?? null;
    },
    async createSuiteUser(input) {
      if (input.linkUserId) {
        const existing = [...users.values()].find((u) => u.id === input.linkUserId);
        if (existing) {
          users.set(input.sub, { ...existing, sub: input.sub });
          return { id: existing.id };
        }
      }
      const id = `local_${input.sub}`;
      users.set(input.sub, { id, email: input.email, sub: input.sub });
      return { id };
    },
    async upsertMembership(input) {
      const key = `${input.organizationId}:${input.userId}`;
      memberships.set(key, {
        localUserId: input.userId,
        localTenantId: input.organizationId,
        organizationId: input.organizationId,
        role: input.role,
        suiteRole: input.suiteRole,
      });
    },
  };
}

export async function ensureOrgAndMembership(
  store: TenancyStore,
  claims: AccessTokenClaims,
  opts?: { linkUserId?: string | null },
): Promise<MembershipRow> {
  const suiteRole = claims.roles?.[0];
  const floor = suiteFloorToLocalRole(suiteRole);
  let org = await store.findOrgByRenverseId(claims.org_id);
  if (!org) {
    org = await store.createOrg({
      name: `SmartLoad ${claims.org_id}`,
      renverseOrgId: claims.org_id,
      siteId: siteIdForOrg(claims.org_id),
    });
  }
  let user = await store.findUserBySub(claims.sub);
  if (!user && opts?.linkUserId) {
    user = {
      ...(await store.createSuiteUser({
        sub: claims.sub,
        email:
          (claims as { email?: string }).email ||
          `${claims.sub.replace(/[^a-zA-Z0-9]/g, '_')}@suite.local`,
        name: (claims as { name?: string }).name || 'Suite operator',
        role: floor,
        linkUserId: opts.linkUserId,
      })),
      email: (claims as { email?: string }).email || '',
    };
  }
  if (!user) {
    const email =
      (claims as { email?: string }).email ||
      `${claims.sub.replace(/[^a-zA-Z0-9]/g, '_')}@suite.local`;
    user = {
      ...(await store.createSuiteUser({
        sub: claims.sub,
        email,
        name: (claims as { name?: string }).name || 'Suite operator',
        role: floor,
      })),
      email,
    };
  }
  await store.upsertMembership({
    organizationId: org.id,
    userId: user.id,
    role: floor,
    suiteRole,
    floorRole: floor,
  });
  return {
    localUserId: user.id,
    localTenantId: org.siteId,
    organizationId: org.id,
    role: floor,
    suiteRole,
  };
}

/** Prisma-backed tenancy store for OIDC JIT and Connect consumers. */
export function createPrismaTenancyStore(prisma: {
  organization: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      name: string;
      renverseOrgId: string;
      siteId: string;
    } | null>;
    create: (args: unknown) => Promise<{
      id: string;
      name: string;
      renverseOrgId: string;
      siteId: string;
    }>;
  };
  user: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      email: string;
      renverseSub?: string | null;
    } | null>;
    findMany: (args: unknown) => Promise<Array<{ id: string; renverseSub?: string | null }>>;
    create: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<unknown>;
  };
  orgMembership: {
    upsert: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<unknown>;
  };
}): TenancyStore {
  return {
    async findOrgByRenverseId(renverseOrgId) {
      const row = await prisma.organization.findUnique({
        where: { renverseOrgId },
      });
      return row
        ? {
            id: row.id,
            name: row.name,
            renverseOrgId: row.renverseOrgId,
            siteId: row.siteId,
          }
        : null;
    },
    async createOrg(input) {
      const row = await prisma.organization.create({
        data: {
          name: input.name,
          renverseOrgId: input.renverseOrgId,
          siteId: input.siteId,
        },
      });
      return {
        id: row.id,
        name: row.name,
        renverseOrgId: row.renverseOrgId,
        siteId: row.siteId,
      };
    },
    async findUserBySub(sub) {
      const row = await prisma.user.findUnique({ where: { renverseSub: sub } });
      return row ? { id: row.id, email: row.email } : null;
    },
    async findUserById(userId) {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, renverseSub: true },
      });
      return row;
    },
    async findUsersByEmail(email) {
      const rows = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, email: true, renverseSub: true },
      });
      return rows;
    },
    async linkUserSub(userId, sub) {
      await prisma.user.update({
        where: { id: userId },
        data: { renverseSub: sub },
      });
    },
    async createSuiteUser(input) {
      if (input.linkUserId) {
        const existing = await prisma.user.findUnique({
          where: { id: input.linkUserId },
          select: { id: true, email: true, renverseSub: true },
        });
        if (existing) {
          const claimEmail = String(input.email || '').toLowerCase();
          if (
            claimEmail &&
            String(existing.email || '').toLowerCase() !== claimEmail
          ) {
            const err = new Error('email_mismatch');
            (err as Error & { code?: string }).code = 'ACCOUNT_LINK_EMAIL_MISMATCH';
            throw err;
          }
          if (existing.renverseSub && existing.renverseSub !== input.sub) {
            const err = new Error('already_linked_other_sub');
            (err as Error & { code?: string }).code = 'ACCOUNT_LINK_CONFLICT';
            throw err;
          }
          if (!existing.renverseSub) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { renverseSub: input.sub },
            });
          }
          return { id: existing.id };
        }
      }
      if (input.email) {
        const matches = await prisma.user.findMany({
          where: { email: { equals: input.email, mode: 'insensitive' } },
          select: { id: true, renverseSub: true },
        });
        if (matches.length > 1) {
          const err = new Error(
            'We found more than one match for this email. Ask your admin to link accounts.',
          );
          (err as Error & { code?: string }).code = 'ACCOUNT_LINK_MULTI_MATCH';
          throw err;
        }
        if (matches[0] && !matches[0].renverseSub) {
          await prisma.user.update({
            where: { id: matches[0].id },
            data: { renverseSub: input.sub },
          });
          return { id: matches[0].id };
        }
      }
      const row = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: '!',
          name: input.name,
          role: input.role,
          renverseSub: input.sub,
        },
      });
      return { id: row.id };
    },
    async upsertMembership(input) {
      await prisma.orgMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.userId,
          },
        },
        create: {
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role,
          renverseSuiteRole: input.suiteRole,
          renverseFloorRole: input.floorRole,
        },
        update: {
          renverseSuiteRole: input.suiteRole,
        },
      });
    },
  };
}
