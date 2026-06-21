import { z } from 'zod';

export const SettlementQuerySchema = z.object({
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const ApproveSettlementSchema = z.object({
  settlementId: z.number().int().positive(),
  notes: z.string().optional(),
});
