import type { FastifyInstance } from 'fastify';
import type { Namespace, Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { SessionService } from './session.service.js';
import type { CloseSessionInput, ProcessScanInput } from './session.schema.js';

export function registerScanGateway(app: FastifyInstance): void {
  const io: Namespace = app.io.of('/scan');

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = app.jwt.verify<{ userId: string; email: string; role: UserRole }>(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    app.log.info({ socketId: socket.id, userId: socket.data.userId }, 'Scan socket connected');

    const heartbeat = setInterval(() => {
      socket.emit('ping');
    }, 30_000);

    socket.on('pong', () => {});

    socket.on('session:join', async (data: { sessionId: string }) => {
      try {
        const svc = new SessionService(app);
        const session = await svc.getSessionById(data.sessionId);

        const userId = socket.data.userId as string;
        const role = socket.data.role as UserRole;
        const hasAccess =
          session.supervisorId === userId ||
          session.operatorId === userId ||
          role === UserRole.ADMIN ||
          role === UserRole.ACCOUNTS;

        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to this session' });
          return;
        }

        const roomName = `session:${data.sessionId}`;
        await socket.join(roomName);

        socket.emit('session:state', session);

        socket.to(roomName).emit('session:alert', {
          type: 'USER_JOINED',
          message: `${role} connected to session`,
        });

        app.log.info({ sessionId: data.sessionId, userId, room: roomName }, 'User joined scan session room');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join session';
        socket.emit('error', { message });
      }
    });

    socket.on(
      'scan:submit',
      async (data: { sessionId: string; rawBarcode: string; deviceId?: string }) => {
        try {
          const svc = new SessionService(app);
          const input: ProcessScanInput = {
            sessionId: data.sessionId,
            rawBarcode: data.rawBarcode,
            deviceId: data.deviceId,
          };

          const result = await svc.processScan(input, socket.data.userId as string);

          // Bump lastSeenAt for registered devices submitting via socket
          if (data.deviceId) {
            app.prisma.scannerDevice
              .updateMany({
                where: { serialNumber: data.deviceId, isActive: true },
                data: { lastSeenAt: new Date() },
              })
              .catch((err: unknown) => app.log.warn({ err }, 'Failed to update device lastSeenAt'));
          }

          const roomName = `session:${data.sessionId}`;
          io.to(roomName).emit('scan:result', result);

          if (result.sessionProgress.percentComplete === 100) {
            io.to(roomName).emit('session:complete', {
              message:
                'All items have been scanned! Supervisor can now close the session.',
              scanned: result.sessionProgress.scanned,
              expected: result.sessionProgress.expected,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Scan processing failed';
          socket.emit('error', { message });
        }
      },
    );

    socket.on(
      'session:close',
      async (data: {
        sessionId: string;
        notes?: string;
        forcePartial?: boolean;
        partialReason?: string;
      }) => {
        try {
          const role = socket.data.role as UserRole;
          if (role !== UserRole.ADMIN && role !== UserRole.SUPERVISOR) {
            socket.emit('error', { message: 'Only supervisor or admin can close via socket' });
            return;
          }

          const body: CloseSessionInput = {
            notes: data.notes,
            forcePartial: data.forcePartial ?? false,
            partialReason: data.partialReason,
          };

          const closed = await new SessionService(app).closeSession(
            data.sessionId,
            socket.data.userId as string,
            body,
          );

          const roomName = `session:${data.sessionId}`;
          io.to(roomName).emit('session:closed', {
            sessionCode: closed.sessionCode,
            closedAt: closed.closedAt,
            totalBoxesLoaded: closed.totalBoxesScanned,
            isPartialDispatch: closed.isPartialDispatch,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to close session';
          socket.emit('error', { message });
        }
      },
    );

    socket.on('session:leave', async (data: { sessionId: string }) => {
      await socket.leave(`session:${data.sessionId}`);
    });

    socket.on('disconnect', (reason) => {
      clearInterval(heartbeat);
      app.log.info(
        { socketId: socket.id, userId: socket.data.userId, reason },
        'Scan socket disconnected',
      );
    });
  });

  app.log.info('Scan WebSocket gateway registered at /scan namespace');
}
