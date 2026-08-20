export type EntitlementType =
  | 'ORGANIZATION_EARNING'
  | 'COURTZON_COMMISSION'
  | 'ORGANIZATION_ADJUSTMENT'
  | 'COURTZON_ADJUSTMENT';

export type SourceType =
  | 'booking'
  | 'academy'
  | 'marketplace'
  | 'tournament'
  | 'coach_session'
  | 'manual';

/** Who originally collected the money for this entitlement. */
export type EntitlementCollector = 'courtzon' | 'org';

export type EntitlementStatus = 'PENDING' | 'AVAILABLE' | 'ON_HOLD' | 'SETTLED' | 'CANCELLED';

const ALLOWED_TRANSITIONS: Record<EntitlementStatus, EntitlementStatus[]> = {
  PENDING:    ['AVAILABLE', 'CANCELLED'],
  AVAILABLE:  ['ON_HOLD', 'SETTLED', 'CANCELLED'],
  ON_HOLD:    ['AVAILABLE', 'CANCELLED', 'SETTLED'],
  SETTLED:    [],
  CANCELLED:  [],
};

export interface EntitlementRecord {
  id: number;
  public_id: string;
  organisation_id: number;
  branch_id: number | null;
  entitlement_type: EntitlementType;
  source_type: SourceType;
  source_id: number | null;
  collector: EntitlementCollector | null;
  amount: number;
  currency: string;
  status: EntitlementStatus;
  hold_reason: string | null;
  cancelled_reason: string | null;
  available_at: string | null;
  settled_at: string | null;
  settled_by: number | null;
  settlement_id: number | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  aggregate_version: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEntitlementInput {
  organisationId: number;
  branchId?: number | null;
  entitlementType: EntitlementType;
  sourceType: SourceType;
  sourceId?: number | null;
  collector?: EntitlementCollector | null;
  amount: number;
  currency?: string;
  availableAt?: Date | null;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: number | null;
}

export interface TransitionRequest {
  fromStatus: EntitlementStatus;
  toStatus: EntitlementStatus;
  currentVersion: number;
}

export interface TransitionResult {
  newVersion: number;
  didTransition: boolean;
}

export function assertValidTransition(from: EntitlementStatus, to: EntitlementStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal entitlement state transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: EntitlementStatus): boolean {
  return ['SETTLED', 'CANCELLED'].includes(status);
}

export function planTransition(request: TransitionRequest): TransitionResult {
  assertValidTransition(request.fromStatus, request.toStatus);
  return { newVersion: request.currentVersion + 1, didTransition: true };
}

export function validateAmount(amount: number): void {
  if (amount <= 0) throw new Error('Entitlement amount must be positive');
  if (!Number.isFinite(amount)) throw new Error('Entitlement amount must be finite');
  if (Math.round(amount * 100) !== amount * 100) throw new Error('Entitlement amount must have at most 2 decimal places');
}

/**
 * ADJUSTMENT entitlements may be negative (debit) to represent reductions to an
 * organisation's position (e.g. refunds). Magnitude is preserved immutably; the
 * direction is conveyed by the sign and the metadata (`direction: 'debit'`).
 * A zero amount is never allowed.
 */
export function validateAdjustmentAmount(amount: number): void {
  if (amount === 0) throw new Error('Adjustment amount must be non-zero');
  if (!Number.isFinite(amount)) throw new Error('Adjustment amount must be finite');
  if (Math.round(amount * 100) !== amount * 100) throw new Error('Adjustment amount must have at most 2 decimal places');
}

export function validateEntitlementAmount(type: EntitlementType, amount: number): void {
  if (type === 'ORGANIZATION_ADJUSTMENT' || type === 'COURTZON_ADJUSTMENT') {
    validateAdjustmentAmount(amount);
    return;
  }
  validateAmount(amount);
}
