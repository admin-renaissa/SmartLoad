import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildPaginationMeta, parsePagination, successResponse, UserRole } from '@smartload/shared';

const VALID_DRIVERS = ['hid-keyboard', 'serial', 'zebra-datawedge', 'camera'] as const;

export const DEVICE_TYPES = [
  'BARCODE_SCANNER',    // Generic USB / BT wedge barcode gun
  'BLUETOOTH_SCANNER',  // Wireless Bluetooth pistol scanner
  'ZEBRA_HANDHELD',     // Zebra TC/MC series Android handheld
  'ZEBRA_FIXED',        // Zebra fixed-mount / presentation scanner
  'ANDROID_DEVICE',     // Generic Android with DataWedge
  'MOBILE_CAMERA',      // Phone / tablet camera
  'DESKTOP_CAMERA',     // Webcam
  'SERIAL_SCANNER',     // RS-232 connected scanner
] as const;

const createDeviceSchema = z.object({
  name: z.string().min(2).max(100),
  serialNumber: z.string().min(1).max(200),
  driverName: z.enum(VALID_DRIVERS),
  deviceType: z.enum(DEVICE_TYPES).default('BARCODE_SCANNER'),
  ipAddress: z.string().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

const updateDeviceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  deviceType: z.enum(DEVICE_TYPES).optional(),
  ipAddress: z.string().optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
});

export const deviceRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/devices/drivers — list available HAL driver types
  fastify.get(
    '/drivers',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (_request, reply) => {
      const drivers = fastify.hal.listDrivers();
      return reply.send(successResponse(drivers));
    },
  );

  // GET /api/v1/devices/types — list available physical device types
  fastify.get(
    '/types',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (_request, reply) => {
      const labels: Record<string, string> = {
        BARCODE_SCANNER:   'Barcode Scanner (USB / Keyboard Wedge)',
        BLUETOOTH_SCANNER: 'Bluetooth Scanner',
        ZEBRA_HANDHELD:    'Zebra Handheld (TC/MC series)',
        ZEBRA_FIXED:       'Zebra Fixed / Presentation Scanner',
        ANDROID_DEVICE:    'Android Device with DataWedge',
        MOBILE_CAMERA:     'Mobile Camera',
        DESKTOP_CAMERA:    'Desktop / Webcam',
        SERIAL_SCANNER:    'RS-232 Serial Scanner',
      };
      return reply.send(successResponse(DEVICE_TYPES.map((t) => ({ value: t, label: labels[t] ?? t }))));
    },
  );

  // GET /api/v1/devices — paginated device list
  fastify.get(
    '/',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const query = request.query as {
        page?: string;
        limit?: string;
        search?: string;
        driverName?: string;
        deviceType?: string;
        isActive?: string;
      };

      const { page, limit, skip } = parsePagination({
        page: Number(query.page),
        limit: Number(query.limit),
      });

      const where: Record<string, unknown> = {};

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { serialNumber: { contains: query.search, mode: 'insensitive' } },
          { location: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      if (query.driverName) where.driverName = query.driverName;
      if (query.deviceType) where.deviceType = query.deviceType;
      if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

      const [devices, total] = await Promise.all([
        fastify.prisma.scannerDevice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            registeredBy: { select: { id: true, name: true, email: true } },
          },
        }),
        fastify.prisma.scannerDevice.count({ where }),
      ]);

      return reply.send(successResponse(devices, buildPaginationMeta(total, page, limit)));
    },
  );

  // GET /api/v1/devices/:id — single device with lifetime stats
  fastify.get(
    '/:id',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const device = await fastify.prisma.scannerDevice.findUnique({
        where: { id },
        include: { registeredBy: { select: { id: true, name: true, email: true } } },
      });
      if (!device) {
        return reply.code(404).send({ success: false, data: null, error: 'Device not found' });
      }

      const [totalScans, successScans, sessionCount] = await Promise.all([
        fastify.prisma.scanEvent.count({ where: { deviceId: device.serialNumber } }),
        fastify.prisma.scanEvent.count({ where: { deviceId: device.serialNumber, result: 'SUCCESS' } }),
        fastify.prisma.scanEvent.groupBy({
          by: ['sessionId'],
          where: { deviceId: device.serialNumber },
          _count: true,
        }).then((r) => r.length),
      ]);

      const firstScan = totalScans > 0
        ? await fastify.prisma.scanEvent.findFirst({
            where: { deviceId: device.serialNumber },
            orderBy: { scannedAt: 'asc' },
            select: { scannedAt: true },
          })
        : null;

      return reply.send(successResponse({
        ...device,
        stats: {
          totalScans,
          successScans,
          errorScans: totalScans - successScans,
          successRate: totalScans > 0 ? Math.round((successScans / totalScans) * 100) : null,
          totalSessions: sessionCount,
          firstUsedAt: firstScan?.scannedAt ?? null,
        },
      }));
    },
  );

  // GET /api/v1/devices/:id/history — paginated scan events for this device
  fastify.get(
    '/:id/history',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = historyQuerySchema.parse(request.query);
      const skip = (q.page - 1) * q.limit;

      const device = await fastify.prisma.scannerDevice.findUnique({
        where: { id },
        select: { serialNumber: true },
      });
      if (!device) {
        return reply.code(404).send({ success: false, data: null, error: 'Device not found' });
      }

      const where = { deviceId: device.serialNumber };

      const [events, total] = await Promise.all([
        fastify.prisma.scanEvent.findMany({
          where,
          skip,
          take: q.limit,
          orderBy: { scannedAt: 'desc' },
          include: {
            operator: { select: { id: true, name: true } },
            resolvedVariant: { include: { product: { select: { id: true, name: true } } } },
            session: {
              select: {
                id: true,
                sessionCode: true,
                status: true,
                purchaseOrder: {
                  select: {
                    poNumber: true,
                    client: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.scanEvent.count({ where }),
      ]);

      return reply.send(successResponse(events, buildPaginationMeta(total, q.page, q.limit)));
    },
  );

  // GET /api/v1/devices/:id/sessions — distinct dispatch sessions this device participated in
  fastify.get(
    '/:id/sessions',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const device = await fastify.prisma.scannerDevice.findUnique({
        where: { id },
        select: { serialNumber: true },
      });
      if (!device) {
        return reply.code(404).send({ success: false, data: null, error: 'Device not found' });
      }

      // get distinct sessionIds where this device contributed scans
      const grouped = await fastify.prisma.scanEvent.groupBy({
        by: ['sessionId'],
        where: { deviceId: device.serialNumber },
        _count: { _all: true },
        orderBy: { _count: { sessionId: 'desc' } },
      });

      const sessionIds = grouped.map((g) => g.sessionId);
      const scanCountBySession = Object.fromEntries(grouped.map((g) => [g.sessionId, g._count._all]));

      const sessions = await fastify.prisma.dispatchSession.findMany({
        where: { id: { in: sessionIds } },
        orderBy: { openedAt: 'desc' },
        include: {
          purchaseOrder: {
            select: {
              poNumber: true,
              client: { select: { id: true, name: true } },
            },
          },
          vehicle: { select: { registrationNumber: true } },
          supervisor: { select: { id: true, name: true } },
        },
      });

      return reply.send(
        successResponse(
          sessions.map((s) => ({ ...s, deviceScanCount: scanCountBySession[s.id] ?? 0 })),
        ),
      );
    },
  );

  // POST /api/v1/devices — register new device
  fastify.post(
    '/',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const dto = createDeviceSchema.parse(request.body);

      const existing = await fastify.prisma.scannerDevice.findUnique({
        where: { serialNumber: dto.serialNumber },
      });
      if (existing) {
        return reply.code(409).send({
          success: false,
          data: null,
          error: `A device with serial number "${dto.serialNumber}" is already registered`,
        });
      }

      const device = await fastify.prisma.scannerDevice.create({
        data: { ...dto, registeredById: request.user.userId },
        include: {
          registeredBy: { select: { id: true, name: true, email: true } },
        },
      });

      return reply.code(201).send(successResponse(device));
    },
  );

  // PATCH /api/v1/devices/:id — update device metadata
  fastify.patch(
    '/:id',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const dto = updateDeviceSchema.parse(request.body);

      const existing = await fastify.prisma.scannerDevice.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ success: false, data: null, error: 'Device not found' });
      }

      const updated = await fastify.prisma.scannerDevice.update({
        where: { id },
        data: dto,
        include: {
          registeredBy: { select: { id: true, name: true, email: true } },
        },
      });

      return reply.send(successResponse(updated));
    },
  );

  // DELETE /api/v1/devices/:id — soft-deactivate
  fastify.delete(
    '/:id',
    { preHandler: fastify.requireRole(UserRole.ADMIN) },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await fastify.prisma.scannerDevice.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ success: false, data: null, error: 'Device not found' });
      }

      await fastify.prisma.scannerDevice.update({ where: { id }, data: { isActive: false } });

      return reply.send(successResponse({ message: 'Device deactivated' }));
    },
  );
};
