import { z } from 'zod';

export const CreateTranslationSchema = z.object({
  key: z.string().min(1, 'Key is required').max(500),
  locale: z.string().min(1).max(5),
  value: z.string().max(65535),
  isAuto: z.boolean().optional().default(false),
});

export const UpdateTranslationSchema = z.object({
  value: z.string().max(65535).optional(),
  isAuto: z.boolean().optional(),
});

export const UpsertTranslationSchema = z.object({
  key: z.string().min(1).max(500),
  locale: z.string().min(1).max(5),
  value: z.string().max(65535),
  isAuto: z.boolean().optional().default(false),
});

export const ListTranslationsQuerySchema = z.object({
  locale: z.string().optional(),
  search: z.string().optional(),
});

export const GridQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  module: z.string().optional(),
  elementType: z.string().optional(),
});

export const LocalePackSchema = z.object({
  locale: z.string().min(2).max(5),
});
