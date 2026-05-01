import type { ApiResponse, PaginationMeta } from '../types/api.js';

export function successResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    ...(meta ? { meta } : {}),
  };
}

export function errorResponse(message: string, _code?: string): ApiResponse<null> {
  return {
    success: false,
    data: null,
    error: message,
  };
}
