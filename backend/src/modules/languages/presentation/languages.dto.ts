import { z } from 'zod';

export const CreateLanguageSchema = z.object({
  code: z.string().min(2).max(5),
  name: z.string().min(1).max(50),
  nativeName: z.string().min(1).max(50),
  isRtl: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateLanguageSchema = z.object({
  code: z.string().min(2).max(5).optional(),
  name: z.string().min(1).max(50).optional(),
  nativeName: z.string().min(1).max(50).optional(),
  isRtl: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
