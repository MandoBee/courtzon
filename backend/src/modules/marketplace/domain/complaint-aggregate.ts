/**
 * Marketplace complaint domain — types, state machine, and validation rules.
 * Pure logic, no DB/event-bus imports (unit-testable).
 */

export type ComplaintType =
  | 'defective'
  | 'damaged'
  | 'wrong_item'
  | 'missing_item'
  | 'not_as_described'
  | 'other';

export type ComplaintStatus =
  | 'pending'
  | 'in_review'
  | 'awaiting_return'
  | 'refund_pending_approval'
  | 'refunded'
  | 'awaiting_confirmation'
  | 'resolved'
  | 'rejected';

export type ResolutionType = 'refund' | 'replacement' | 'reshipment' | 'rejected';

export type CollectionStatus =
  | 'not_required'
  | 'pending'
  | 'in_progress'
  | 'collected'
  | 'inspected';

export type ApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected';

export const COMPLAINT_TYPES: ComplaintType[] = [
  'defective', 'damaged', 'wrong_item', 'missing_item', 'not_as_described', 'other',
];

export const MAX_IMAGES_PER_COMPLAINT = 3;
export const MAX_COMPLAINT_ATTEMPTS = 2;
export const RECEIPT_CONFIRMATION_DAYS = 7;
export const COLLECTION_DEADLINE_DAYS = 7;
export const REFUND_APPROVAL_THRESHOLD_RATIO = 1.25;

export const TERMINAL_COMPLAINT_STATUSES: ComplaintStatus[] = ['refunded', 'resolved', 'rejected'];

export function isTerminalComplaint(status: ComplaintStatus): boolean {
  return TERMINAL_COMPLAINT_STATUSES.includes(status);
}

export class ComplaintStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintStateError';
  }
}

const ALLOWED_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  pending: ['in_review', 'rejected', 'cancelled' as any].filter(Boolean) as ComplaintStatus[],
  in_review: ['awaiting_return', 'refund_pending_approval', 'refunded', 'awaiting_confirmation', 'rejected'],
  awaiting_return: ['in_review', 'refund_pending_approval', 'refunded', 'awaiting_confirmation', 'rejected'],
  refund_pending_approval: ['refunded', 'rejected'],
  refunded: [],
  awaiting_confirmation: ['resolved'],
  resolved: [],
  rejected: [],
};

export function assertComplaintTransition(from: ComplaintStatus, to: ComplaintStatus): void {
  if (from === to) throw new ComplaintStateError(`Complaint already in status ${from}`);
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ComplaintStateError(`Cannot transition complaint from '${from}' to '${to}'`);
  }
}

/** Round to 2 decimals. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RefundDecision {
  status: 'immediate' | 'needs_approval';
  reasonRequired: boolean;
  ratio: number;
}

/**
 * Classifies a manual refund amount against the system-calculated disputed value.
 *
 *   ≤ disputed value                → immediate, no reason
 *   > disputed value and ≤ 125%     → immediate, written reason required
 *   > 125%                          → CourtZon admin approval required
 */
export function classifyRefund(refundAmount: number, disputedValue: number): RefundDecision {
  if (refundAmount < 0) throw new ComplaintStateError('Refund amount cannot be negative');
  if (disputedValue <= 0) throw new ComplaintStateError('Disputed value must be positive');
  const ratio = round2(refundAmount / disputedValue);
  if (ratio <= 1) return { status: 'immediate', reasonRequired: false, ratio };
  if (ratio <= REFUND_APPROVAL_THRESHOLD_RATIO) {
    return { status: 'immediate', reasonRequired: true, ratio };
  }
  return { status: 'needs_approval', reasonRequired: true, ratio };
}

/** Which complaint types typically require the product to be returned. */
export function complaintTypeRequiresReturn(complaintType: ComplaintType): boolean {
  switch (complaintType) {
    case 'missing_item':
      return false; // nothing to return
    default:
      return true; // defective, damaged, wrong_item, not_as_described, other
  }
}

export interface CreateComplaintInput {
  orderId: number;
  orderItemId: number;
  productId: number;
  buyerId: number;
  sellerOrgId: number;
  complaintType: ComplaintType;
  reason: string;
  images?: string[];
  attemptNumber: number;
  disputedValue: number;
  createdBy: number;
}

export function validateComplaintInput(input: CreateComplaintInput): void {
  if (!COMPLAINT_TYPES.includes(input.complaintType)) {
    throw new ComplaintStateError(`Unknown complaint type: ${input.complaintType}`);
  }
  if (!input.reason || input.reason.trim().length < 3) {
    throw new ComplaintStateError('A written reason of at least 3 characters is required');
  }
  if (input.images && input.images.length > MAX_IMAGES_PER_COMPLAINT) {
    throw new ComplaintStateError(`A maximum of ${MAX_IMAGES_PER_COMPLAINT} images is allowed`);
  }
  if (input.attemptNumber < 1 || input.attemptNumber > MAX_COMPLAINT_ATTEMPTS) {
    throw new ComplaintStateError(`Attempt number must be between 1 and ${MAX_COMPLAINT_ATTEMPTS}`);
  }
  if (input.disputedValue <= 0) {
    throw new ComplaintStateError('Disputed value must be positive');
  }
  if (!input.orderItemId || !input.productId || !input.buyerId || !input.sellerOrgId) {
    throw new ComplaintStateError('Order, item, product, buyer and seller are required');
  }
}