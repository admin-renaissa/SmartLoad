import type { TallySyncDirection, TallySyncDataType, TallySyncStatus } from './enums.js'

export interface TallySyncJob {
  id: string
  direction: TallySyncDirection
  dataType: TallySyncDataType
  status: TallySyncStatus
  referenceId?: string | null
  tallyVoucherId?: string | null
  requestPayload?: Record<string, unknown> | null
  responsePayload?: Record<string, unknown> | null
  errorMessage?: string | null
  attempts: number
  nextRetryAt?: string | null
  processedAt?: string | null
  createdAt: string
  updatedAt: string
}
