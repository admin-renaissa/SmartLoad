export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
  meta?: PaginationMeta
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface PaginationQuery {
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}
