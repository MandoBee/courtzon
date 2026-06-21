import { z } from 'zod';

export const CreateCitySchema = z.object({
  provinceId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  nativeName: z.string().optional(),
  navigationPolygon: z.any().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateCitySchema = z.object({
  provinceId: z.number().int().positive().optional(),
  name: z.string().min(1).max(120).optional(),
  nativeName: z.string().optional(),
  navigationPolygon: z.any().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
