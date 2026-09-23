import { getPool } from '../../../database/mysql.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { courtReservationRepository } from '../infrastructure/repositories/court-reservation.repository.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { slotGenerator } from '../domain/slot-generator.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';

const log = createModuleLogger('court-reservation');

type RowData = import('mysql2').RowDataPacket[];

/**
 * G8 — SHARED non-financial court reservation capability.
 *
 * ONE SOURCE OF TRUTH: a tournament match reserves a court through the SAME
 * `bookings` + `booking_slots` tables, the SAME `bookingRepository.checkSlotAvailability`
 * overlap check (bookings + academy holds), the SAME `redisLock` distributed
 * locks and the SAME `resources` FOR UPDATE serialization point as every normal
 * booking. This is the "smallest shared capability" the tournament schedule
 * needs — NOT a parallel tournament_court_reservations engine.
 *
 * Deliberately NON-FINANCIAL:
 *   - total_amount = 0, booking_status = 'confirmed', payment_status = 'pending'
 *   - no payment gateway, no pricing/tax/commission, no transactions,
 *     no accounting entries, no wallet movement, no booking:paid/completed emit
 *   - the booking auto-complete worker skips booking_type='tournament'
 * The tournament module emits its own `tournament:*` realtime events.
 *
 * Concurrency: EVERY reservation operation (reserve / reschedule / release)
 * serializes on the SHARED `matches` row (`SELECT ... FOR UPDATE`) so two
 * concurrent operations can never leave two ACTIVE reservations for one match
 * — exactly one authoritative reservation at any time.
 */
export class CourtReservationService {
  /**
   * Reserve a court for a shared Match. Idempotent: if the match already holds
   * a reservation (matches.booking_id) it returns the existing reservation.
   * Concurrency-safe: matches row lock + Redis slot locks + resources FOR UPDATE
   * + the authoritative availability check, all in ONE transaction.
   */
  async reserveCourt(input: {
    userId: number;
    organisationId: number;
    branchId: number;
    resourceId: number;
    /** Branch-local booking date (YYYY-MM-DD). */
    date: string;
    /** Branch-local start time (HH:MM). */
    startTime: string;
    /** Branch-local end time (HH:MM; may cross midnight). */
    endTime: string;
    startAtUtc: string;
    endAtUtc: string;
    businessDate?: string;
    /** Shared matches.id to link (UNIQUE uk_booking = one reservation per match). */
    matchId: number;
    slotDurationMinutes?: number;
  }): Promise<{ bookingId: number; alreadyReserved: boolean }> {
    // Idempotency: a match with a linked reservation is never double-booked.
    const existingBookingId = await courtReservationRepository.findMatchBookingId(input.matchId);
    if (existingBookingId != null) {
      return { bookingId: existingBookingId, alreadyReserved: true };
    }

    const { slots, lockSlots, lockOwner } = this.prepareSlots(input);
    const lockAcquired = await redisLock.acquireAll(lockSlots, lockOwner);
    if (!lockAcquired) {
      throw new ConflictError('One or more court slots are currently being booked by another user. Please try again.', ErrorCodes.COURT_SLOT_UNAVAILABLE);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      // Serialize reservation operations for this match.
      await conn.query<RowData>('SELECT id FROM matches WHERE id = ? FOR UPDATE', [input.matchId]);
      await this.assertSlotAvailable(conn, input, slots);

      const bookingId = await bookingRepository.create({
        userId: input.userId,
        branchId: input.branchId,
        organisationId: input.organisationId,
        resourceId: input.resourceId,
        bookingType: 'tournament',
        bookingDate: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        totalAmount: 0,
        commissionAmount: 0,
        clubAmount: 0,
        coachAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        taxTreatment: 'exempt',
        priceType: 'net',
        notes: JSON.stringify({ referenceType: 'tournament_match', matchId: input.matchId }),
        bookingStatus: 'confirmed',
        paymentStatus: 'pending',
        startAtUtc: toMySqlDateTime(new Date(input.startAtUtc)),
        endAtUtc: toMySqlDateTime(new Date(input.endAtUtc)),
        businessDate: input.businessDate ?? input.date,
      }, conn);

      await courtReservationRepository.insertBookingSlots(
        bookingId,
        input.resourceId,
        input.date,
        slots.map((s) => ({ start: s.start, end: s.end })),
        conn,
      );
      await courtReservationRepository.linkMatchBooking(input.matchId, bookingId, conn);

      await conn.commit();
      log.info({ bookingId, matchId: input.matchId, resourceId: input.resourceId }, 'tournament.court_reserved');
      return { bookingId, alreadyReserved: false };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
      await redisLock.releaseAll(lockSlots, lockOwner).catch(() => {});
    }
  }

  /**
   * RESCHEDULE a match's reservation ATOMICALLY (exactly one authoritative
   * reservation at all times). The old reservation is released and the new one
   * created in the SAME transaction — never a window with two active bookings,
   * and the old reservation is untouched if the new slot is unavailable
   * (requirement E: the operation is transactional).
   *
   * The `matches` row FOR UPDATE serializes concurrent reschedule/release for
   * the same match: the loser observes the winner's new link and releases THAT
   * (never an orphaned old booking), so two concurrent reschedules can never
   * produce two active reservations.
   */
  async rescheduleCourt(
    input: {
      userId: number;
      organisationId: number;
      branchId: number;
      resourceId: number;
      date: string;
      startTime: string;
      endTime: string;
      startAtUtc: string;
      endAtUtc: string;
      businessDate?: string;
      matchId: number;
      slotDurationMinutes?: number;
    },
    releaseBookingId: number,
  ): Promise<{ bookingId: number; released: boolean }> {
    const { slots, lockSlots, lockOwner } = this.prepareSlots(input);
    const lockAcquired = await redisLock.acquireAll(lockSlots, lockOwner);
    if (!lockAcquired) {
      throw new ConflictError('One or more court slots are currently being booked by another user. Please try again.', ErrorCodes.COURT_SLOT_UNAVAILABLE);
    }

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      // Serialize ALL reservation operations for this match.
      await conn.query<RowData>('SELECT id FROM matches WHERE id = ? FOR UPDATE', [input.matchId]);
      // Re-read the authoritative link INSIDE the lock (stale-check).
      const current = await courtReservationRepository.findMatchBookingId(input.matchId, conn);
      const stillLinked = current != null && current === releaseBookingId;
      await this.assertSlotAvailable(conn, input, slots);

      const bookingId = await bookingRepository.create({
        userId: input.userId,
        branchId: input.branchId,
        organisationId: input.organisationId,
        resourceId: input.resourceId,
        bookingType: 'tournament',
        bookingDate: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        totalAmount: 0,
        commissionAmount: 0,
        clubAmount: 0,
        coachAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        taxTreatment: 'exempt',
        priceType: 'net',
        notes: JSON.stringify({ referenceType: 'tournament_match', matchId: input.matchId }),
        bookingStatus: 'confirmed',
        paymentStatus: 'pending',
        startAtUtc: toMySqlDateTime(new Date(input.startAtUtc)),
        endAtUtc: toMySqlDateTime(new Date(input.endAtUtc)),
        businessDate: input.businessDate ?? input.date,
      }, conn);

      await courtReservationRepository.insertBookingSlots(
        bookingId,
        input.resourceId,
        input.date,
        slots.map((s) => ({ start: s.start, end: s.end })),
        conn,
      );
      await courtReservationRepository.linkMatchBooking(input.matchId, bookingId, conn);
      // Release the OLD reservation only if it is still the authoritative link.
      const released = stillLinked
        ? await courtReservationRepository.releaseTournamentBooking(releaseBookingId, conn)
        : false;

      await conn.commit();
      log.info({ bookingId, matchId: input.matchId, releasedOld: released, oldBookingId: releaseBookingId }, 'tournament.court_rescheduled');
      return { bookingId, released };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
      await redisLock.releaseAll(lockSlots, lockOwner).catch(() => {});
    }
  }

  /**
   * Release a tournament court reservation (idempotent). Only ever touches
   * booking_type='tournament' rows — a normal financial booking is never
   * mutated by the tournament flow. Frees booking_slots + clears matches.booking_id.
   * The `matches` row lock serializes against concurrent reschedules.
   */
  async releaseCourt(matchId: number): Promise<{ released: boolean; bookingId: number | null }> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query<RowData>('SELECT id FROM matches WHERE id = ? FOR UPDATE', [matchId]);
      const bookingId = await courtReservationRepository.findMatchBookingId(matchId, conn);
      if (bookingId == null) {
        await conn.commit();
        return { released: false, bookingId: null };
      }
      const released = await courtReservationRepository.releaseTournamentBooking(bookingId, conn);
      if (released) {
        await courtReservationRepository.clearMatchBooking(matchId, conn);
      }
      await conn.commit();
      log.info({ bookingId, matchId }, released ? 'tournament.court_released' : 'tournament.court_release_skipped');
      return { released, bookingId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Authoritative availability check — throws a typed error; NEVER swallows infrastructure failures. */
  private async assertSlotAvailable(
    conn: import('mysql2/promise').PoolConnection,
    input: { resourceId: number; date: string; startTime: string; endTime: string },
    slots: { start: string; end: string }[],
  ): Promise<void> {
    const available = await bookingRepository.checkSlotAvailability(
      input.resourceId,
      input.date,
      slots.map((s) => ({ start: s.start, end: s.end, date: input.date })),
      conn,
    );
    if (!available) {
      throw new ConflictError('One or more court slots are no longer available', ErrorCodes.COURT_SLOT_UNAVAILABLE);
    }
  }

  private prepareSlots(input: { startTime: string; endTime: string; resourceId: number; date: string; userId: number; matchId: number; slotDurationMinutes?: number }) {
    const slotDuration = input.slotDurationMinutes ?? 60;
    const slots = slotGenerator.generate(input.startTime, input.endTime, slotDuration);
    if (slots.length === 0) {
      throw new ConflictError('Booking range does not cover any complete slot');
    }
    const lockSlots = slots.map((s) => ({ resourceId: input.resourceId, date: input.date, slotStart: s.start }));
    const lockOwner = `tournament:${input.userId}:${input.matchId}`;
    return { slots, lockSlots, lockOwner };
  }
}

export const courtReservationService = new CourtReservationService();