import type { FastifyPluginAsync } from 'fastify';
import { successResponse, UserRole, AppError } from '@smartload/shared';
import { createGRNSchema, listGRNQuerySchema } from './grn.schema.js';
import { GRNService } from './grn.service.js';

export const grnRoutes: FastifyPluginAsync = async (fastify) => {
  const svc = () => new GRNService(fastify);

  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = listGRNQuerySchema.parse(request.query);
    const { grns, meta } = await svc().listGRNs(query);
    return reply.send(successResponse(grns, meta));
  });

  fastify.post(
    '/',
    {
      preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR),
    },
    async (request, reply) => {
      const dto = createGRNSchema.parse(request.body);
      const data = await svc().createGRN(dto, request.user.userId);
      return reply.code(201).send(successResponse(data));
    },
  );

  fastify.get(
    '/:id/pdf',
    {
      preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const detail = await svc().getGRNById(id);
        const pdf = await svc().generateGRNPdf(id);
        reply.header('Content-Type', 'application/pdf');
        reply.header(
          'Content-Disposition',
          `attachment; filename="GRN-${detail.grnNumber}.pdf"`,
        );
        return reply.send(pdf);
      } catch (e: unknown) {
        if (e instanceof AppError && e.statusCode === 404) {
          return reply.code(404).send({ success: false, data: null, error: e.message });
        }
        throw e;
      }
    },
  );

  fastify.get('/:id', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const grn = await svc().getGRNById(id);
      return reply.send(successResponse(grn));
    } catch (e: unknown) {
      if (e instanceof AppError && e.statusCode === 404) {
        return reply.code(404).send({ success: false, data: null, error: e.message });
      }
      throw e;
    }
  });
};
