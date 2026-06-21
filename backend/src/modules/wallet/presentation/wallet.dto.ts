import { z } from 'zod';

export const DepositSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1).optional().default('card'),
  returnUrl: z.string().optional(),
});

export const WithdrawSchema = z.object({
  amount: z.number().positive(),
  branchFinancialDetailsId: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const TransferSchema = z.object({
  toUserId: z.number().int().positive(),
  amount: z.number().positive(),
  notes: z.string().optional(),
});

export const WalletQuerySchema = z.object({
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type DepositInput = z.infer<typeof DepositSchema>;
export type WithdrawInput = z.infer<typeof WithdrawSchema>;
export type TransferInput = z.infer<typeof TransferSchema>;
