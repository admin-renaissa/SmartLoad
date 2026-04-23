export enum SyncDirection {
  PULL = 'PULL',
  PUSH = 'PUSH',
}

export enum SyncStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PERMANENTLY_FAILED = 'PERMANENTLY_FAILED',
  RETRYING = 'RETRYING',
}

export interface TallySyncJob {
  id: string;
  direction: SyncDirection;
  dataType: string;
  status: SyncStatus;
  referenceId?: string | null;
  tallyVoucherId?: string | null;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  attempts: number;
  nextRetryAt?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
