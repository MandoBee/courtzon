import { z } from 'zod';

export const ChargeSchema = z.object({
  referenceType: z.enum(['booking', 'order', 'subscription', 'wallet_topup', 'booking_intent']),
  referenceId: z.number().int().positive(),
  amount: z.number().positive(),
  currency: z.string().optional().default('EGP'),
  paymentMethod: z.enum(['wallet', 'card', 'bank_transfer']).optional().default('wallet'),
  returnUrl: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
  customerAddress: z.any().optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export const ConfirmPaymentSchema = z.object({
  paymentId: z.number().int().positive(),
});

export const RefundPaymentSchema = z.object({
  transactionId: z.number().int().positive(),
  amount: z.number().positive(),
  reason: z.string().optional(),
});

export type ChargeInput = z.infer<typeof ChargeSchema>;
