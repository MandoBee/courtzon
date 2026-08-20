import { describe, it, expect } from 'vitest';
import {
  classifyRefund, assertComplaintTransition, complaintTypeRequiresReturn,
  validateComplaintInput, isTerminalComplaint, MAX_COMPLAINT_ATTEMPTS,
  MAX_IMAGES_PER_COMPLAINT, ComplaintStateError,
} from '../domain/complaint-aggregate.js';

describe('Complaint Aggregate — refund classification', () => {
  it('refund <= disputed value executes immediately without reason', () => {
    const d = classifyRefund(400, 1000);
    expect(d.status).toBe('immediate');
    expect(d.reasonRequired).toBe(false);
    expect(d.ratio).toBe(0.4);
  });

  it('refund equal to disputed value is immediate without reason', () => {
    const d = classifyRefund(1000, 1000);
    expect(d.status).toBe('immediate');
    expect(d.reasonRequired).toBe(false);
  });

  it('refund > disputed value and <= 125% requires a written reason', () => {
    const d = classifyRefund(1200, 1000);
    expect(d.status).toBe('immediate');
    expect(d.reasonRequired).toBe(true);
    expect(d.ratio).toBe(1.2);
  });

  it('refund exactly 125% requires a written reason', () => {
    const d = classifyRefund(1250, 1000);
    expect(d.status).toBe('immediate');
    expect(d.reasonRequired).toBe(true);
    expect(d.ratio).toBe(1.25);
  });

  it('refund > 125% requires admin approval', () => {
    const d = classifyRefund(1300, 1000);
    expect(d.status).toBe('needs_approval');
    expect(d.ratio).toBe(1.3);
  });

  it('rejects negative refund amounts', () => {
    expect(() => classifyRefund(-1, 1000)).toThrow(ComplaintStateError);
  });

  it('rejects non-positive disputed value', () => {
    expect(() => classifyRefund(100, 0)).toThrow(ComplaintStateError);
  });
});

describe('Complaint Aggregate — state machine', () => {
  it('allows valid transitions', () => {
    expect(() => assertComplaintTransition('pending', 'in_review')).not.toThrow();
    expect(() => assertComplaintTransition('in_review', 'refunded')).not.toThrow();
    expect(() => assertComplaintTransition('in_review', 'refund_pending_approval')).not.toThrow();
    expect(() => assertComplaintTransition('in_review', 'awaiting_return')).not.toThrow();
    expect(() => assertComplaintTransition('awaiting_return', 'refunded')).not.toThrow();
    expect(() => assertComplaintTransition('awaiting_confirmation', 'resolved')).not.toThrow();
    expect(() => assertComplaintTransition('in_review', 'rejected')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertComplaintTransition('refunded', 'in_review')).toThrow(ComplaintStateError);
    expect(() => assertComplaintTransition('pending', 'refunded')).toThrow(ComplaintStateError);
    expect(() => assertComplaintTransition('resolved', 'awaiting_confirmation')).toThrow(ComplaintStateError);
    expect(() => assertComplaintTransition('rejected', 'pending')).toThrow(ComplaintStateError);
  });

  it('terminal statuses are terminal', () => {
    expect(isTerminalComplaint('refunded')).toBe(true);
    expect(isTerminalComplaint('resolved')).toBe(true);
    expect(isTerminalComplaint('rejected')).toBe(true);
    expect(isTerminalComplaint('pending')).toBe(false);
  });
});

describe('Complaint Aggregate — validation', () => {
  const base = {
    orderId: 1, orderItemId: 2, productId: 3, buyerId: 4, sellerOrgId: 5,
    complaintType: 'defective' as const, reason: 'Broken item', attemptNumber: 1, disputedValue: 100, createdBy: 4,
  };

  it('accepts a valid input', () => {
    expect(() => validateComplaintInput(base)).not.toThrow();
  });

  it('rejects unknown complaint types', () => {
    expect(() => validateComplaintInput({ ...base, complaintType: 'bogus' as any })).toThrow(ComplaintStateError);
  });

  it('rejects missing reason', () => {
    expect(() => validateComplaintInput({ ...base, reason: '' })).toThrow(ComplaintStateError);
    expect(() => validateComplaintInput({ ...base, reason: 'ab' })).toThrow(ComplaintStateError);
  });

  it('rejects more than 3 images', () => {
    expect(() => validateComplaintInput({ ...base, images: ['a', 'b', 'c', 'd'] })).toThrow(ComplaintStateError);
  });

  it('accepts up to 3 images', () => {
    expect(() => validateComplaintInput({ ...base, images: ['a', 'b', 'c'] })).not.toThrow();
  });

  it('rejects attempt number outside 1..2', () => {
    expect(() => validateComplaintInput({ ...base, attemptNumber: 0 })).toThrow(ComplaintStateError);
    expect(() => validateComplaintInput({ ...base, attemptNumber: 3 })).toThrow(ComplaintStateError);
  });

  it('rejects non-positive disputed value', () => {
    expect(() => validateComplaintInput({ ...base, disputedValue: 0 })).toThrow(ComplaintStateError);
  });
});

describe('Complaint Aggregate — return requirement by type', () => {
  it('missing items do not require return', () => {
    expect(complaintTypeRequiresReturn('missing_item')).toBe(false);
  });

  it('defective/damaged/wrong_item/not_as_described require return', () => {
    expect(complaintTypeRequiresReturn('defective')).toBe(true);
    expect(complaintTypeRequiresReturn('damaged')).toBe(true);
    expect(complaintTypeRequiresReturn('wrong_item')).toBe(true);
    expect(complaintTypeRequiresReturn('not_as_described')).toBe(true);
    expect(complaintTypeRequiresReturn('other')).toBe(true);
  });

  it('max attempts is 2', () => {
    expect(MAX_COMPLAINT_ATTEMPTS).toBe(2);
    expect(MAX_IMAGES_PER_COMPLAINT).toBe(3);
  });
});