import { z } from 'zod';

export const SettlementPreviewQuerySchema = z.object({
  orgId: z.coerce.number().int().positive(),
  exclude: z.string().optional().transform((v) => (v ? v.split(',').map(Number).filter(Boolean) : [])),
});

export const CreateSettlementSchema = z.object({
  orgId: z.number().int().positive(),
  excludeEntitlementIds: z.array(z.number().int().positive()).optional(),
  selectedEntitlementIds: z.array(z.number().int().positive()).optional(),
  batchCode: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const RecordPaymentSchema = z.object({
  paymentMethod: z.string().trim().max(50).optional(),
  paymentReference: z.string().trim().max(255).optional(),
  paidAmount: z.number().nonnegative().optional(),
});

export const CancelSettlementSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const SettlementListQuerySchema = z.object({
  status: z.string().optional(),
  orgId: z.coerce.number().int().positive().optional(),
  batchCode: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});