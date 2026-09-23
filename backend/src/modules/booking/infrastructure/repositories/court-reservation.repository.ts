import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];

/**
 * G8 — persistence for the SHARED non-financial court reservation capability.
 *
 * Reuses the SAME `bookings` + `booking_slots` tables as the rest of the
 * Booking domain (one source of truth for court availability). This repository
 * only adds the thin tournament linkage helpers — it does NOT duplicate the
 * availability/locking logic (that lives in `bookingRepository.checkSlotAvailability`
 * + `redisLock`).
 */
export class CourtReservationRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private resolve(conn?: mysql.PoolConnection): mysql.Pool | mysql.PoolConnection {
    return conn ?? this.pool;
  }

  /** Insert blocked booking_slots rows for a reservation (is_available = FALSE). */
  async insertBookingSlots(
    bookingId: number,
    resourceId: number,
    date: string,
    slots: { start: string; end: string }[],
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = this.resolve(conn);
    for (const slot of slots) {
      await db.execute<ResultSetHeader>(
        `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
         VALUES (?, ?, ?, ?, ?, FALSE)`,
        [bookingId, resourceId, date, slot.start, slot.end],
      );
    }
  }

  /** Link a shared Match to its court reservation (UNIQUE uk_booking: one reservation per match). */
  async linkMatchBooking(matchId: number, bookingId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute<ResultSetHeader>('UPDATE matches SET booking_id = ? WHERE id = ?', [bookingId, matchId]);
  }

  /** Clear the shared Match's reservation link (release path). */
  async clearMatchBooking(matchId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute<ResultSetHeader>('UPDATE matches SET booking_id = NULL WHERE id = ?', [matchId]);
  }

  /** The reservation (booking) currently linked to a shared Match, if any. */
  async findMatchBookingId(matchId: number, conn?: mysql.PoolConnection): Promise<number | null> {
    const db = this.resolve(conn);
    const [rows] = await db.execute<RowData>('SELECT booking_id FROM matches WHERE id = ?', [matchId]);
    return rows.length && rows[0].booking_id != null ? Number(rows[0].booking_id) : null;
  }

  /**
   * Release a tournament court reservation: mark the booking cancelled and free
   * its booking_slots. Only touches booking_type='tournament' rows (a normal
   * financial booking is never mutated by the tournament flow).
   */
  async releaseTournamentBooking(bookingId: number, conn?: mysql.PoolConnection): Promise<boolean> {
    const db = this.resolve(conn);
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE bookings SET booking_status = 'cancelled', payment_status = 'pending', updated_at = NOW()
       WHERE id = ? AND booking_type = 'tournament' AND booking_status NOT IN ('cancelled','completed')`,
      [bookingId],
    );
    if ((result as any).affectedRows > 0) {
      await db.execute<ResultSetHeader>(
        'UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ?',
        [bookingId],
      );
      return true;
    }
    return false;
  }

  /** Find the tournament booking row linked to a shared Match (booking_type='tournament' only). */
  async findTournamentBooking(matchId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT b.* FROM bookings b JOIN matches m ON m.booking_id = b.id
       WHERE m.id = ? AND b.booking_type = 'tournament'`,
      [matchId],
    );
    return rows.length ? rows[0] : null;
  }
}

export const courtReservationRepository = new CourtReservationRepository();