import { z } from 'zod';

export const createSessionSchema = z.object({
  poId: z.string().cuid('Invalid PO ID'),
  vehicleId: z.string().cuid('Invalid Vehicle ID'),
  operatorId: z.string().cuid().optional(),
  notes: z.string().max(500).optional(),
});

export const closeSessionSchema = z
  .object({
    notes: z.string().max(1000).optional(),
    forcePartial: z.boolean().default(false),
    partialReason: z.string().max(500).optional(),
  })
  .refine((data) => !data.forcePartial || (!!data.partialReason && data.partialReason.length >= 10), {
    message: 'A reason of at least 10 characters is required for partial dispatch',
    path: ['partialReason'],
  });

export const processScanSchema = z.object({
  sessionId: z.string().cuid(),
  rawBarcode: z.string().min(1).max(2000),
  deviceId: z.string().max(100).optional(),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(25),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED', 'PAUSED']).optional(),
  vehicleId: z.string().optional(),
  poId: z.string().optional(),
  /** When status is not CLOSED, filters `openedAt`. When status is CLOSED, filters `closedAt` (calendar day if value is YYYY-MM-DD, server local). */
  dateFrom: z.string().optional(),
  /** See dateFrom — inclusive end of day for YYYY-MM-DD. */
  dateTo: z.string().optional(),
  /** When true with status=CLOSED, filter sessions closed on the server's local calendar day (start 00:00, end exclusive next day). */
  completedToday: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Filter sessions whose linked POD has this status (e.g. DISPUTED). */
  podStatus: z.enum(['PENDING', 'LINK_SENT', 'OTP_VERIFIED', 'ACKNOWLEDGED', 'DISPUTED', 'EXPIRED']).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type ProcessScanInput = z.infer<typeof processScanSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
