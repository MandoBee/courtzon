import { describe, it, expect } from 'vitest';
import { PaymentAggregate } from '../PaymentAggregate.js';
import type { PaymentStatus } from '../../shared/payment-types.js';

const aggregate = new PaymentAggregate();

describe('PaymentAggregate', () => {
  describe('allowed transitions', () => {
    it.each([
      ['created', 'pending'],
      ['created', 'cancelled'],
      ['pending', 'processing'],
      ['pending', 'failed'],
      ['pending', 'expired'],
      ['pending', 'cancelled'],
      ['processing', 'failed'],
    ])('allows %s → %s via transition()', (from, to) => {
      const result = aggregate.transition(from as PaymentStatus, to as PaymentStatus);
      expect(result).toBe(to);
    });

    it('allows pending → paid with gateway reference and amount', () => {
      const result = aggregate.markPaid('pending', { gatewayReference: 'ref_123', paidAmount: 100 });
      expect(result).toBe('paid');
    });

    it('allows processing → paid with gateway reference and amount', () => {
      const result = aggregate.markPaid('processing', { gatewayReference: 'ref_456', paidAmount: 50 });
      expect(result).toBe('paid');
    });

    it('allows paid → full refund', () => {
      const result = aggregate.refund('paid', { refundAmount: 100 });
      expect(result).toBe('refunded');
    });

    it('allows paid → partial refund when amount <= totalPaid', () => {
      const result = aggregate.partialRefund('paid', { refundAmount: 30, totalPaid: 100 });
      expect(result).toBe('refunded');
    });
  });

  describe('forbidden transitions', () => {
    it.each([
      ['created', 'paid'],
      ['created', 'refunded'],
      ['paid', 'paid'],
    ])('rejects %s → %s as invalid transition', (from, to) => {
      expect(() => aggregate.transition(from as PaymentStatus, to as PaymentStatus)).toThrow(
        `Transition from '${from}' to '${to}' is not allowed`,
      );
    });
  });

  describe('terminal states reject all transitions', () => {
    it.each(['failed', 'cancelled', 'expired', 'refunded'] as PaymentStatus[])(
      '%s rejects all transitions',
      (status) => {
        expect(() => aggregate.transition(status, 'pending')).toThrow(
          `Payment is already in terminal status '${status}'`,
        );
        expect(() => aggregate.transition(status, 'paid')).toThrow(
          `Payment is already in terminal status '${status}'`,
        );
      },
    );
  });

  describe('markPaid validation', () => {
    it('rejects markPaid from created', () => {
      expect(() => aggregate.markPaid('created', { gatewayReference: 'ref', paidAmount: 100 })).toThrow(
        "Cannot mark payment as paid from 'created'",
      );
    });

    it('rejects markPaid without gatewayReference', () => {
      expect(() => aggregate.markPaid('pending', { paidAmount: 100 })).toThrow(
        'Gateway reference is required',
      );
    });

    it('rejects markPaid with zero amount', () => {
      expect(() => aggregate.markPaid('pending', { gatewayReference: 'ref', paidAmount: 0 })).toThrow(
        'Paid amount must be greater than zero',
      );
    });

    it('rejects markPaid without context', () => {
      expect(() => aggregate.markPaid('pending')).toThrow();
    });
  });

  describe('refund validation', () => {
    it('rejects refund from pending', () => {
      expect(() => aggregate.refund('pending', { refundAmount: 50 })).toThrow(
        "Cannot refund payment in 'pending' status",
      );
    });

    it('rejects refund with zero amount', () => {
      expect(() => aggregate.refund('paid', { refundAmount: 0 })).toThrow(
        'Refund amount must be greater than zero',
      );
    });

    it('rejects refund without context', () => {
      expect(() => aggregate.refund('paid')).toThrow();
    });
  });

  describe('partialRefund validation', () => {
    it('rejects partial refund when amount exceeds totalPaid', () => {
      expect(() => aggregate.partialRefund('paid', { refundAmount: 150, totalPaid: 100 })).toThrow(
        'exceeds remaining balance',
      );
    });

    it('allows partial refund when amount equals totalPaid', () => {
      const result = aggregate.partialRefund('paid', { refundAmount: 100, totalPaid: 100 });
      expect(result).toBe('refunded');
    });

    it('rejects partial refund from non-paid status', () => {
      expect(() => aggregate.partialRefund('pending', { refundAmount: 50, totalPaid: 100 })).toThrow(
        "Cannot partially refund payment in 'pending' status",
      );
    });
  });

  describe('convenience methods', () => {
    it('startProcessing allows pending → processing', () => {
      expect(aggregate.startProcessing('pending')).toBe('processing');
    });

    it('markFailed allows pending → failed', () => {
      expect(aggregate.markFailed('pending')).toBe('failed');
    });

    it('markCancelled allows created → cancelled', () => {
      expect(aggregate.markCancelled('created')).toBe('cancelled');
    });

    it('markExpired allows pending → expired', () => {
      expect(aggregate.markExpired('pending')).toBe('expired');
    });
  });
});
