import { z } from 'zod';

export const RefundLineSchema = z.object({
  lineType: z.string().min(1).max(30),
  sourceId: z.number().int().positive(),
  canceledValueCents: z.number().int().nonnegative(),
  approvedCents: z.number().int().nonnegative(),
});

export const CreateRefundCaseSchema = z.object({
  domain: z.enum(['booking', 'tournament', 'academy', 'marketplace', 'membership']),
  sourceType: z.string().min(1).max(50),
  sourceId: z.number().int().positive(),
  originalPaymentId: z.number().int().positive().nullable().optional(),
  organisationId: z.number().int().positive(),
  reason: z.string().min(3).max(500),
  currency: z.string().length(3).optional(),
  policySnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  feeCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(100),
  lines: z.array(RefundLineSchema).min(1),
});

export const RejectRefundCaseSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const RecordPayoutSchema = z.object({
  method: z.enum(['cash', 'bank_transfer']),
  amountCents: z.number().int().positive(),
  reference: z.string().max(255).optional().nullable(),
  evidenceUrl: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(100),
});

export const FailPayoutSchema = z.object({
  reason: z.string().min(3).max(500),
});
