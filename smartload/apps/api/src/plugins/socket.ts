import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Server as SocketServer } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketServer;
  }
}

const socketPluginImpl: FastifyPluginAsync = async (fastify) => {
  const io = new SocketServer(fastify.server, {
    cors: {
      origin: process.env.APP_BASE_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
  });

  fastify.decorate('io', io);

  // Scan namespace
  const scanNamespace = io.of('/scan');

  scanNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = fastify.jwt.verify<{ userId: string; role: string; email: string; name: string }>(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  scanNamespace.on('connection', (socket) => {
    fastify.log.info({ socketId: socket.id, userId: socket.data.user?.userId }, 'Scan socket connected');

    socket.on('session:join', async ({ sessionId }: { sessionId: string }) => {
      socket.join(`session:${sessionId}`);
      socket.emit('session:joined', { sessionId });
      fastify.log.info({ socketId: socket.id, sessionId }, 'Joined session room');
    });

    socket.on('scan:submit', async ({ sessionId, rawBarcode, deviceId }: {
      sessionId: string;
      rawBarcode: string;
      deviceId?: string;
    }) => {
      try {
        const { SessionService } = await import('../modules/dispatch/session.service.js');
        const service = new SessionService(fastify.prisma, fastify.redis);
        const result = await service.processScan(sessionId, rawBarcode, socket.data.user.userId, deviceId);

        scanNamespace.to(`session:${sessionId}`).emit('scan:result', result);
      } catch (err) {
        socket.emit('scan:error', {
          message: err instanceof Error ? err.message : 'Scan processing failed',
        });
      }
    });

    socket.on('disconnect', () => {
      fastify.log.info({ socketId: socket.id }, 'Scan socket disconnected');
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      socket.emit('ping');
    }, 30000);

    socket.on('pong', () => {});
    socket.on('disconnect', () => clearInterval(heartbeat));
  });

  fastify.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
};

export const socketPlugin = fp(socketPluginImpl, {
  name: 'socket',
  dependencies: ['@fastify/jwt'],
});
