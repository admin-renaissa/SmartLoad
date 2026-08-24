#!/usr/bin/env node
/**
 * Backfill Organization + organizationId on clients / POs / scanners.
 * Safe to re-run (idempotent). Uses DATABASE_URL from env.
 *
 *   cd SmartLoad && pnpm --filter @smartload/db exec tsx prisma/backfill-org-tenancy.ts
 *   # or: npm run db:backfill-org (from SmartLoad root when wired)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_RENVERSE_ORG =
  process.env.RENVERSE_DEFAULT_ORG_ID || 'org_demo00000001';

async function main() {
  let org = await prisma.organization.findUnique({
    where: { renverseOrgId: DEFAULT_RENVERSE_ORG },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: 'org_local_default',
        name: 'Default SmartLoad org',
        renverseOrgId: DEFAULT_RENVERSE_ORG,
        siteId: `site_${DEFAULT_RENVERSE_ORG}`,
        booksMode: 'renbooks',
      },
    });
    console.log('created organization', org.id, org.renverseOrgId);
  } else {
    console.log('using organization', org.id, org.renverseOrgId);
  }

  const clients = await prisma.client.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log('clients backfilled', clients.count);

  // Prefer client org, else default
  const unscopedPos = await prisma.purchaseOrder.findMany({
    where: { organizationId: null },
    select: { id: true, clientId: true },
  });
  let poCount = 0;
  for (const po of unscopedPos) {
    const client = await prisma.client.findUnique({
      where: { id: po.clientId },
      select: { organizationId: true },
    });
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { organizationId: client?.organizationId || org.id },
    });
    poCount += 1;
  }
  console.log('purchase_orders backfilled', poCount);

  const scanners = await prisma.scannerDevice.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log('scanners backfilled', scanners.count);

  // Ensure admin users have membership on default org
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  for (const u of admins) {
    await prisma.orgMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: u.id,
        },
      },
      create: {
        organizationId: org.id,
        userId: u.id,
        role: 'ADMIN',
        renverseSuiteRole: 'org_admin',
        renverseFloorRole: 'ADMIN',
      },
      update: {},
    });
  }
  console.log('admin memberships upserted', admins.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
