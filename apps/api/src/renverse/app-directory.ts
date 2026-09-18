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
  tenantName: string;
  role: string;
};

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
      orgMemberships: {
        select: {
          role: true,
          renverseSuiteRole: true,
          organization: {
            select: {
              renverseOrgId: true,
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
    if (!org?.renverseOrgId) continue;
    const role = String(membership.renverseSuiteRole || membership.role || 'member').toLowerCase();
    matches.push({
      externalTenantId: org.renverseOrgId,
      tenantName: org.name,
      role,
    });
  }
  return matches;
}
