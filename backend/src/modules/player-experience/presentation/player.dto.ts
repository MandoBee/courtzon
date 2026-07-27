import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const FavoriteQuerySchema = z.object({
  type: z.enum(['club', 'coach']).optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type FavoriteQuery = z.infer<typeof FavoriteQuerySchema>;
