import { z } from 'zod';
import { REFUND_TYPES } from '../domain/membership-p2.types.js';

/** Per-plan-version installment template (P2). */
export const InstallmentTemplateP2Schema = z.object({
  seq: z.number().int().min(1),
  amount: z.number().min(0),
  dueOffsetDays: z.number().int().min(0).optional().default(0),
});

/** Organisation cancellation/refund policy (P2, decision #7/#15/#16). */
export const MembershipCancellationRefundPolicyP2Schema = z.object({
  cancellation: z.object({
    void_future_unpaid: z.boolean().optional().default(true),
  }).optional().default({ void_future_unpaid: true }),
  refund: z.object({
    type: z.enum(REFUND_TYPES).optional().default('none'),
    window_days_before_start: z.number().int().min(0).optional().default(0),
  }).optional().default({ type: 'none', window_days_before_start: 0 }),
});

export type MembershipCancellationRefundPolicyP2Input = z.infer<typeof MembershipCancellationRefundPolicyP2Schema>;

/** Confirm/complete a single installment (cash or card). */
export const ConfirmInstallmentP2Schema = z.object({});

/** Renew a membership subscription (org-initiated). */
export const RenewMembershipP2Schema = z.object({
  paymentMethod: z.enum(['cash', 'card']).optional().default('card'),
});

/** Cancel a membership subscription (lifecycle only; no auto reversal). */
export const CancelMembershipP2Schema = z.object({
  reason: z.string().trim().max(500).nullish(),
});

/** Refund paid installments (a separate financial operation). */
export const RefundMembershipP2Schema = z.object({
  installmentIds: z.array(z.number().int().positive()).min(1).optional(),
  reason: z.string().trim().max(500).nullish(),
});