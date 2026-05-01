import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AppError } from '@smartload/shared';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, 'Request error');

  if (error instanceof AppError) {
    const payload: Record<string, unknown> = {
      success: false,
      data: null,
      error: error.message,
    };
    if (error.code) payload.code = error.code;
    return reply.code(error.statusCode).send(payload);
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return reply.code(400).send({
      success: false,
      data: null,
      error: `Validation error: ${messages}`,
    });
  }

  // Prisma unique constraint violation
  if (error instanceof PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') || 'field';
      return reply.code(409).send({
        success: false,
        data: null,
        error: `Conflict: a record with this ${target} already exists`,
      });
    }
    if (error.code === 'P2025') {
      return reply.code(404).send({
        success: false,
        data: null,
        error: 'Record not found',
      });
    }
    if (error.code === 'P2003') {
      return reply.code(400).send({
        success: false,
        data: null,
        error: 'Invalid reference: related record does not exist',
      });
    }
  }

  // Fastify validation errors (schema)
  if ('validation' in error && error.validation) {
    return reply.code(400).send({
      success: false,
      data: null,
      error: `Validation error: ${error.message}`,
    });
  }

  // Status code errors
  if ('statusCode' in error && error.statusCode) {
    return reply.code(error.statusCode).send({
      success: false,
      data: null,
      error: error.message,
    });
  }

  // Default 500
  return reply.code(500).send({
    success: false,
    data: null,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
  });
}
