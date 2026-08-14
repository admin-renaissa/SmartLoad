import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole } from '@smartload/shared';
import {
  capExportRows,
  logExportCapIfApplied,
  parseReportFormat,
  sendReportExcel,
  sendReportPdf,
  type ReportColumn,
} from './report-export.js';

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  const staffReports = fastify.requireRole(UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.SUPERVISOR);
  const clientVisibleReports = fastify.requireRole(
    UserRole.ADMIN,
    UserRole.ACCOUNTS,
    UserRole.SUPERVISOR,
    UserRole.CLIENT,
  );

  // GET /api/v1/reports/dispatch-register?format=json|excel|pdf
  fastify.get('/dispatch-register', { preHandler: staffReports }, async (request, reply) => {
    const query = request.query as { dateFrom?: string; dateTo?: string; clientId?: string; status?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.clientId) where.purchaseOrder = { clientId: query.clientId };
    if (query.dateFrom || query.dateTo) {
      where.openedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const sessions = await fastify.prisma.dispatchSession.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      include: {
        purchaseOrder: { include: { client: true } },
        vehicle: true,
        supervisor: { select: { name: true } },
      },
    });

    if (format === 'json') return reply.send(successResponse(sessions));

    const columns: ReportColumn[] = [
      { key: 'sessionCode', header: 'Session' },
      { key: 'status', header: 'Status' },
      { key: 'openedAt', header: 'Opened' },
      { key: 'closedAt', header: 'Closed' },
      { key: 'poNumber', header: 'PO' },
      { key: 'client', header: 'Client' },
      { key: 'vehicle', header: 'Vehicle' },
      { key: 'supervisor', header: 'Supervisor' },
      { key: 'boxes', header: 'Scanned / Expected' },
    ];
    const flat = sessions.map((s) => ({
      sessionCode: s.sessionCode,
      status: s.status,
      openedAt: s.openedAt?.toISOString() ?? '',
      closedAt: s.closedAt?.toISOString() ?? '',
      poNumber: s.purchaseOrder.poNumber,
      client: s.purchaseOrder.client.name,
      vehicle: s.vehicle.registrationNumber,
      supervisor: s.supervisor?.name ?? '',
      boxes: `${s.totalBoxesScanned} / ${s.totalBoxesExpected}`,
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'dispatch-register', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'dispatch-register', 'Dispatch register', columns, rows, capped);
    return sendReportPdf(reply, 'dispatch-register', 'Dispatch register', columns, rows, capped);
  });

  fastify.get('/vehicle-loading-history', { preHandler: staffReports }, async (request, reply) => {
    const query = request.query as { vehicleId?: string; dateFrom?: string; dateTo?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = { status: 'CLOSED' };
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.dateFrom || query.dateTo) {
      where.closedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const sessions = await fastify.prisma.dispatchSession.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      include: {
        purchaseOrder: { include: { client: true } },
        vehicle: true,
      },
    });

    if (format === 'json') return reply.send(successResponse(sessions));

    const columns: ReportColumn[] = [
      { key: 'sessionCode', header: 'Session' },
      { key: 'closedAt', header: 'Closed' },
      { key: 'poNumber', header: 'PO' },
      { key: 'client', header: 'Client' },
      { key: 'vehicle', header: 'Vehicle' },
      { key: 'boxes', header: 'Scanned / Expected' },
    ];
    const flat = sessions.map((s) => ({
      sessionCode: s.sessionCode,
      closedAt: s.closedAt?.toISOString() ?? '',
      poNumber: s.purchaseOrder.poNumber,
      client: s.purchaseOrder.client.name,
      vehicle: s.vehicle.registrationNumber,
      boxes: `${s.totalBoxesScanned} / ${s.totalBoxesExpected}`,
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'vehicle-loading-history', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'vehicle-loading-history', 'Vehicle loading', columns, rows, capped);
    return sendReportPdf(reply, 'vehicle-loading-history', 'Vehicle loading history', columns, rows, capped);
  });

  fastify.get('/inventory-ledger', { preHandler: staffReports }, async (request, reply) => {
    const query = request.query as { variantId?: string; dateFrom?: string; dateTo?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (query.variantId) where.variantId = query.variantId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const ledger = await fastify.prisma.inventoryLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variant: { include: { product: true } },
        createdBy: { select: { name: true } },
      },
    });

    if (format === 'json') return reply.send(successResponse(ledger));

    const columns: ReportColumn[] = [
      { key: 'createdAt', header: 'When' },
      { key: 'type', header: 'Movement' },
      { key: 'product', header: 'Product' },
      { key: 'colour', header: 'Colour' },
      { key: 'boxes', header: 'Boxes' },
      { key: 'ref', header: 'Reference' },
      { key: 'by', header: 'By' },
    ];
    const flat = ledger.map((e) => ({
      createdAt: e.createdAt.toISOString(),
      type: e.movementType,
      product: e.variant.product.name,
      colour: e.variant.colourName,
      boxes: e.boxes,
      ref: `${e.referenceType}:${e.referenceId}`,
      by: e.createdBy?.name ?? '',
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'inventory-ledger', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'inventory-ledger', 'Inventory ledger', columns, rows, capped);
    return sendReportPdf(reply, 'inventory-ledger', 'Inventory ledger', columns, rows, capped);
  });

  fastify.get('/error-alert-log', { preHandler: staffReports }, async (request, reply) => {
    const query = request.query as { dateFrom?: string; dateTo?: string; sessionId?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = { result: { not: 'SUCCESS' } };
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.dateFrom || query.dateTo) {
      where.scannedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const events = await fastify.prisma.scanEvent.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      include: {
        session: { select: { sessionCode: true } },
        operator: { select: { name: true } },
      },
    });

    if (format === 'json') return reply.send(successResponse(events));

    const columns: ReportColumn[] = [
      { key: 'scannedAt', header: 'When' },
      { key: 'result', header: 'Result' },
      { key: 'barcode', header: 'Barcode' },
      { key: 'session', header: 'Session' },
      { key: 'operator', header: 'Operator' },
      { key: 'reason', header: 'Reason' },
    ];
    const flat = events.map((e) => ({
      scannedAt: e.scannedAt.toISOString(),
      result: e.result,
      barcode: e.scannedBarcode,
      session: e.session.sessionCode,
      operator: e.operator?.name ?? '',
      reason: e.errorReason ?? '',
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'error-alert-log', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'error-alert-log', 'Scan errors', columns, rows, capped);
    return sendReportPdf(reply, 'error-alert-log', 'Scan error / alert log', columns, rows, capped);
  });

  fastify.get('/pod-status', { preHandler: clientVisibleReports }, async (request, reply) => {
    const query = request.query as { status?: string; dateFrom?: string; dateTo?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const pods = await fastify.prisma.proofOfDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        session: {
          include: {
            purchaseOrder: { include: { client: true } },
            vehicle: true,
          },
        },
      },
    });

    if (format === 'json') return reply.send(successResponse(pods));

    const columns: ReportColumn[] = [
      { key: 'createdAt', header: 'Created' },
      { key: 'status', header: 'Status' },
      { key: 'poNumber', header: 'PO' },
      { key: 'client', header: 'Client' },
      { key: 'vehicle', header: 'Vehicle' },
      { key: 'ackAt', header: 'Acknowledged' },
    ];
    const flat = pods.map((p) => ({
      createdAt: p.createdAt.toISOString(),
      status: p.status,
      poNumber: p.session.purchaseOrder.poNumber,
      client: p.session.purchaseOrder.client.name,
      vehicle: p.session.vehicle.registrationNumber,
      ackAt: p.acknowledgedAt?.toISOString() ?? '',
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'pod-status', flat.length, capped);
    if (format === 'excel') return sendReportExcel(reply, 'pod-status', 'POD status', columns, rows, capped);
    return sendReportPdf(reply, 'pod-status', 'POD status', columns, rows, capped);
  });

  fastify.get('/tally-sync-log', { preHandler: staffReports }, async (request, reply) => {
    const query = request.query as { status?: string; direction?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;

    const jobs = await fastify.prisma.tallySyncJob.findMany({ where, orderBy: { createdAt: 'desc' } });
    if (format === 'json') return reply.send(successResponse(jobs));

    const columns: ReportColumn[] = [
      { key: 'createdAt', header: 'When' },
      { key: 'direction', header: 'Dir' },
      { key: 'dataType', header: 'Type' },
      { key: 'status', header: 'Status' },
      { key: 'error', header: 'Error / note' },
      { key: 'processedAt', header: 'Processed' },
    ];
    const flat = jobs.map((j) => ({
      createdAt: j.createdAt.toISOString(),
      direction: j.direction,
      dataType: j.dataType,
      status: j.status,
      error: j.errorMessage ?? j.tallyVoucherId ?? j.referenceId ?? '',
      processedAt: j.processedAt?.toISOString() ?? '',
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'tally-sync-log', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'tally-sync-log', 'Tally sync', columns, rows, capped);
    return sendReportPdf(reply, 'tally-sync-log', 'Tally sync log', columns, rows, capped);
  });

  fastify.get('/outstanding-pos', { preHandler: clientVisibleReports }, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const format = parseReportFormat(query);
    const orders = await fastify.prisma.purchaseOrder.findMany({
      where: { status: { in: ['CONFIRMED', 'PARTIALLY_LOADED', 'FULLY_LOADED'] } },
      orderBy: { expectedDispatchDate: 'asc' },
      include: {
        client: true,
        lineItems: { select: { orderedBoxes: true, loadedBoxes: true } },
      },
    });

    if (format === 'json') return reply.send(successResponse(orders));

    const columns: ReportColumn[] = [
      { key: 'poNumber', header: 'PO' },
      { key: 'status', header: 'Status' },
      { key: 'client', header: 'Client' },
      { key: 'expected', header: 'Expected dispatch' },
      { key: 'lines', header: 'Lines (loaded/ord)' },
    ];
    const flat = orders.map((o) => ({
      poNumber: o.poNumber,
      status: o.status,
      client: o.client.name,
      expected: o.expectedDispatchDate?.toISOString().slice(0, 10) ?? '',
      lines: o.lineItems.map((l) => `${l.loadedBoxes}/${l.orderedBoxes}`).join('; '),
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'outstanding-pos', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'outstanding-pos', 'Outstanding POs', columns, rows, capped);
    return sendReportPdf(reply, 'outstanding-pos', 'Outstanding POs', columns, rows, capped);
  });

  fastify.get('/client-dispatch-history', { preHandler: clientVisibleReports }, async (request, reply) => {
    const query = request.query as { clientId?: string };
    const format = parseReportFormat(query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (query.clientId) where.clientId = query.clientId;

    const orders = await fastify.prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        client: true,
        sessions: {
          include: {
            pod: { select: { status: true, acknowledgedAt: true } },
          },
        },
      },
    });

    if (format === 'json') return reply.send(successResponse(orders));

    const columns: ReportColumn[] = [
      { key: 'poNumber', header: 'PO' },
      { key: 'client', header: 'Client' },
      { key: 'status', header: 'PO status' },
      { key: 'sessions', header: 'Sessions / POD' },
    ];
    const flat = orders.map((o) => ({
      poNumber: o.poNumber,
      client: o.client.name,
      status: o.status,
      sessions: o.sessions
        .map(
          (s) =>
            `${s.sessionCode}:${s.pod?.status ?? '—'}${s.pod?.acknowledgedAt ? '@' + s.pod.acknowledgedAt.toISOString().slice(0, 10) : ''}`,
        )
        .join(' | '),
    }));
    const { rows, capped } = capExportRows(flat);
    logExportCapIfApplied(request.log, 'client-dispatch-history', flat.length, capped);
    if (format === 'excel')
      return sendReportExcel(reply, 'client-dispatch-history', 'Client dispatch', columns, rows, capped);
    return sendReportPdf(
      reply,
      'client-dispatch-history',
      'Client dispatch history',
      columns,
      rows,
      capped,
    );
  });
};
