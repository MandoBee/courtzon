import { z } from 'zod';

export const CreateAmenitySchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameAr: z.string().min(1).max(200),
  icon: z.string().max(100).optional().default(''),
  category: z.enum(['facilities', 'equipment', 'accessibility', 'convenience', 'services']).optional().default('facilities'),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateAmenitySchema = z.object({
  nameEn: z.string().min(1).max(200).optional(),
  nameAr: z.string().min(1).max(200).optional(),
  icon: z.string().max(100).optional(),
  category: z.enum(['facilities', 'equipment', 'accessibility', 'convenience', 'services']).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
