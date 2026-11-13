/**
 * CourtZon Refund Engine — case aggregate (pure, no I/O).
 *
 * Two independent state machines (operational cancellation and payout) plus a
 * derived overall status. Amounts are integer cents.
 */

export type RefundDomain = 'booking' | 'tournament' | 'academy' | 'marketplace' | 'membership';

export type RefundCaseStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'OPERATIONAL_PROCESSING'
  | 'PAYOUT_PENDING'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'FAILED';

export type RefundOperationalStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED';

export type RefundPayoutStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED';

export type RefundPayoutMethod = 'cash' | 'bank_transfer';

export interface RefundCaseLineRecord {
  id: number;
  case_id: number;
  line_no: number;
  line_type: string;
  source_id: number;
  canceled_value_cents: number;
  approved_cents: number;
  operational_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  cancellation_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundPayoutRecord {
  id: number;
  case_id: number;
  method: RefundPayoutMethod;
  amount_cents: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  reference: string | null;
  evidence_url: string | null;
  executed_by: number | null;
  executed_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface RefundCaseRecord {
  id: number;
  public_id: string;
  domain: RefundDomain;
  source_type: string;
  source_id: number;
  original_payment_id: number | null;
  organisation_id: number;
  requested_by: number;
  reason: string;
  policy_snapshot: Record<string, unknown> | null;
  canceled_value_cents: number;
  approved_refund_cents: number;
  fee_cents: number;
  discount_cents: number;
  paid_cents: number;
  currency: string;
  status: RefundCaseStatus;
  operational_status: RefundOperationalStatus;
  payout_status: RefundPayoutStatus;
  approved_by: number | null;
  approved_at: string | null;
  rejected_reason: string | null;
  aggregate_version: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

const CASE_TRANSITIONS: Record<RefundCaseStatus, RefundCaseStatus[]> = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['OPERATIONAL_PROCESSING', 'FAILED'],
  REJECTED: [],
  OPERATIONAL_PROCESSING: ['PAYOUT_PENDING', 'FAILED', 'PARTIALLY_COMPLETED'],
  PAYOUT_PENDING: ['PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED'],
  PARTIALLY_COMPLETED: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['OPERATIONAL_PROCESSING', 'PAYOUT_PENDING'],
};

export function isTerminalCaseStatus(status: RefundCaseStatus): boolean {
  return status === 'COMPLETED' || status === 'REJECTED';
}

export function assertCaseTransition(from: RefundCaseStatus, to: RefundCaseStatus): void {
  if (!CASE_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal refund case transition: ${from} → ${to}`);
  }
}

/** A case is COMPLETED only when every operational line and the full payout are done. */
export function deriveOverallStatus(input: {
  operational: RefundOperationalStatus;
  payout: RefundPayoutStatus;
  approvedCents: number;
  paidCents: number;
}): RefundCaseStatus {
  if (input.operational === 'FAILED' || input.payout === 'FAILED') return 'FAILED';
  const operationalDone = input.operational === 'COMPLETED';
  const payoutDone = input.payout === 'COMPLETED' && input.paidCents >= input.approvedCents;
  if (operationalDone && payoutDone) return 'COMPLETED';
  if (!operationalDone) return 'OPERATIONAL_PROCESSING';
  if (input.paidCents > 0) return 'PARTIALLY_COMPLETED';
  return 'PAYOUT_PENDING';
}

export function deriveOperationalStatus(
  lineStatuses: Array<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>,
): RefundOperationalStatus {
  if (!lineStatuses.length) return 'FAILED';
  if (lineStatuses.every((s) => s === 'COMPLETED')) return 'COMPLETED';
  if (lineStatuses.some((s) => s === 'FAILED')) return 'FAILED';
  if (lineStatuses.some((s) => s === 'PROCESSING' || s === 'PENDING')) return 'PROCESSING';
  return 'PARTIALLY_COMPLETED';
}

export function derivePayoutStatus(approvedCents: number, paidCents: number): RefundPayoutStatus {
  if (paidCents <= 0) return 'PENDING';
  if (paidCents >= approvedCents) return 'COMPLETED';
  return 'PARTIALLY_COMPLETED';
}

export function assertAmounts(input: {
  canceledValueCents: number;
  approvedCents: number;
  feeCents: number;
  discountCents: number;
  paidCents: number;
}): void {
  const { canceledValueCents, approvedCents, feeCents, discountCents, paidCents } = input;
  for (const [name, value] of Object.entries({ canceledValueCents, approvedCents, feeCents, discountCents, paidCents })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer (cents)`);
  }
  if (approvedCents > canceledValueCents) throw new Error('Approved refund cannot exceed the canceled service value');
  if (paidCents > approvedCents) throw new Error('Paid amount cannot exceed the approved refund');
}
