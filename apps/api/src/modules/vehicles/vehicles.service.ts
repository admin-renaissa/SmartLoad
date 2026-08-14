import type { FastifyInstance } from 'fastify';
import { SessionStatus } from '@prisma/client';
import { AppError, parsePagination, buildPaginationMeta } from '@smartload/shared';
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  ListVehiclesQuery,
  VehicleHistoryQuery,
} from './vehicles.schema.js';

export class VehicleService {
  constructor(private readonly app: FastifyInstance) {}

  async createVehicle(input: CreateVehicleInput) {
    const reg = input.registrationNumber.trim().toUpperCase();
    const existing = await this.app.prisma.vehicle.findUnique({
      where: { registrationNumber: reg },
    });
    if (existing) {
      throw new AppError(`Vehicle ${reg} is already registered.`, 409, 'VEHICLE_EXISTS');
    }

    return this.app.prisma.vehicle.create({
      data: {
        registrationNumber: reg,
        type: input.type,
        capacityKg: input.capacityKg ?? null,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        isActive: true,
      },
    });
  }

  async listVehicles(query: ListVehiclesQuery) {
    const { skip, take, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.type) where.type = query.type;
    if (query.search)
      where.OR = [
        { registrationNumber: { contains: query.search, mode: 'insensitive' } },
        { driverName: { contains: query.search, mode: 'insensitive' } },
      ];

    const [vehicles, total] = await Promise.all([
      this.app.prisma.vehicle.findMany({
        where,
        skip,
        take,
        orderBy: { registrationNumber: 'asc' },
        include: {
          dispatchSessions: {
            where: { status: SessionStatus.OPEN },
            take: 1,
            include: {
              purchaseOrder: { include: { client: true } },
              supervisor: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.app.prisma.vehicle.count({ where }),
    ]);

    const enriched = vehicles.map((v) => ({
      ...v,
      isAvailable: v.dispatchSessions.length === 0,
      currentSession: v.dispatchSessions[0] ?? null,
      dispatchSessions: undefined,
    }));

    return { vehicles: enriched, meta: buildPaginationMeta(total, page, take) };
  }

  async getAvailableVehicles() {
    const allVehicles = await this.app.prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        dispatchSessions: {
          where: { status: SessionStatus.OPEN },
          take: 1,
        },
      },
    });

    return allVehicles
      .filter((v) => v.dispatchSessions.length === 0)
      .map(({ dispatchSessions: _ds, ...v }) => v);
  }

  async getVehicleById(id: string) {
    const vehicle = await this.app.prisma.vehicle.findUnique({
      where: { id },
      include: {
        dispatchSessions: {
          where: { status: SessionStatus.OPEN },
          take: 1,
          include: { purchaseOrder: { include: { client: true } } },
        },
      },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404);

    const [totalSessions, agg] = await Promise.all([
      this.app.prisma.dispatchSession.count({
        where: { vehicleId: id, status: SessionStatus.CLOSED },
      }),
      this.app.prisma.dispatchSession.aggregate({
        where: { vehicleId: id, status: SessionStatus.CLOSED },
        _sum: { totalBoxesScanned: true },
      }),
    ]);

    return {
      ...vehicle,
      isAvailable: vehicle.dispatchSessions.length === 0,
      currentSession: vehicle.dispatchSessions[0] ?? null,
      dispatchSessions: undefined,
      stats: {
        totalDispatches: totalSessions,
        totalBoxesMoved: agg._sum.totalBoxesScanned ?? 0,
      },
    };
  }

  async updateVehicle(id: string, input: UpdateVehicleInput) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new AppError('Vehicle not found', 404);

    return this.app.prisma.vehicle.update({
      where: { id },
      data: input,
    });
  }

  async deactivateVehicle(id: string) {
    const vehicle = await this.app.prisma.vehicle.findUnique({
      where: { id },
      include: {
        dispatchSessions: { where: { status: SessionStatus.OPEN } },
      },
    });
    if (!vehicle) throw new AppError('Vehicle not found', 404);

    if (vehicle.dispatchSessions.length > 0) {
      const code = vehicle.dispatchSessions[0].sessionCode;
      throw new AppError(
        `Cannot deactivate vehicle with an open dispatch session (${code}). Close the session first.`,
        409,
        'VEHICLE_IN_USE',
      );
    }

    return this.app.prisma.vehicle.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getVehicleHistory(id: string, query: VehicleHistoryQuery) {
    const vehicle = await this.app.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new AppError('Vehicle not found', 404);

    const { skip, take, page } = parsePagination(query);

    const where: Record<string, unknown> = {
      vehicleId: id,
      status: SessionStatus.CLOSED,
    };
    if (query.dateFrom || query.dateTo) {
      where.closedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [sessions, total, sumAgg, allForClients, durRows] = await Promise.all([
      this.app.prisma.dispatchSession.findMany({
        where,
        skip,
        take,
        orderBy: { closedAt: 'desc' },
        include: {
          purchaseOrder: { include: { client: true } },
          supervisor: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
          _count: { select: { scanEvents: true } },
        },
      }),
      this.app.prisma.dispatchSession.count({ where }),
      this.app.prisma.dispatchSession.aggregate({
        where,
        _sum: { totalBoxesScanned: true },
      }),
      this.app.prisma.dispatchSession.findMany({
        where,
        select: {
          purchaseOrder: { select: { client: { select: { name: true } } } },
        },
      }),
      this.app.prisma.dispatchSession.findMany({
        where,
        select: { openedAt: true, closedAt: true },
      }),
    ]);

    const enriched = sessions.map((s) => {
      const durationMs =
        s.closedAt && s.openedAt ? new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime() : null;
      const durationMinutes = durationMs ? Math.round(durationMs / 60000) : null;

      return {
        ...s,
        durationMinutes,
        client: s.purchaseOrder.client.name,
        poNumber: s.purchaseOrder.poNumber,
      };
    });

    const clientCounts = new Map<string, number>();
    for (const row of allForClients) {
      const n = row.purchaseOrder.client.name;
      clientCounts.set(n, (clientCounts.get(n) ?? 0) + 1);
    }
    let mostFrequentClient = '—';
    let maxC = 0;
    for (const [name, c] of clientCounts) {
      if (c > maxC) {
        maxC = c;
        mostFrequentClient = name;
      }
    }

    const durs = durRows
      .map((r) => {
        if (!r.closedAt) return null;
        return Math.round((new Date(r.closedAt).getTime() - new Date(r.openedAt).getTime()) / 60000);
      })
      .filter((x): x is number => x != null);
    const avgDurationMin =
      durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

    const stats = {
      totalSessions: total,
      totalBoxesMoved: sumAgg._sum.totalBoxesScanned ?? 0,
      avgDurationMin,
      mostFrequentClient,
    };

    return {
      vehicle,
      sessions: enriched,
      stats,
      meta: buildPaginationMeta(total, page, take),
    };
  }
}
