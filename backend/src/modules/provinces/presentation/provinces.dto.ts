import { z } from 'zod';

export const CreateProvinceSchema = z.object({
  countryId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  nativeName: z.string().optional(),
  code: z.string().optional(),
  type: z.enum(['province', 'state', 'governorate', 'region', 'emirate', 'county']).optional().default('province'),
  navigationPolygon: z.any().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateProvinceSchema = z.object({
  countryId: z.number().int().positive().optional(),
  name: z.string().min(1).max(120).optional(),
  nativeName: z.string().optional(),
  code: z.string().optional(),
  type: z.enum(['province', 'state', 'governorate', 'region', 'emirate', 'county']).optional(),
  navigationPolygon: z.any().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
