/**
 * RenVerse cross-app identity directory lookup (service-to-service only).
 *
 * Lets RenVerse's identity service ask "does this email exist in SmartLoad,
 * and under which tenant(s)?" for existing-app-user self-service onboarding.
 * Gated solely by a shared bearer token (APP_DIRECTORY_SERVICE_TOKEN) — this
 * is NOT part of SmartLoad's normal user-session auth.
 */
import { timingSafeEqual } from 'node:crypto';

export function appDirectoryServiceToken(): string {
  return process.env.APP_DIRECTORY_SERVICE_TOKEN || 'dev-app-directory-token';
}

export function isAppDirectoryServiceAuthorized(
  presented: string | undefined | null,
): boolean {
  const token = appDirectoryServiceToken();
  const got = String(presented || '');
  if (!got || got.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(token));
}

export type AppDirectoryMatch = {
  externalTenantId: string;
  organizationName: string;
  tenantName: string;
  role?: string;
  userName?: string;
  permissions?: string[];
  externalUserId?: string;
};

function toMatch(
  id: string,
  name: string,
  role?: string,
  externalUserId?: string,
  userName?: string,
  permissions?: string[],
): AppDirectoryMatch {
  return {
    externalTenantId: id,
    organizationName: name,
    tenantName: name,
    role,
    userName,
    permissions,
    externalUserId,
  };
}

export function tokenizeDirectoryName(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/**
 * Case-insensitive exact email match across ALL organizations/tenants.
 * Only ever returns externalTenantId, tenantName, role — never password
 * hashes, tokens, or any other user/org fields.
 */
export async function lookupTenantsByEmail(
  prisma: any,
  email: string,
): Promise<AppDirectoryMatch[]> {
  const normalized = String(email || '').trim();
  if (!normalized) return [];

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      email: true,
      orgMemberships: {
        select: {
          role: true,
          renverseSuiteRole: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) return [];

  const matches: AppDirectoryMatch[] = [];
  for (const membership of user.orgMemberships || []) {
    const org = membership.organization;
    if (!org?.id) continue;
    const role = String(membership.renverseSuiteRole || membership.role || 'member').toLowerCase();
    matches.push(
      toMatch(
        org.id,
        org.name,
        role,
        String(user.id),
        user.name || user.email || undefined,
        [role],
      ),
    );
  }
  return matches;
}

export async function lookupOrgsByName(prisma: any, name: string): Promise<AppDirectoryMatch[]> {
  const q = String(name || '').trim();
  if (!q || q.length < 3) return [];
  const tokens = tokenizeDirectoryName(q);
  const patterns = tokens.length ? tokens : [q];
  const rows = await prisma.organization.findMany({
    where: {
      OR: patterns.map((token) => ({ name: { contains: token, mode: 'insensitive' } })),
    },
    select: { id: true, name: true },
    take: 10,
    orderBy: { name: 'asc' },
  });
  return rows.map((row: { id: string; name: string }) => toMatch(row.id, row.name));
}
