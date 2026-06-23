import { z } from 'zod';

export const SettlementQuerySchema = z.object({
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const RequestSettlementSchema = z.object({
  organisationId: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
});

export const ApproveSettlementSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const MarkPaidSchema = z.object({
  bankAccountId: z.number().int().positive().optional(),
  transferReference: z.string().max(200).optional(),
});

export const RejectSettlementSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const CancelSettlementSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const SettlementIdSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export const OrgIdSchema = z.object({
  organisationId: z.string().regex(/^\d+$/).transform(Number),
});
