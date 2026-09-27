import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { confirmBookingHandler } from '../commands/confirm-booking.command.js';
import { cancelBookingHandler } from '../commands/cancel-booking.command.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import {
  SERIES_PAYMENT_REFERENCE_TYPE,
  isOccurrenceCancellable,
  isOccurrenceConfirmable,
  seriesNowMs,
  summariseOutcomes,
  type OccurrenceOutcome,
} from './recurring-payment.service.js';
import type { Command } from '../../../shared/command/command-base.js';

const log = createModuleLogger('booking-payment-listener');

function newCommandId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-B — ONE series payment → N canonical occurrence transitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * R5-B — series payment SUCCESS.
 *
 * The authoritative gateway outcome (webhook / confirm / recover / sync — all of
 * which converge on PaymentService._processPaymentOutcome, the single emitter of
 * `payment:succeeded`) is the ONLY trigger. There is no recurring-specific
 * confirmation endpoint and the browser return is never authoritative.
 *
 * Every eligible occurrence is transitioned through the canonical
 * `commandPipeline` + `ConfirmBooking` command — booking status is NEVER mutated
 * directly — which in turn emits the canonical `booking:confirmed` event. The
 * canonical `booking:paid` realtime/payment event is then emitted per occurrence
 * using the SAME producer shape as a single paid booking, so the socket mapper
 * and the frontend `booking.paid` handler need no recurring-specific code.
 *
 * Idempotency: already-confirmed / already-paid / terminal occurrences are
 * SKIPPED, so a duplicate webhook or a repeated confirm re-confirms nothing and
 * emits no duplicate booking event.
 */
async function handleSeriesPaymentSucceeded(data: { paymentId: number; referenceId: number; amount?: number }): Promise<void> {
  const seriesId = Number(data.referenceId);
  if (!seriesId) {
    log.error({ paymentId: data.paymentId }, 'Series payment succeeded but no seriesId');
    return;
  }

  log.info({ paymentId: data.paymentId, seriesId, amount: data.amount }, 'Recurring series: payment succeeded — confirming eligible occurrences');

  let occurrences: any[];
  try {
    occurrences = await bookingRepository.findBySeries(seriesId);
  } catch (err: any) {
    log.error({ err, seriesId }, 'Recurring series: could not load occurrences for payment success');
    return;
  }
  if (!occurrences.length) {
    log.warn({ seriesId }, 'Recurring series: no occurrences found for payment success');
    return;
  }

  const outcomes: OccurrenceOutcome[] = [];
  for (const occ of occurrences) {
    const bookingId = Number(occ.id);
    const eligibility = isOccurrenceConfirmable(occ);
    if (!eligibility.eligible) {
      outcomes.push({ bookingId, outcome: 'skipped', reason: eligibility.reason });
      continue;
    }
    try {
      const confirmCommand: Command = {
        commandId: newCommandId('ConfirmBooking'),
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        // 'paid' is applied atomically with the transition so the occurrence's
        // payment_status reflects the authoritative gateway success.
        payload: { bookingId, paymentStatus: 'paid' },
        correlationId: `corr_${Date.now()}`,
      };
      const confirmResult = await commandPipeline.execute(confirmCommand, {
        validate: async () => confirmBookingHandler.validate(confirmCommand),
        execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
        events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
      });
      if (confirmResult.status === 'error') {
        throw new Error(`ConfirmBooking failed: ${confirmResult.message}`);
      }
      outcomes.push({ bookingId, outcome: 'applied' });

      // ── Canonical per-occurrence booking:paid (same producer as a single
      //    paid booking). Reused event — no recurring-specific payment event.
      //    Accounting intentionally does NOT post from this event for series
      //    occurrences (see accounting-event.listener.ts + booking-accounting
      //    .service.ts seriesId guard): ONE series payment must yield ZERO
      //    per-booking payment postings until R5-C defines series accounting.
      eventBusV2.emit('booking:paid', {
        bookingId,
        userId: occ.user_id,
        organisationId: occ.organisation_id || undefined,
        branchId: occ.branch_id || undefined,
        resourceId: occ.resource_id || undefined,
        courtId: occ.resource_id || undefined,
        paymentMethod: occ.payment_method || 'card',
        grossAmount: Number(occ.total_amount || 0),
        taxAmount: Number(occ.tax_amount || 0),
        coachAmount: Number(occ.coach_amount || 0),
        organisationAmount: Number(occ.club_amount || 0),
        commissionAmount: Number(occ.commission_amount || 0),
        currency: 'EGP',
        sourceId: bookingId,
        // R5-B correlation — additive, so payment/booking consumers can trace
        // the occurrence back to the ONE series payment that settled it.
        seriesId,
        seriesPaymentId: data.paymentId,
      } as any);
    } catch (err: any) {
      log.error({ err, seriesId, bookingId, paymentId: data.paymentId }, 'Recurring series: confirm occurrence failed on series payment success');
      outcomes.push({ bookingId, outcome: 'skipped', reason: 'confirm_failed' });
    }
  }

  const summary = summariseOutcomes(outcomes);
  log.info(
    { seriesId, paymentId: data.paymentId, confirmed: summary.applied.length, skipped: summary.skipped.length },
    'Recurring series: payment success handled',
  );

  // R5-D2-A — record the authoritative payment allocation foundation: ONE
  // allocation per paid occurrence (never per booking_slot). Additive and
  // idempotent (UNIQUE per payment+booking); historical prices are copied from
  // the persisted occurrence snapshots, never recomputed. No refund behavior.
  try {
    const { paymentAllocationService } = await import('./payment-allocation.service.js');
    await paymentAllocationService.createAllocationForSeriesPayment(seriesId, Number(data.paymentId));
  } catch (err: any) {
    log.error({ err, seriesId, paymentId: data.paymentId }, 'Recurring series: allocation foundation write failed');
  }
}

/**
 * R5-B — series payment FAILED / CANCELLED / EXPIRED.
 *
 * Reuses the canonical Payment Service lifecycle events. Applies the R4
 * eligible-only cancellation rule to pending occurrences via the canonical
 * `CancelBooking` command: future, non-terminal, not-already-paid occurrences
 * only. Completed / past / already-cancelled / expired / no-show occurrences and
 * unrelated bookings are never rewritten. No rescheduling, no replacement
 * bookings, no new series status, no accounting, no refund.
 */
async function handleSeriesPaymentTerminal(
  data: { paymentId: number; referenceId: number; reason?: string },
  cancelReason: string,
  label: string,
): Promise<void> {
  const seriesId = Number(data.referenceId);
  if (!seriesId) return;

  log.info({ paymentId: data.paymentId, seriesId, reason: data.reason }, `Recurring series: payment ${label} — cancelling eligible pending occurrences`);

  let occurrences: any[];
  try {
    occurrences = await bookingRepository.findBySeries(seriesId);
  } catch (err: any) {
    log.error({ err, seriesId }, `Recurring series: could not load occurrences on payment ${label}`);
    return;
  }

  const nowMs = seriesNowMs();
  const outcomes: OccurrenceOutcome[] = [];
  for (const occ of occurrences) {
    const bookingId = Number(occ.id);
    const eligibility = isOccurrenceCancellable(occ, nowMs);
    if (!eligibility.eligible) {
      outcomes.push({ bookingId, outcome: 'skipped', reason: eligibility.reason });
      continue;
    }
    try {
      const cancelCommand: Command = {
        commandId: newCommandId('CancelBooking'),
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: cancelReason },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelResult = await commandPipeline.execute(cancelCommand, {
        validate: async () => cancelBookingHandler.validate(cancelCommand),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelResult.status === 'error') throw new Error(`CancelBooking failed: ${cancelResult.message}`);
      outcomes.push({ bookingId, outcome: 'applied' });
    } catch (err: any) {
      log.error({ err, seriesId, bookingId, paymentId: data.paymentId }, `Recurring series: cancel occurrence failed on payment ${label}`);
      outcomes.push({ bookingId, outcome: 'skipped', reason: 'cancel_failed' });
    }
  }

  const summary = summariseOutcomes(outcomes);
  log.info(
    { seriesId, paymentId: data.paymentId, cancelled: summary.applied.length, skipped: summary.skipped.length },
    `Recurring series: payment ${label} handled`,
  );
}

// Idempotency guard — registering twice would duplicate every in-memory handler
// and fire each domain event multiple times (e.g. two ConfirmBooking commands on
// one payment:succeeded → AggregateVersionConflict on the second). Called once
// at app startup, and once per test file. Guarded so repeated calls are a no-op.
let bookingPaymentListenersRegistered = false;

export function registerBookingPaymentListeners() {
  if (bookingPaymentListenersRegistered) {
    log.info('Booking payment listeners already registered — skip');
    return;
  }
  bookingPaymentListenersRegistered = true;
  eventBusV2.on('payment:succeeded', async (data) => {
    // R5-B — a recurring series is settled by ONE payment. Route it to the
    // series-aware branch; a standalone booking keeps the original path below.
    if (data.referenceType === SERIES_PAYMENT_REFERENCE_TYPE) {
      await handleSeriesPaymentSucceeded(data as any);
      return;
    }
    if (data.referenceType !== 'booking') return;

    const bookingId = data.referenceId;
    if (!bookingId) {
      log.error({ paymentId: data.paymentId }, 'Booking payment succeeded but no bookingId');
      return;
    }

    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment succeeded — confirming booking');
    try {
      const booking = await bookingRepository.findById(bookingId);

      if (!booking) {
        log.error({ bookingId }, 'Booking not found for payment succeeded');
        return;
      }

      if (booking.booking_status === 'confirmed') {
        log.info({ bookingId }, 'Booking already confirmed — marking payment paid');
        // The booking was confirmed earlier (e.g. manual org confirmation);
        // the authoritative gateway success still marks the payment as paid.
        await bookingRepository.persistPaymentStatus(bookingId, 'paid');
      } else if (booking.booking_status !== 'pending_payment' && booking.booking_status !== 'pending') {
        log.warn({ bookingId, status: booking.booking_status }, 'Booking in unexpected status for payment confirmation');
        return;
      } else {
        const confirmCommand: Command = {
          commandId: `ConfirmBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          commandType: 'ConfirmBooking',
          aggregateType: 'booking',
          aggregateId: String(bookingId),
          // paymentStatus 'paid' is applied atomically with the transition so the
          // booking's payment_status reflects the authoritative gateway success.
          payload: { bookingId, paymentStatus: 'paid' },
          correlationId: `corr_${Date.now()}`,
        };

        const confirmResult = await commandPipeline.execute(confirmCommand, {
          validate: async () => confirmBookingHandler.validate(confirmCommand),
          execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
          events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
        });

        if (confirmResult.status === 'error') {
          throw new Error(`ConfirmBooking failed: ${confirmResult.message}`);
        }
      }

      log.info({ bookingId }, 'Booking confirmed via payment succeeded event');

      // ── Canonical realtime paid event ──
      // Emit booking:paid so the socket publisher routes it to the player's
      // user:{ownerId} room and the organisation:{orgId} room, and the frontend
      // `booking.paid` handler refreshes the payment status without a page
      // refresh. Accounting for a card/wallet booking is already posted by this
      // payment:succeeded event (booking_card_payment / booking_wallet_payment);
      // the accounting listener's booking:paid handler is idempotent
      // (hasPosting), so this emit cannot double-post.
      eventBusV2.emit('booking:paid', {
        bookingId,
        userId: booking.user_id,
        organisationId: booking.organisation_id || undefined,
        branchId: booking.branch_id || undefined,
        resourceId: booking.resource_id || undefined,
        courtId: booking.resource_id || undefined,
        paymentMethod: booking.payment_method || 'card',
        grossAmount: Number(booking.total_amount || 0),
        taxAmount: Number(booking.tax_amount || 0),
        coachAmount: Number(booking.coach_amount || 0),
        organisationAmount: Number(booking.club_amount || 0),
        commissionAmount: Number(booking.commission_amount || 0),
        currency: 'EGP',
        sourceId: bookingId,
      } as any);
    } catch (err: any) {
      log.error({ err, paymentId: data.paymentId, bookingId }, 'Booking: confirmBooking failed on payment succeeded');
    }
  });

  eventBusV2.on('payment:failed-event', async (data) => {
    if (data.referenceType === SERIES_PAYMENT_REFERENCE_TYPE) {
      await handleSeriesPaymentTerminal(data as any, (data as any).reason || CancellationReason.PAYMENT_DECLINED, 'failed');
      return;
    }
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId, reason: data.reason }, 'Booking: payment failed — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const reason1 = data.reason || CancellationReason.PAYMENT_DECLINED;
      const cancelCmd1: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: reason1 },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes1 = await commandPipeline.execute(cancelCmd1, {
        validate: async () => cancelBookingHandler.validate(cancelCmd1),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes1.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes1.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment failed');
    }
  });

  eventBusV2.on('payment:cancelled-event', async (data) => {
    if (data.referenceType === SERIES_PAYMENT_REFERENCE_TYPE) {
      await handleSeriesPaymentTerminal(data as any, CancellationReason.PAYMENT_CANCELLED_BY_USER, 'cancelled');
      return;
    }
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment cancelled — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const cancelCmd2: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: CancellationReason.PAYMENT_CANCELLED_BY_USER },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes2 = await commandPipeline.execute(cancelCmd2, {
        validate: async () => cancelBookingHandler.validate(cancelCmd2),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes2.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes2.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment cancelled');
    }
  });

  eventBusV2.on('payment:expired-event', async (data) => {
    if (data.referenceType === SERIES_PAYMENT_REFERENCE_TYPE) {
      await handleSeriesPaymentTerminal(data as any, CancellationReason.PAYMENT_TIMEOUT, 'expired');
      return;
    }
    if (data.referenceType !== 'booking') return;
    const bookingId = data.referenceId;
    if (!bookingId) return;
    log.info({ paymentId: data.paymentId, bookingId }, 'Booking: payment expired — cancelling booking');
    try {
      const booking = await bookingRepository.findById(bookingId);
      if (!booking) return;
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'expired') return;
      const cancelCmd3: Command = {
        commandId: `CancelBooking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: CancellationReason.PAYMENT_TIMEOUT },
        correlationId: `corr_${Date.now()}`,
      };
      const cancelRes3 = await commandPipeline.execute(cancelCmd3, {
        validate: async () => cancelBookingHandler.validate(cancelCmd3),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (cancelRes3.status === 'error') throw new Error(`CancelBooking failed: ${cancelRes3.message}`);
    } catch (err) {
      log.error({ err, bookingId }, 'Booking: cancelBooking failed on payment expired');
    }
  });

  log.info('Booking payment listeners registered');
}
