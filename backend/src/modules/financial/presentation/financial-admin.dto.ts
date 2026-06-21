import { z } from 'zod';

export const WithdrawalRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'completed', 'cancelled']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const WithdrawalActionSchema = z.object({
  id: z.number().int().positive(),
  notes: z.string().optional(),
});
