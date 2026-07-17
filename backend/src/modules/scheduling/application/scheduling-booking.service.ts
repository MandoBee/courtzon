import { bookingService } from '../../booking/application/booking.service.js';
import { commissionService } from '../../../shared/services/commission.service.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { redisLock } from '../../booking/infrastructure/redis/redis-lock.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import { cancelBooking } from '../../../platform/booking/BookingSaga.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('scheduling');

const COACH_LOCK_TTL_MS = 15000;

export interface BookSessionRequest {
  coachId: number;
  resourceId: number;
  date: string;
  startTime: string;
  endTime: string;
}

export class SchedulingBookingService {
  async bookSession(request: BookSessionRequest, userId: number) {
    const { coachId, resourceId, date, startTime, endTime } = request;
    const lockOwner = `scheduling:${userId}:${Date.now()}`;

    log.info({ userId, coachId, resourceId, date, startTime, endTime }, 'Booking session requested');

    // 1. Validate coach exists and is approved
    const coachProfile = await activitiesRepository.findCoachById(coachId);
    if (!coachProfile || coachProfile.status !== 'approved') {
      log.warn({ coachId, status: coachProfile?.status }, 'Coach not found or not approved');
      throw new NotFoundError('Coach not found or not approved');
    }

    // 2. Validate court exists and is active
    const court = await resourceRepository.findById(resourceId);
    if (!court || !court.is_active) {
      log.warn({ resourceId, isActive: court?.is_active }, 'Court not found or not active');
      throw new NotFoundError('Court not found or not active');
    }

    const branchId = court.branch_id;

    // 3. Calculate coach session pricing
    const coachHourlyRate = coachProfile.hourly_rate ? Number(coachProfile.hourly_rate) : 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    const sessionPrice = coachHourlyRate * durationHours;

    // 4. Calculate platform commission on coach fee
    let coachCommissionPct = 0;
    let coachEarnings = sessionPrice;
    let orgEarnings = 0;
    try {
      const coachComm = await commissionService.calculate(
        court.organisation_id || 0, 'coach_session', sessionPrice,
      );
      coachCommissionPct = coachComm.rate;
      coachEarnings = coachComm.netAmount;
    } catch { /* non-fatal */ }

    // 5. Acquire distributed Redis lock on the COACH slot to prevent double-booking
    //    This is separate from the court lock acquired inside bookingService.createBooking()
    const coachLocked = await redisLock.acquireCoach(coachId, date, startTime, lockOwner);
    if (!coachLocked) {
      log.warn({ coachId, date, startTime }, 'Coach slot already locked by another request');
      throw new ConflictError('This coach is currently being booked by another user. Please try again.');
    }

    try {
      // 6. Check coach availability (inside the lock — no race window)
      const coachAvailable = await this.checkCoachAvailable(coachId, date, startTime, endTime);
      if (!coachAvailable) {
        log.warn({ coachId, date, startTime, endTime }, 'Coach is no longer available');
        throw new ConflictError('Coach is no longer available at this time');
      }

      // 7. Create court booking via existing BookingService
      //    This handles: Redis locks on court slots, wallet, pricing, commission, events, reminders
      log.info({ userId, coachId, resourceId, date, startTime, endTime }, 'Creating court booking');
      const bookingResult = await bookingService.createBooking({
        branchId,
        resourceId,
        bookingDate: date,
        startTime,
        endTime,
        bookingType: 'coach_session',
        paymentMethod: 'wallet',
        notes: `Coach session with coach #${coachId}`,
      }, userId);

      const bookingId = (bookingResult as any).id;
      const bookingStatus = (bookingResult as any).booking_status;
      const paymentStatus = (bookingResult as any).payment_status;
      const totalAmount = Number((bookingResult as any).total_amount);
      const commissionAmount = Number((bookingResult as any).commission_amount);
      log.info({ bookingId, status: bookingStatus }, 'Court booking created');

      // 8. Create coach session record
      //    If this fails, we MUST compensate by cancelling the booking
      let sessionId: number;
      try {
        sessionId = await activitiesRepository.createCoachSession({
          coachId,
          organisationId: court.organisation_id || null,
          branchId,
          resourceId,
          playerId: userId,
          startTime: `${date}T${startTime}:00`,
          endTime: `${date}T${endTime}:00`,
          price: sessionPrice,
          currencyCode: coachProfile.currency_code || 'EGP',
          platformCommissionPct: coachCommissionPct,
          coachEarnings,
          orgEarnings,
        });
        log.info({ sessionId, bookingId, coachId }, 'Coach session created');
      } catch (sessionErr) {
        // COMPENSATION: Coach session creation failed after booking was committed.
        // We must cancel the booking to avoid financial inconsistency.
        log.error({ err: sessionErr, bookingId, coachId, userId }, 'Coach session creation failed — initiating compensation');

        await this.compensateBooking(bookingId, userId, 'Coach session creation failed');

        log.warn({ bookingId }, 'Booking compensated (cancelled + refunded) due to coach session failure');
        throw new ConflictError('Booking could not be completed. Please try again. Your payment has been refunded.');
      }

      // 9. Link booking to session
      try {
        await activitiesRepository.updateSessionBooking(sessionId, bookingId, 'scheduled');
      } catch (linkErr) {
        // Linking failed — coach session exists but is not linked to booking.
        // This is a non-critical inconsistency: the session exists and the booking exists,
        // but they're not linked. The session can be found by time/player.
        // We still compensate to maintain strict consistency.
        log.error({ err: linkErr, sessionId, bookingId }, 'Session-booking link failed — initiating compensation');

        await this.compensateBooking(bookingId, userId, 'Session-booking link failed');

        throw new ConflictError('Booking could not be completed. Please try again. Your payment has been refunded.');
      }

      log.info({ bookingId, sessionId, userId, coachId, total: totalAmount }, 'Booking session completed successfully');

      return {
        bookingId,
        sessionId,
        status: bookingStatus,
        priceBreakdown: {
          courtFee: totalAmount - sessionPrice,
          coachFee: sessionPrice,
          platformFee: commissionAmount + (sessionPrice - coachEarnings),
          total: totalAmount,
          currency: coachProfile.currency_code || 'EGP',
        },
      };
    } finally {
      // ALWAYS release the coach lock, regardless of outcome
      await redisLock.releaseCoach(coachId, date, startTime, lockOwner).catch((err) =>
        log.error({ err, coachId, date, startTime }, 'Failed to release coach lock')
      );
    }
  }

  /**
   * Compensate a failed booking: cancel it and refund any payment.
   * This bypasses the cancellation window check since it's a system-initiated
   * compensation for a failed coach session creation.
   */
  private async compensateBooking(bookingId: number, userId: number, reason: string): Promise<void> {
    const pool = getPool();

    try {
      const booking = await bookingService.getBooking(bookingId);
      if (!booking) {
        log.error({ bookingId }, 'Compensation: booking not found');
        return;
      }

      if (booking.booking_status === 'cancelled') {
        log.info({ bookingId }, 'Compensation: booking already cancelled');
        return;
      }

      const isPaid = booking.payment_status === 'paid';
      const totalAmount = Number(booking.total_amount);

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await cancelBooking(bookingId, userId, reason || CancellationReason.COMPENSATION, 0, conn);
        await conn.commit();
        log.info({ bookingId, isPaid, totalAmount }, 'Compensation: booking cancelled via saga');
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      if (isPaid) {
        try {
          const wallet = await (await import('../../wallet/infrastructure/repositories/wallet.repository.js')).walletRepository.findByUserId(userId);
          if (wallet) {
            const walletState = await (await import('../../wallet/infrastructure/repositories/wallet.repository.js')).walletRepository.lockAndGetBalance(wallet.id);
            if (walletState) {
              const newBalance = walletState.balance + totalAmount;
              await (await import('../../wallet/infrastructure/repositories/wallet.repository.js')).walletRepository.updateBalance(wallet.id, newBalance, walletState.version);

              await (await import('../../financial/application/transaction.service.js')).transactionService.createRefund({
                userId,
                walletId: wallet.id,
                branchId: booking.branch_id,
                organisationId: booking.organisation_id,
                amount: totalAmount,
                sourceId: bookingId,
                description: `Compensation refund: ${reason}`,
              });

              log.info({ bookingId, userId, amount: totalAmount }, 'Compensation: wallet refunded');
            }
          }
        } catch (refundErr) {
          log.error({ err: refundErr, bookingId, userId }, 'Compensation: wallet refund failed — manual intervention required');
        }
      }
    } catch (err) {
      log.error({ err, bookingId, userId }, 'Compensation workflow failed — manual intervention required');
    }
  }

  private async checkCoachAvailable(
    coachId: number,
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM coach_sessions
       WHERE coach_id = ? AND DATE(start_time) = ?
       AND status NOT IN ('cancelled', 'no_show', 'completed')
       AND start_time < ? AND end_time > ?`,
      [coachId, date, `${date}T${endTime}:00`, `${date}T${startTime}:00`],
    );
    return rows.length === 0;
  }
}

export const schedulingBookingService = new SchedulingBookingService();
