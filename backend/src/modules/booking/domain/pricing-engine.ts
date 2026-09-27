import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { TimeEngine } from '../../time/time-engine.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

export interface PriceBreakdown {
  totalPrice: number;
  standardAmount: number;
  peakAmount: number;
  peakMultiplier: number;
  /** Canonical pricing weekday used (1=Mon .. 7=Sun) — for traceability. */
  dayOfWeek: number;
  /** Occurrence local date the weekday came from; null in legacy (no-context) mode. */
  pricingDate: string | null;
}

/**
 * R5-A — explicit occurrence context for canonical pricing.
 *
 * A recurring occurrence is LOCAL-TIME-FIRST: it already knows its own branch
 * local calendar date. Supplying that date makes the weekday deterministic and
 * removes the dependency on the machine/server current date.
 *
 * Provide EITHER:
 *   `date`      — the branch-local calendar date (YYYY-MM-DD) the session starts
 *                 on. Preferred: it is the recurrence's intent, so it stays
 *                 correct across DST gaps/overlaps. No timezone needed.
 *   `startAtUtc` + `timezone` — a UTC instant to be resolved back to the
 *                 branch-local date first (used when only an instant is known).
 */
export interface PricingOccurrence {
  date?: string;
  timezone?: string;
  startAtUtc?: string;
}

export class PricingEngine {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Canonical booking price for a resource + time window.
   *
   * `occurrence` is OPTIONAL and backward compatible. When omitted the weekday
   * falls back to the historical behaviour (the server's current date), so
   * every pre-existing single-booking caller keeps producing the exact same
   * price as before R5-A. Recurring callers MUST pass the occurrence so each
   * occurrence is priced on its OWN local date.
   */
  async calculatePrice(
    resourceId: number,
    startTime: string,
    endTime: string,
    occurrence?: PricingOccurrence,
  ): Promise<PriceBreakdown> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT hourly_price, branch_id FROM resources WHERE id = ? AND is_active = TRUE',
      [resourceId]
    );
    if (!rows.length) throw new NotFoundError('Resource');
    const hourlyPrice = Number(rows[0].hourly_price || 0);
    const branchId = rows[0].branch_id;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    // Overnight session: the end time falls on the next calendar day
    // (e.g. 23:00 → 00:00). Without this, a 1-hour midnight-adjacent booking
    // computes a negative duration and is under-charged (400 → 200).
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    const totalMinutes = endMinutes - startMinutes;
    const hours = Math.max(totalMinutes / 60, 0.5);

    // R5-A — weekday comes from the OCCURRENCE's own local date when supplied.
    // Never from the machine/server current date for a dated occurrence.
    const { dayOfWeek, pricingDate } = PricingEngine.resolvePricingWeekday(occurrence);

    const [peakRows] = await this.pool.execute<RowData>(
      `SELECT start_time, end_time, price_multiplier FROM peak_hour_pricing
       WHERE resource_id = ? AND day_of_week = ?
       ORDER BY start_time`,
      [resourceId, dayOfWeek]
    );

    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    let standardAmount = 0;
    let peakAmount = 0;
    let peakMultiplier = 1;

    if (peakRows.length === 0) {
      standardAmount = hourlyPrice * hours;
      return { totalPrice: standardAmount, standardAmount, peakAmount, peakMultiplier: 1, dayOfWeek, pricingDate };
    }

    let cursor = startMinutes;
    while (cursor < endMinutes) {
      const segmentEnd = Math.min(
        cursor + 60,
        endMinutes
      );
      const segmentHours = (segmentEnd - cursor) / 60;

      const activePeak = peakRows.find((p: any) => {
        let pStart = toMinutes(p.start_time);
        let pEnd = toMinutes(p.end_time);
        // Normalize overnight peak windows (e.g. 23:00 → 01:00) onto the same
        // continuous axis as the booking cursor.
        if (pEnd <= pStart) pEnd += 24 * 60;
        return cursor < pEnd && segmentEnd > pStart;
      });

      if (activePeak) {
        const mult = Number(activePeak.price_multiplier);
        peakAmount += hourlyPrice * segmentHours * mult;
        peakMultiplier = Math.max(peakMultiplier, mult);
      } else {
        standardAmount += hourlyPrice * segmentHours;
      }

      cursor = segmentEnd;
    }

    const totalPrice = standardAmount + peakAmount;

    return { totalPrice, standardAmount, peakAmount, peakMultiplier, dayOfWeek, pricingDate };
  }

  /**
   * R5-A — resolve the canonical pricing weekday (1=Mon .. 7=Sun).
   *
   * Priority:
   *   1. `occurrence.date`            → weekday of that local calendar date.
   *   2. `occurrence.startAtUtc` + tz → resolve the instant to its BRANCH-LOCAL
   *      date first, then take that date's weekday. This is what makes a local
   *      00:30 Thursday price as Thursday even though the UTC instant is still
   *      Wednesday.
   *   3. no context                  → historical fallback (server's current
   *      date) so pre-existing single-booking prices are unchanged.
   *
   * Reuses TimeEngine (the single canonical time facade) — no second timezone
   * engine, and the existing DST handling is reused unchanged.
   */
  private static resolvePricingWeekday(occurrence?: PricingOccurrence): { dayOfWeek: number; pricingDate: string | null } {
    if (occurrence?.date) {
      return { dayOfWeek: TimeEngine.getLocalDayOfWeekFromDate(occurrence.date), pricingDate: occurrence.date };
    }
    if (occurrence?.startAtUtc && occurrence.timezone) {
      const localDate = TimeEngine.utcToLocalDate(occurrence.startAtUtc, occurrence.timezone);
      return { dayOfWeek: TimeEngine.getLocalDayOfWeekFromDate(localDate), pricingDate: localDate };
    }
    const today = new Date();
    return { dayOfWeek: today.getDay() === 0 ? 7 : today.getDay(), pricingDate: null };
  }

  /**
   * R5-A — authoritative series total: the exact sum of the canonical
   * (already 2dp-rounded) occurrence totals, rounded once more with the
   * project's canonical money rule `Math.round(n * 100) / 100`.
   *
   * Occurrence totals are rounded individually (same rule the single-booking
   * path applies to `totalAmount`), so the aggregate never accumulates
   * floating-point drift and always equals the sum of the persisted values.
   * This is pure aggregation of canonical prices — it applies no pricing rule.
   */
  static sumOccurrenceTotals(occurrenceTotals: number[]): number {
    const total = occurrenceTotals.reduce((sum, amount) => sum + Number(amount || 0), 0);
    return Math.round(total * 100) / 100;
  }
}

export const pricingEngine = new PricingEngine();
