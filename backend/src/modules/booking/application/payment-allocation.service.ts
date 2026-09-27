import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { bookingSeriesRepository } from '../infrastructure/repositories/booking-series.repository.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { paymentAllocationRepository, round2, type PaymentAllocationRow } from '../infrastructure/repositories/payment-allocation.repository.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('payment-allocation');

/** Occurrence statuses that are NOT refundable units and therefore not allocated. */
const ALLOCATION_EXCLUDED_STATUSES = new Set(['cancelled', 'completed', 'no_show', 'expired']);

/**
 * R5-D2-A — canonical allocation foundation.
 *
 * Maps ONE recurring series payment to its paid booking occurrences. The
 * refundable unit is `bookings.id` (an occurrence — never `booking_slots`).
 * All amounts are copied from the PERSISTED occurrence financial snapshots —
 * no historical pricing is recomputed.
 *
 * D2-A is deliberately financial-infrastructure ONLY: no gateway call, no
 * PaymentService refund, no accounting reversal, no entitlement change, no
 * booking cancellation. D2-B onwards wires refund behavior.
 *
 * The model is method-neutral at the row level (`payment_method` uses the
 * canonical representation), but today allocations are only created for CARD
 * series payments (the only series payments with a payment_transactions row —
 * R5-C4 Cash has no payment row, so Cash allocation is out of D2-A's scope).
 */
export const paymentAllocationService = {
  /**
   * Create one allocation per occurrence of a PAID series payment.
   *
   * Occurrences already in a terminal state (cancelled/completed/no_show/
   * expired) are not refundable units and are skipped. Every other occurrence
   * gets exactly one allocation (UNIQUE per payment+booking, idempotent —
   * replaying a payment-success handler returns the existing rows).
   *
   * Returns the full set of allocation rows for the payment afterwards.
   */
  async createAllocationForSeriesPayment(seriesId: number, paymentTransactionId: number): Promise<PaymentAllocationRow[]> {
    const series = await bookingSeriesRepository.findById(seriesId);
    if (!series) throw new ConflictError('Recurring series');
    const payment = await paymentRepository.findById(paymentTransactionId);
    if (!payment || String(payment.reference_type) !== 'booking_series' || Number(payment.reference_id) !== seriesId) {
      throw new ConflictError(`Payment ${paymentTransactionId} is not the canonical payment for series ${seriesId}`);
    }

    const occurrences = await bookingRepository.findBySeries(seriesId);
    for (const occ of occurrences) {
      const statusKey = String(occ.booking_status || '');
      if (ALLOCATION_EXCLUDED_STATUSES.has(statusKey)) {
        log.info({ seriesId, bookingId: Number(occ.id), status: statusKey }, 'Allocation skipped (non-refundable unit)');
        continue;
      }
      const subtotal = Number(occ.total_amount || 0);
      const tax = Number(occ.tax_amount || 0);
      const gross = round2(subtotal + tax);
      await paymentAllocationRepository.createAllocation({
        paymentTransactionId,
        seriesId,
        bookingId: Number(occ.id),
        subtotal,
        taxAmount: Number(occ.tax_amount || 0),
        commissionAmount: Number(occ.commission_amount || 0),
        orgNetAmount: Number(occ.club_amount || 0),
        grossAmount: gross,
        currency: String(payment.currency || 'EGP'),
        paymentMethod: String(payment.payment_method || 'card'),
      });
    }
    return paymentAllocationRepository.findByPayment(paymentTransactionId);
  },

  async findBySeries(seriesId: number): Promise<PaymentAllocationRow[]> {
    return paymentAllocationRepository.findBySeries(seriesId);
  },

  async findByPayment(paymentTransactionId: number): Promise<PaymentAllocationRow[]> {
    return paymentAllocationRepository.findByPayment(paymentTransactionId);
  },

  async getRefundableBalance(paymentTransactionId: number): Promise<number> {
    return paymentAllocationRepository.getRefundableBalance(paymentTransactionId);
  },

  /**
   * Validate the canonical allocation invariant for a paid series payment:
   *   SUM(allocations.gross_amount) === payment.amount
   *   AND one allocation per occurrence (no per-booking duplicates).
   * Throws a domain error on violation so callers (tests / future refund code)
   * never rely on a financially inconsistent allocation set.
   */
  async assertSeriesAllocationInvariant(paymentTransactionId: number): Promise<void> {
    const rows = await paymentAllocationRepository.findByPayment(paymentTransactionId);
    const payment = await paymentRepository.findById(paymentTransactionId);
    if (!payment) throw new ConflictError(`Payment ${paymentTransactionId} not found`);
    if (String(payment.reference_type) !== 'booking_series') return;

    const sumGross = round2(rows.reduce((s, r) => s + r.grossAmount, 0));
    const expected = round2(Number(payment.amount || 0));
    if (Math.abs(sumGross - expected) >= 0.01) {
      throw new ConflictError(
        `Payment allocation invariant violated for payment ${paymentTransactionId}: SUM(gross)=${sumGross} but payment.amount=${expected}.`,
      );
    }
    const bookingIds = rows.map((r) => r.bookingId);
    if (new Set(bookingIds).size !== bookingIds.length) {
      throw new ConflictError(`Payment allocation invariant violated for payment ${paymentTransactionId}: duplicate booking allocations.`);
    }
  },
};