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

export const CreateSettlementSchema = z.object({
  batchType: z.enum(['daily', 'weekly', 'monthly', 'manual']),
  periodStart: z.string(),
  periodEnd: z.string(),
  organisationId: z.number().int().positive().optional(),
});

export type RevenueQuery = z.infer<typeof RevenueQuerySchema>;
export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;
export type CreateSettlementInput = z.infer<typeof CreateSettlementSchema>;
