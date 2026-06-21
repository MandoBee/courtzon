import { z } from 'zod';

export const CreateCurrencySchema = z.object({
  code: z.string().length(3),
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
  decimalPlaces: z.number().int().optional().default(2),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateCurrencySchema = z.object({
  code: z.string().length(3).optional(),
  name: z.string().min(1).max(50).optional(),
  symbol: z.string().min(1).max(10).optional(),
  decimalPlaces: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
