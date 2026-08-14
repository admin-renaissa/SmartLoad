import { z } from 'zod';
import { MovementType } from '@smartload/shared';

const optionalQueryBool = z.preprocess((val) => {
  if (val === undefined || val === '') return undefined;
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return undefined;
}, z.boolean().optional());

export const listStockQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
  categoryId: z.string().optional(),
  variantId: z.string().optional(),
  lowStockOnly: optionalQueryBool,
  outOfStock: optionalQueryBool,
  search: z.string().optional(),
  sortBy: z.enum(['productName', 'availableBoxes', 'totalBoxes', 'sku']).default('productName'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  type: z.nativeEnum(MovementType).optional(),
});

export const adjustStockSchema = z.object({
  boxes: z.number().int().refine((n) => n !== 0, 'Adjustment cannot be zero'),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
  notes: z.string().max(500).optional(),
});

export const transferStockSchema = z.object({
  fromVariantId: z.string().cuid(),
  toVariantId: z.string().cuid(),
  boxes: z.number().int().positive(),
  reason: z.string().min(10).max(500),
});

export const stockImportRowSchema = z.object({
  sku: z.string().min(2).transform((s) => s.toUpperCase()),
  colourCode: z.string().min(2).transform((s) => s.toUpperCase()),
  totalBoxes: z.coerce.number().int().min(0),
  notes: z.string().optional(),
});

export type ListStockQuery = z.infer<typeof listStockQuerySchema>;
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type StockImportRow = z.infer<typeof stockImportRowSchema>;
