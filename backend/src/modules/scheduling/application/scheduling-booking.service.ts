import { bookingService } from '../../booking/application/booking.service.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { redisLock } from '../../booking/infrastructure/redis/redis-lock.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { calculateCoachSessionPrice, calculateCoachEarningsSplit } from './coach-pricing.js';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('scheduling');

const COACH_LOCK_TTL_MS = 15000;

/**
 * Parse the coach's stored sport list. `sports` is persisted as a JSON array
 * string (or an array). Legacy coaches may hold multiple sports; the current
 * single-sport rule uses the list for eligibility matching.
 */
function parseCoachSports(sports: unknown): number[] {
  if (!sports) return [];
  try {
    const raw = typeof sports === 'string' ? JSON.parse(sports) : sports;
    if (!Array.isArray(raw)) return [];
    return raw.map((n: any) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

export interface BookSessionRequest {
  coachId: number;
  resourceId: number;
  date: string;
  startTime: string;
  endTime: string;
  paymentMethod?: string;
}

export class SchedulingBookingService {
  async bookSession(request: BookSessionRequest, userId: number) {
    const { coachId, resourceId, date, startTime, endTime } = request;
    const lockOwner = `scheduling:${userId}:${Date.now()}`;

    log.info({ userId, coachId, resourceId, date, startTime, endTime }, 'Booking session requested');

    // 1. Validate coach exists. Approved status + availability + service location +
    //    branch policy + agreement are enforced by the canonical
    //    isCoachEligibleAtBranch check below (search and booking agree).
    const coachProfile = await activitiesRepository.findCoachById(coachId);
    if (!coachProfile) {
      log.warn({ coachId }, 'Coach not found or not approved');
      throw new NotFoundError('Coach not found or not approved');
    }

    // 2. Validate court exists and is active
    const court = await resourceRepository.findById(resourceId);
    if (!court || !court.is_active) {
      log.warn({ resourceId, isActive: court?.is_active }, 'Court not found or not active');
      throw new NotFoundError('Court not found or not active');
    }

    const branchId = court.branch_id;

    // 3. Enforce branch coach policy + service access BEFORE locking/bookings.
    //    - The coach must have explicit service access to the branch.
    //    - If the branch policy is 'contract_required', the coach must also have
    //      an active/accepted organisation agreement.
    //    - If 'independent_coaches_allowed', no agreement is required (org gets 0%).
    const branchPolicy = await activitiesRepository.getBranchCoachPolicy(branchId);
    const eligibility = await activitiesRepository.isCoachEligibleAtBranch(coachId, branchId);
    if (!eligibility.eligible) {
      log.warn({ coachId, branchId, policy: branchPolicy, reason: eligibility.reason }, 'Coach not eligible at branch');
      throw new ForbiddenError(eligibility.reason || 'Coach is not eligible to provide coaching services at this branch.');
    }

    // 3b. Sport compatibility — the coach must support the court's sport. The
    //     search layer applies this too, but the booking endpoint must enforce it
    //     server-side so a legacy empty-sport coach (or a mismatched pick) can
    //     never be booked. Empty coach sports are treated as invalid (they have
    //     not selected a sport) and rejected.
    const courtSportId = court.sport_id ? Number(court.sport_id) : null;
    const coachSportIds = parseCoachSports(coachProfile.sports);
    if (!courtSportId) {
      throw new ForbiddenError('Court has no sport configured — coach booking unavailable');
    }
    if (coachSportIds.length === 0) {
      throw new ForbiddenError('Coach has not selected a sport — cannot be booked');
    }
    if (!coachSportIds.includes(courtSportId)) {
      throw new ForbiddenError('Coach does not support the sport of the selected court');
    }

    // 3c. Resolve the branch organisation (resources have no organisation_id;
    //     the organisation belongs to the branch). Used for the accepted
    //     agreement lookup and the persisted coach_sessions.organisation_id.
    const organisationId = await activitiesRepository.getBranchOrganisationId(branchId);

    // 4. Calculate coach session pricing.
    //    Coach duration ALWAYS equals the court booking duration (same start/end
    //    window) and the coach is charged its hourly rate prorated by that
    //    duration via the shared canonical helper.
    const coachHourlyRate = coachProfile.hourly_rate ? Number(coachProfile.hourly_rate) : 0;
    const sessionPrice = calculateCoachSessionPrice(coachHourlyRate, startTime, endTime);

    // 5. Calculate platform commission AND org split.
    //    - Platform commission always applies on the coach fee.
    //    - For CONTRACTED coaches (contract_required branch + active agreement),
    //      the organisation receives its agreed share (org_split_pct) of the
    //      post-commission net. The coach keeps the remainder.
    //    - For INDEPENDENT coaches, the organisation gets 0% — the coach keeps
    //      the full post-commission net.
    let coachCommissionPct = 0;
    let coachEarnings = sessionPrice;
    let orgEarnings = 0;
    let orgSplitPct = 0;
    try {
      const coachComm = await commissionService.calculate(
        organisationId || 0, 'coach_session', sessionPrice,
      );
      coachCommissionPct = coachComm.rate;
      const postCommissionNet = coachComm.netAmount;
      let agreement: any = null;
      if (branchPolicy === 'contract_required' && organisationId != null) {
        agreement = await activitiesRepository.getAcceptedAgreement(coachId, organisationId);
      }
      const split = calculateCoachEarningsSplit({
        branchPolicy,
        postCommissionNet,
        orgSplitPct: agreement ? Number((agreement as any).org_split_pct ?? 0) : 0,
        coachSplitPct: agreement ? Number((agreement as any).coach_split_pct ?? 100) : 100,
        hasAgreement: !!agreement,
      });
      orgSplitPct = split.orgSplitPct;
      coachEarnings = split.coachEarnings;
      orgEarnings = split.orgEarnings;
    } catch { /* non-fatal */ }

    // 6. Acquire distributed Redis lock on the COACH slot to prevent double-booking
    //    This is separate from the court lock acquired inside bookingService.createBooking()
    const coachLocked = await redisLock.acquireCoach(coachId, date, startTime, lockOwner);
    if (!coachLocked) {
      log.warn({ coachId, date, startTime }, 'Coach slot already locked by another request');
      throw new ConflictError('This coach is currently being booked by another user. Please try again.');
    }

    try {
      // 7. Check coach availability (inside the lock — no race window)
      const coachAvailable = await this.checkCoachAvailable(coachId, date, startTime, endTime);
      if (!coachAvailable) {
        log.warn({ coachId, date, startTime, endTime }, 'Coach is no longer available');
        throw new ConflictError('Coach is no longer available at this time');
      }

      // 8. Create court booking via existing BookingService
      //    This handles: Redis locks on court slots, wallet, pricing, commission, events, reminders
      log.info({ userId, coachId, resourceId, date, startTime, endTime }, 'Creating court booking');
      const bookingResult = await bookingService.createBooking({
        branchId,
        resourceId,
        bookingDate: date,
        startTime,
        endTime,
        bookingType: 'coach_session',
        // The coach is resolved server-side and the fee is computed via the
        // canonical pricing helper inside createBooking — the client never
        // supplies a coach amount.
        coachId,
        paymentMethod: (request.paymentMethod || 'wallet') as 'wallet' | 'cash' | 'card' | 'online' | 'cod',
        notes: `Coach session with coach #${coachId}`,
      }, userId);

      const bookingId = (bookingResult as any).id;
      const bookingStatus = (bookingResult as any).booking_status;
      const paymentStatus = (bookingResult as any).payment_status;
      const totalAmount = Number((bookingResult as any).total_amount);
      const commissionAmount = Number((bookingResult as any).commission_amount);
      log.info({ bookingId, status: bookingStatus }, 'Court booking created');

      // 9. Create coach session record
      //    If this fails, we MUST compensate by cancelling the booking
      let sessionId: number;
      try {
        sessionId = await activitiesRepository.createCoachSession({
          coachId,
          organisationId,
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
        log.error({ err: sessionErr, bookingId, coachId, userId }, 'Coach session creation failed — initiating compensation');

        const compensation = await this.compensateBooking(bookingId, userId, 'Coach session creation failed');

        if (compensation.refunded) {
          log.warn({ bookingId, refundAmount: compensation.refundAmount }, 'Booking cancelled and refunded after coach session failure');
          throw new ConflictError('Booking could not be completed. Please try again. Your payment has been refunded.');
        }
        log.warn({ bookingId }, 'Booking cancelled after coach session failure (no money moved — no refund)');
        throw new ConflictError('Booking could not be completed. Please try again.');
      }

      // 10. Link booking to session
      try {
        await activitiesRepository.updateSessionBooking(sessionId, bookingId, 'scheduled');
      } catch (linkErr) {
        // Linking failed — the coach session exists but is not linked to the
        // booking. Cancel the orphan session so it cannot keep blocking the
        // coach's slot (checkCoachAvailable excludes only cancelled/no_show/
        // completed), then compensate the booking canonically.
        log.error({ err: linkErr, sessionId, bookingId }, 'Session-booking link failed — cancelling orphan session + compensating');
        try {
          await activitiesRepository.cancelCoachSession(sessionId);
          log.warn({ sessionId }, 'Orphan coach session cancelled after link failure');
        } catch (cancelErr) {
          log.error({ err: cancelErr, sessionId }, 'Failed to cancel orphan coach session — coach slot may remain blocked; manual review required');
        }

        const compensation = await this.compensateBooking(bookingId, userId, 'Session-booking link failed');

        if (compensation.refunded) {
          log.warn({ bookingId, refundAmount: compensation.refundAmount }, 'Booking cancelled and refunded after session-booking link failure');
          throw new ConflictError('Booking could not be completed. Please try again. Your payment has been refunded.');
        }
        log.warn({ bookingId }, 'Booking cancelled after session-booking link failure (no money moved — no refund)');
        throw new ConflictError('Booking could not be completed. Please try again.');
      }

      log.info({ bookingId, sessionId, userId, coachId, total: totalAmount }, 'Booking session completed successfully');

      return {
        bookingId,
        sessionId,
        status: bookingStatus,
        priceBreakdown: {
          courtFee: totalAmount - sessionPrice,
          coachFee: sessionPrice,
          coachEarnings,
          orgEarnings,
          orgSplitPct,
          platformFee: commissionAmount + (sessionPrice - (coachEarnings + orgEarnings)),
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
   * Compensate a failed coach-booking saga. Delegates to the CANONICAL
   * compensation path (bookingService.compensateFailedBooking), which:
   *   - cancels the booking via the canonical CancelBooking command,
   *   - decides whether money actually moved from AUTHORITATIVE persisted state
   *     (payment_transactions paid, or a wallet_transactions debit) — never a
   *     premature booking.payment_status,
   *   - refunds via the canonical wallet/gateway/COD path (booking:refunded
   *     emitted exactly once, accounting reversed through the existing listener,
   *     idempotent via the refunded_amount cap),
   *   - propagates refund failures.
   * Compensation therefore ORCHESTRATES the canonical path — it does not
   * duplicate wallet/ledger logic. A failure here is surfaced (never reported
   * as a successful refund).
   */
  private async compensateBooking(bookingId: number, userId: number, reason: string): Promise<{ cancelled: boolean; refunded: boolean; refundAmount: number }> {
    try {
      const result = await bookingService.compensateFailedBooking(bookingId, reason);
      log.info({ bookingId, ...result, reason }, 'Compensation completed');
      return result;
    } catch (err) {
      // Never swallow a failed compensation: the booking may be cancelled
      // without a completed refund, which must be visible to operations/audit.
      log.error({ err, bookingId, userId, reason }, 'Compensation FAILED — booking may be cancelled without a completed refund; manual review required');
      throw err;
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
