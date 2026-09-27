import { z } from 'zod';

export const ChargeSchema = z.object({
  // R5-B — 'booking_series' added to the canonical reference-type enum. One
  // payment row + one gateway transaction for a whole recurring series.
  // Existing reference types are unchanged.
  referenceType: z.enum(['booking', 'booking_series', 'order', 'subscription', 'wallet_topup', 'academy', 'tournament']),
  referenceId: z.number().int().positive(),
  amount: z.number().positive(),
  currency: z.string().optional().default('EGP'),
  // PHASE 1 (temporary) — wallet is not an active payment method. Card (+ the
  // gateway default) is the active online method; wallet_topup (deposit) and
  // refund flows are separate and remain wallet-capable.
  paymentMethod: z.enum(['card', 'bank_transfer']).optional().default('card'),
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
