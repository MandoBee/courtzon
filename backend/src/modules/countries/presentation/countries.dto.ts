import { z } from 'zod';

export const CreateCountrySchema = z.object({
  isoCode: z.string().length(2),
  isoCode3: z.string().length(3),
  name: z.string().min(1).max(100),
  nativeName: z.string().optional(),
  phoneCode: z.string().min(1).max(10),
  phoneMaxLength: z.number().int().optional().default(15),
  phoneMinLength: z.number().int().optional().default(7),
  defaultLocale: z.string().optional().default('en'),
  defaultCurrency: z.string().length(3),
  flagEmoji: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateCountrySchema = z.object({
  isoCode: z.string().length(2).optional(),
  isoCode3: z.string().length(3).optional(),
  name: z.string().min(1).max(100).optional(),
  nativeName: z.string().optional(),
  phoneCode: z.string().min(1).max(10).optional(),
  phoneMaxLength: z.number().int().optional(),
  phoneMinLength: z.number().int().optional(),
  defaultLocale: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
  flagEmoji: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
