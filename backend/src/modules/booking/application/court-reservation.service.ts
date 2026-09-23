import { getPool } from '../../../database/mysql.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { courtReservationRepository } from '../infrastructure/repositories/court-reservation.repository.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { slotGenerator } from '../domain/slot-generator.js';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';

const log = createModuleLogger('court-reservation');

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
 */
export class CourtReservationService {
  /**
   * Reserve a court for a shared Match. Idempotent: if the match already holds
   * a reservation (matches.booking_id) it returns the existing reservation.
   * Concurrency-safe: Redis slot locks + resources row FOR UPDATE + the
   * authoritative availability check, all in ONE transaction.
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

    const slotDuration = input.slotDurationMinutes ?? 60;
    const slots = slotGenerator.generate(input.startTime, input.endTime, slotDuration);
    if (slots.length === 0) {
      throw new ConflictError('Booking range does not cover any complete slot');
    }
    const lockSlots = slots.map((s) => ({ resourceId: input.resourceId, date: input.date, slotStart: s.start }));
    const lockOwner = `tournament:${input.userId}:${input.matchId}`;

    const lockAcquired = await redisLock.acquireAll(lockSlots, lockOwner);
    if (!lockAcquired) {
      throw new ConflictError('One or more court slots are currently being booked by another user. Please try again.');
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Authoritative availability (normal bookings + academy holds) with the
      // resources row locked FOR UPDATE — the shared serialization point.
      const available = await bookingRepository.checkSlotAvailability(
        input.resourceId,
        input.date,
        slots.map((s) => ({ start: s.start, end: s.end, date: input.date })),
        conn,
      );
      if (!available) {
        throw new ConflictError('One or more court slots are no longer available');
      }

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
   * Release a tournament court reservation (idempotent). Only ever touches
   * booking_type='tournament' rows — a normal financial booking is never
   * mutated by the tournament flow. Frees booking_slots + clears matches.booking_id.
   */
  async releaseCourt(matchId: number): Promise<{ released: boolean; bookingId: number | null }> {
    const bookingId = await courtReservationRepository.findMatchBookingId(matchId);
    if (bookingId == null) return { released: false, bookingId: null };
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
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
}

export const courtReservationService = new CourtReservationService();