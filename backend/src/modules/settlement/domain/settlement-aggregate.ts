export type SettlementStatus = 'requested' | 'calculating' | 'pending_approval' | 'approved' | 'paid' | 'completed' | 'rejected' | 'cancelled';

export type SettlementDirection = 'courtzon_to_org' | 'org_to_courtzon';

export type TransferStatus = 'pending' | 'completed' | 'failed';

const ALLOWED_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  requested: ['calculating', 'pending_approval', 'cancelled'],
  calculating: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'rejected'],
  paid: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export interface SettlementRecord {
  settlement_status: SettlementStatus;
  aggregate_version: number;
}

export interface TransitionRequest {
  fromStatus: SettlementStatus;
  toStatus: SettlementStatus;
  currentVersion: number;
}

export interface TransitionResult {
  newVersion: number;
  didTransition: boolean;
}

export function assertValidTransition(from: SettlementStatus, to: SettlementStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal settlement state transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: SettlementStatus): boolean {
  return ['completed', 'rejected', 'cancelled'].includes(status);
}

export function planTransition(request: TransitionRequest): TransitionResult {
  assertValidTransition(request.fromStatus, request.toStatus);
  return { newVersion: request.currentVersion + 1, didTransition: true };
}

export function canBeRolledBack(status: SettlementStatus): boolean {
  return ['requested', 'calculating', 'pending_approval'].includes(status);
}
