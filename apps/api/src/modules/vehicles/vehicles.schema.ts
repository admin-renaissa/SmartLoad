import { z } from 'zod';
import { VehicleType } from '@smartload/shared';

export const indianRegPlateSchema = z
  .string()
  .min(6)
  .max(15)
  .transform((s) => s.trim().toUpperCase())
  .refine(
    (v) => /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(v),
    'Invalid Indian vehicle registration number (e.g. MH12AB1234)',
  );

export const createVehicleSchema = z.object({
  registrationNumber: indianRegPlateSchema,
  type: z.nativeEnum(VehicleType),
  capacityKg: z.number().positive().optional(),
  driverName: z.string().min(2).max(100),
  driverPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
});

export const updateVehicleSchema = createVehicleSchema.partial().omit({ registrationNumber: true });

export const listVehiclesQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(25),
  isActive: z.preprocess((v) => {
    if (v === undefined || v === '') return undefined;
    if (v === 'true' || v === true) return true;
    if (v === 'false' || v === false) return false;
    return undefined;
  }, z.boolean().optional()),
  type: z.nativeEnum(VehicleType).optional(),
  search: z.string().optional(),
});

export const vehicleHistoryQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(25),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
export type VehicleHistoryQuery = z.infer<typeof vehicleHistoryQuerySchema>;
