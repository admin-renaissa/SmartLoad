import { z } from 'zod';

export const dateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

export const grnLineItemSchema = z.object({
  variantId: z.string().cuid('Invalid variant ID'),
  receivedBoxes: z.number().int().positive('Must receive at least 1 box'),
  notes: z.string().max(200).optional(),
});

export const createGRNSchema = z.object({
  receivedDate: dateYmdSchema,
  notes: z.string().max(1000).optional(),
  lineItems: z
    .array(grnLineItemSchema)
    .min(1, 'At least one item required')
    .max(100, 'Maximum 100 items per GRN')
    .refine(
      (items) => new Set(items.map((i) => i.variantId)).size === items.length,
      'Duplicate variants in GRN — consolidate into one row per variant',
    ),
});

export const listGRNQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(25),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

export type CreateGRNInput = z.infer<typeof createGRNSchema>;
export type ListGRNQuery = z.infer<typeof listGRNQuerySchema>;
