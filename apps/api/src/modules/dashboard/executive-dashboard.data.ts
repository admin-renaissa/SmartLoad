import type { PrismaClient } from '@prisma/client';
import { POStatus } from '@prisma/client';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ExecutiveDashboardPayload = {
  kpis: {
    dispatchesToday: number;
    dispatchesTodayDelta: number;
    boxesThisWeek: number;
    boxesWeekSparkline: { day: string; label: string; boxes: number }[];
    scanErrorRateToday: number;
    totalScansToday: number;
    errorScansToday: number;
    pendingPODs: number;
    disputedPODs: number;
  };
  dispatchVolume30d: { date: string; label: string; boxes: number }[];
  ordersByStatus: { status: string; count: number }[];
  topClientsMonth: { clientId: string; clientName: string; boxes: number }[];
  topProductsMonth: { productId: string; productName: string; boxes: number }[];
  recentSessions: Array<{
    id: string;
    sessionCode: string;
    status: string;
    poNumber: string;
    clientName: string;
    vehicleReg: string;
  }>;
  lowStockAlerts: Array<{
    variantId: string;
    productId: string;
    label: string;
    availableBoxes: number;
    minThreshold: number;
  }>;
  tallySync: {
    lastSyncAt: string | null;
    failedJobsCount: number;
  };
};


export async function buildExecutiveDashboardData(prisma: PrismaClient): Promise<ExecutiveDashboardPayload> {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const weekAgo = addDays(today, -6);
  const thirtyAgo = addDays(today, -29);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    dispatchesToday,
    dispatchesYesterday,
    sessionsWeek,
    totalScansToday,
    errorScansToday,
    pendingPODs,
    disputedPODs,
    ordersByStatusRaw,
    sessions30d,
    sessionsThisMonth,
    recentSessionsRaw,
    stockRows,
    lastTallySync,
    failedTallyJobs,
  ] = await Promise.all([
    prisma.dispatchSession.count({ where: { status: 'CLOSED', closedAt: { gte: today } } }),
    prisma.dispatchSession.count({
      where: { status: 'CLOSED', closedAt: { gte: yesterday, lt: today } },
    }),
    prisma.dispatchSession.findMany({
      where: { status: 'CLOSED', closedAt: { gte: weekAgo } },
      select: { closedAt: true, totalBoxesScanned: true },
    }),
    prisma.scanEvent.count({ where: { scannedAt: { gte: today } } }),
    prisma.scanEvent.count({ where: { scannedAt: { gte: today }, result: { not: 'SUCCESS' } } }),
    prisma.proofOfDelivery.count({
      where: { status: { in: ['PENDING', 'LINK_SENT', 'OTP_VERIFIED'] } },
    }),
    prisma.proofOfDelivery.count({
      where: { status: 'DISPUTED' },
    }),
    prisma.purchaseOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.dispatchSession.findMany({
      where: { status: 'CLOSED', closedAt: { gte: thirtyAgo } },
      select: { closedAt: true, totalBoxesScanned: true },
    }),
    prisma.dispatchSession.findMany({
      where: { status: 'CLOSED', closedAt: { gte: monthStart } },
      include: {
        purchaseOrder: { include: { client: { select: { id: true, name: true } } } },
      },
    }),
    prisma.dispatchSession.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: {
        purchaseOrder: { include: { client: { select: { name: true } } } },
        vehicle: { select: { registrationNumber: true } },
      },
    }),
    prisma.inventoryStock.findMany({
      where: { variant: { isActive: true, product: { isActive: true } } },
      include: { variant: { include: { product: { select: { id: true, name: true, minStockAlert: true } } } } },
    }),
    prisma.tallySyncJob.findFirst({
      where: { status: 'COMPLETED', processedAt: { not: null } },
      orderBy: { processedAt: 'desc' },
      select: { processedAt: true },
    }),
    prisma.tallySyncJob.count({
      where: { status: { in: ['FAILED', 'PERMANENTLY_FAILED'] } } },
    ),
  ]);

  const boxesThisWeek = sessionsWeek.reduce((s, x) => s + x.totalBoxesScanned, 0);

  const boxesWeekSparkline: ExecutiveDashboardPayload['kpis']['boxesWeekSparkline'] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = addDays(weekAgo, i);
    const dayEnd = addDays(dayStart, 1);
    const dayLabel = dayStart.toLocaleDateString('en-IN', { weekday: 'short' });
    const daySessions = sessionsWeek.filter(
      (s) => s.closedAt && s.closedAt >= dayStart && s.closedAt < dayEnd,
    );
    const boxes = daySessions.reduce((s, x) => s + x.totalBoxesScanned, 0);
    boxesWeekSparkline.push({ day: toYmd(dayStart), label: dayLabel, boxes });
  }

  const errorRate =
    totalScansToday > 0 ? Math.round((errorScansToday / totalScansToday) * 1000) / 10 : 0;

  const byDay = new Map<string, number>();
  for (const s of sessions30d) {
    if (!s.closedAt) continue;
    const key = toYmd(s.closedAt);
    byDay.set(key, (byDay.get(key) || 0) + s.totalBoxesScanned);
  }
  const dispatchVolume30d: ExecutiveDashboardPayload['dispatchVolume30d'] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = toYmd(d);
    dispatchVolume30d.push({
      date: key,
      label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
      boxes: byDay.get(key) || 0,
    });
  }

  const statusMap = new Map(ordersByStatusRaw.map((o) => [o.status, o._count._all]));
  const n = (s: POStatus) => statusMap.get(s) || 0;
  const ordersByStatus: ExecutiveDashboardPayload['ordersByStatus'] = [
    { status: 'CONFIRMED', count: n(POStatus.CONFIRMED) },
    { status: 'PARTIALLY_LOADED', count: n(POStatus.PARTIALLY_LOADED) + n(POStatus.FULLY_LOADED) },
    { status: 'DISPATCHED', count: n(POStatus.DISPATCHED) },
    { status: 'DELIVERED', count: n(POStatus.DELIVERED) },
    { status: 'CANCELLED', count: n(POStatus.CANCELLED) },
  ].filter((o) => o.count > 0);

  const clientMap = new Map<string, { clientName: string; boxes: number }>();
  for (const s of sessionsThisMonth) {
    const c = s.purchaseOrder.client;
    const cur = clientMap.get(c.id) || { clientName: c.name, boxes: 0 };
    cur.boxes += s.totalBoxesScanned;
    clientMap.set(c.id, cur);
  }
  const topClientsMonth = Array.from(clientMap.entries())
    .map(([clientId, v]) => ({ clientId, clientName: v.clientName, boxes: v.boxes }))
    .sort((a, b) => b.boxes - a.boxes)
    .slice(0, 5);

  const scanForProducts = await prisma.scanEvent.findMany({
    where: {
      result: 'SUCCESS',
      scannedAt: { gte: monthStart },
      resolvedVariant: { isNot: null },
    },
    include: { resolvedVariant: { include: { product: { select: { id: true, name: true } } } } },
  });
  const productMap = new Map<string, { productName: string; boxes: number }>();
  for (const ev of scanForProducts) {
    if (!ev.resolvedVariant) continue;
    const p = ev.resolvedVariant.product;
    const cur = productMap.get(p.id) || { productName: p.name, boxes: 0 };
    cur.boxes += 1;
    productMap.set(p.id, cur);
  }
  const topProductsMonth = Array.from(productMap.entries())
    .map(([productId, v]) => ({ productId, productName: v.productName, boxes: v.boxes }))
    .sort((a, b) => b.boxes - a.boxes)
    .slice(0, 5);

  const recentSessions: ExecutiveDashboardPayload['recentSessions'] = recentSessionsRaw.map((s) => ({
    id: s.id,
    sessionCode: s.sessionCode,
    status: s.status,
    poNumber: s.purchaseOrder.poNumber,
    clientName: s.purchaseOrder.client.name,
    vehicleReg: s.vehicle.registrationNumber,
  }));

  const lowStockAlerts = stockRows
    .filter((s) => s.totalBoxes <= s.variant.product.minStockAlert)
    .map((s) => {
      const p = s.variant.product;
      return {
        variantId: s.variantId,
        productId: p.id,
        label: `${p.name} — ${s.variant.colourName}`,
        availableBoxes: s.totalBoxes - s.reservedBoxes,
        minThreshold: p.minStockAlert,
      };
    })
    .sort((a, b) => a.availableBoxes - b.availableBoxes)
    .slice(0, 10);

  return {
    kpis: {
      dispatchesToday,
      dispatchesTodayDelta: dispatchesToday - dispatchesYesterday,
      boxesThisWeek,
      boxesWeekSparkline,
      scanErrorRateToday: errorRate,
      totalScansToday,
      errorScansToday,
      pendingPODs,
      disputedPODs,
    },
    dispatchVolume30d,
    ordersByStatus,
    topClientsMonth,
    topProductsMonth,
    recentSessions,
    lowStockAlerts,
    tallySync: {
      lastSyncAt: lastTallySync?.processedAt?.toISOString() ?? null,
      failedJobsCount: failedTallyJobs,
    },
  };
}
