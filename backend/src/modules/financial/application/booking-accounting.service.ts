import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('booking-accounting');
type RowData = RowDataPacket[];

export interface BookingEconomics {
  bookingId: number;
  organisationId: number | null;
  grossAmount: number;
  taxAmount: number;
  commissionAmount: number;
  coachAmount: number;
  orgAmount: number;
  paymentMethod: string;
  currency: string;
}

/**
 * Resolves the authoritative economic split for a booking from the persisted
 * domain data. This is the SINGLE source of booking economics for accounting.
 *
 * The booking row already stores: total_amount, commission_amount,
 * club_amount (org net), tax_amount (snapshot), coach_amount (snapshot).
 * We do NOT recalculate commission/coach/tax here — we consume the snapshot.
 */
export async function resolveBookingEconomics(bookingId: number): Promise<BookingEconomics | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id, organisation_id, total_amount, tax_amount, commission_amount,
            club_amount, coach_amount, payment_method
     FROM bookings WHERE id = ? LIMIT 1`,
    [bookingId],
  );
  if (!rows.length) return null;

  const b = rows[0] as any;
  const gross = Number(b.total_amount || 0);
  const tax = Number(b.tax_amount || 0);
  const commission = Number(b.commission_amount || 0);
  // Coach share is authoritative from coach_sessions when a coach is linked;
  // the bookings.coach_amount snapshot is the fallback.
  let coach = Number(b.coach_amount || 0);
  const linkedCoach = await resolveCoachPayable(bookingId);
  if (linkedCoach) {
    coach = linkedCoach.coachAmount;
  }
  // club_amount already = gross - commission (org net). If absent, derive.
  const orgAmount = b.club_amount != null
    ? Number(b.club_amount)
    : Math.max(0, gross - commission - coach - tax);

  return {
    bookingId,
    organisationId: b.organisation_id ?? null,
    grossAmount: gross,
    taxAmount: tax,
    commissionAmount: commission,
    coachAmount: coach,
    orgAmount,
    paymentMethod: b.payment_method || 'card',
    currency: 'EGP',
  };
}

/**
 * Resolves the coach-earnings split from a linked coach_session, if any.
 * Returns the coach payable amount (authoritative from coach_sessions).
 */
export async function resolveCoachPayable(bookingId: number): Promise<{ coachAmount: number; orgAmount: number } | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT coach_earnings, org_earnings FROM coach_sessions WHERE booking_id = ? AND status IN ('completed','confirmed','in_progress') LIMIT 1`,
    [bookingId],
  );
  if (!rows.length) return null;
  const s = rows[0] as any;
  return { coachAmount: Number(s.coach_earnings || 0), orgAmount: Number(s.org_earnings || 0) };
}

export const bookingAccounting = { resolveBookingEconomics, resolveCoachPayable, computeRefundEconomics };

export interface RefundEconomics {
  bookingId: number;
  organisationId: number | null;
  refundedAmount: number;
  refundRatio: number;
  orgAmount: number;
  commissionAmount: number;
  taxAmount: number;
  coachAmount: number;
  paymentAmount: number;
  paymentMethod: string;
  currency: string;
}

/**
 * Compute proportional refund economics from the ORIGINAL booking snapshot.
 * Never recalculates commission/coach/tax — strictly prorates the snapshot.
 */
export async function computeRefundEconomics(bookingId: number, refundedAmount: number): Promise<RefundEconomics | null> {
  const econ = await resolveBookingEconomics(bookingId);
  if (!econ) return null;

  const grossPayable = econ.orgAmount + econ.commissionAmount + econ.taxAmount;
  if (grossPayable <= 0) return null;

  const ratio = Math.min(Math.max(refundedAmount / grossPayable, 0), 1);
  const rnd = (n: number) => Math.round(n * 100) / 100;

  return {
    bookingId,
    organisationId: econ.organisationId,
    refundedAmount: rnd(refundedAmount),
    refundRatio: ratio,
    orgAmount: rnd(econ.orgAmount * ratio),
    commissionAmount: rnd(econ.commissionAmount * ratio),
    taxAmount: rnd(econ.taxAmount * ratio),
    coachAmount: rnd(econ.coachAmount * ratio),
    paymentAmount: rnd(refundedAmount),
    paymentMethod: econ.paymentMethod,
    currency: econ.currency,
  };
}
