// ============================================================================
// CourtZon — Player Booking Window Policy (R1)
// ============================================================================
// The 7-day advance-booking rule for ordinary PLAYER bookings.
//
//   minDate = branch-local calendar "today"
//   maxDate = branch-local "today" + 6 calendar days
//
// Dates are compared as CALENDAR dates in the BRANCH timezone (from
// `branches.timezone`), never in the server/host timezone and never in the
// browser timezone. The branch-local "today" is derived via Intl.DateTimeFormat
// through the shared TimeEngine → utc-converter (DST-safe), and the +N-day
// arithmetic uses Date.UTC accessors ONLY — never `new Date('YYYY-MM-DD')`
// server-local parsing — so a DST boundary never changes the number of allowed
// days.
//
// Administrative bypass (super_admin role, `admin.bookings.update-status` or
// `org.bookings.manage` permissions) is decided OUTSIDE this pure policy, in
// BookingService.canBypassPlayerBookingWindow(). This file has no DB, no
// request, and no role knowledge — it only answers "is YYYY-MM-DD inside the
// branch-local 7-day window?" for a given instant.
// ============================================================================

import { TimeEngine } from '../../time/index.js';
import type { IANATimezone } from '../../time/types.js';

export type BookingWindowReason = 'BELOW_MIN' | 'ABOVE_MAX' | 'INVALID_DATE' | 'INVALID_TIMEZONE';

export interface BookingWindowEvaluateInput {
  /** Booking calendar date, YYYY-MM-DD, expressed in the branch timezone. */
  bookingDate: string;
  /** Branch IANA timezone. */
  timezone: IANATimezone;
  /** Injectable current instant (UTC ISO/Date). Defaults to TimeEngine.now(). */
  now?: string | Date;
  /** Window length in calendar days (today .. today + windowDays - 1). Default 7. */
  windowDays?: number;
}

export interface BookingWindowInfo {
  /** Branch-local first bookable calendar date (today). */
  minDate: string;
  /** Branch-local last bookable calendar date (today + 6). */
  maxDate: string;
  /** Branch IANA timezone used for the computation. */
  timezone: IANATimezone;
}

export type BookingWindowEvaluation = BookingWindowInfo & {
  allowed: boolean;
  reason?: BookingWindowReason;
};

export class BookingWindowPolicy {
  static readonly DEFAULT_WINDOW_DAYS = 7;

  /**
   * Branch-local booking window: { minDate: today, maxDate: today + days - 1 }.
   * The current instant is resolved through TimeEngine.now() unless injected.
   * Throws RangeError for an invalid IANA timezone (the create path would fail
   * on the same empty/invalid timezone when converting local times to UTC).
   */
  static getWindow(input: { timezone: IANATimezone; now?: string | Date; windowDays?: number }): BookingWindowInfo {
    const days = input.windowDays ?? BookingWindowPolicy.DEFAULT_WINDOW_DAYS;
    const instant = input.now ? new Date(String(input.now)).toISOString() : TimeEngine.now();
    // Branch-local calendar "today" via Intl.DateTimeFormat (TimeEngine facade).
    const minDate = TimeEngine.utcToLocalDate(instant, input.timezone);
    const maxDate = addCalendarDays(minDate, days - 1);
    return { minDate, maxDate, timezone: input.timezone };
  }

  /**
   * Evaluate a requested booking date against the player booking window.
   * YYYY-MM-DD strings compare chronologically under lexicographic ordering, so
   * no UTC Date construction is needed for the comparison itself.
   */
  static evaluate(input: BookingWindowEvaluateInput): BookingWindowEvaluation {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.bookingDate)) {
      return { allowed: false, reason: 'INVALID_DATE', minDate: '', maxDate: '', timezone: input.timezone };
    }
    let window: BookingWindowInfo;
    try {
      window = BookingWindowPolicy.getWindow(input);
    } catch {
      return { allowed: false, reason: 'INVALID_TIMEZONE', minDate: '', maxDate: '', timezone: input.timezone };
    }
    if (input.bookingDate < window.minDate) {
      return { ...window, allowed: false, reason: 'BELOW_MIN' };
    }
    if (input.bookingDate > window.maxDate) {
      return { ...window, allowed: false, reason: 'ABOVE_MAX' };
    }
    return { ...window, allowed: true };
  }
}

/**
 * Calendar-date arithmetic on YYYY-MM-DD using Date.UTC accessors only.
 * The result is the exact calendar date `days` days later, independent of DST
 * offsets and completely immune to the server/host local timezone.
 */
function addCalendarDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return [
    String(target.getUTCFullYear()).padStart(4, '0'),
    String(target.getUTCMonth() + 1).padStart(2, '0'),
    String(target.getUTCDate()).padStart(2, '0'),
  ].join('-');
}