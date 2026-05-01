import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@smartload/shared';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: JwtPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const authPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({
        success: false,
        data: null,
        error: 'Unauthorized — invalid or expired token',
      });
    }
  });

  fastify.decorate('requireRole', (...roles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        if (!roles.includes(request.user.role)) {
          reply.code(403).send({
            success: false,
            data: null,
            error: `Forbidden — requires one of: ${roles.join(', ')}`,
          });
        }
      } catch {
        reply.code(401).send({
          success: false,
          data: null,
          error: 'Unauthorized — invalid or expired token',
        });
      }
    };
  });
};

export const authPlugin = fp(authPluginImpl, {
  name: 'auth',
  dependencies: ['@fastify/jwt'],
});
