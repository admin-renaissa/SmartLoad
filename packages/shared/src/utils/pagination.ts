import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/index.js'
import type { PaginationMeta, PaginationQuery } from '../types/api.js'

export function parsePagination(
  query: PaginationQuery
): { skip: number; take: number; page: number; limit: number } {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.limit) || DEFAULT_PAGE_SIZE))
  return { skip: (page - 1) * limit, take: limit, page, limit }
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit)
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}
