import { z } from 'zod';

export const RevenueQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const LedgerQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  accountType: z.string().optional(),
});

export type RevenueQuery = z.infer<typeof RevenueQuerySchema>;
export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;
