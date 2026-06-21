import { z } from 'zod';

export const TransactionQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type TransactionQuery = z.infer<typeof TransactionQuerySchema>;
