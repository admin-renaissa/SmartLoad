/**
 * EP-X-01 Phase B — per-org suite cutover on organizations.
 */
let ensurePromise: Promise<void> | null = null;

/** Runtime ALTER for DBs that have not applied the Prisma migration yet. */
export async function ensureCutoverColumn(prisma: {
  $executeRawUnsafe?: (q: string) => Promise<unknown>;
}): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await prisma.$executeRawUnsafe?.(
          `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "renverse_suite_cutover_at" TIMESTAMP(3)`,
        );
      } catch (e) {
        console.warn(
          '[renverse] ensureCutoverColumn skipped:',
          (e as Error).message,
        );
        ensurePromise = null;
      }
    })();
  }
  await ensurePromise;
}

/** True when org (local id or renverse_org_id) has renverse_suite_cutover_at set. */
export async function isOrgCutover(
  prisma: {
    organization: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
  },
  orgId: string,
): Promise<boolean> {
  const id = String(orgId || '').trim();
  if (!id) return false;
  try {
    const row = await prisma.organization.findFirst({
      where: {
        OR: [{ id }, { renverseOrgId: id }],
        renverseSuiteCutoverAt: { not: null },
      },
      select: { id: true },
    });
    return Boolean(row);
  } catch (e) {
    const msg = String((e as Error)?.message || e || '');
    if (/renverse_suite_cutover_at|renverseSuiteCutoverAt|Unknown arg/i.test(msg)) {
      return false;
    }
    throw e;
  }
}

/** True if any of the user's org memberships belong to a cut-over org. */
export async function userHasOrgCutover(
  prisma: {
    orgMembership: {
      findMany: (args: unknown) => Promise<Array<{ organizationId: string }>>;
    };
    organization: {
      findFirst: (args: unknown) => Promise<{ id: string } | null>;
    };
  },
  userId: string,
): Promise<boolean> {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  try {
    const mems = await prisma.orgMembership.findMany({
      where: { userId: uid },
      select: { organizationId: true },
    });
    for (const m of mems) {
      if (await isOrgCutover(prisma, m.organizationId)) return true;
    }
    return false;
  } catch (e) {
    const msg = String((e as Error)?.message || e || '');
    if (/renverse_suite_cutover_at|renverseSuiteCutoverAt|Unknown arg/i.test(msg)) {
      return false;
    }
    throw e;
  }
}
