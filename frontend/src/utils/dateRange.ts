/**
 * Centralized date-range utility — single source of truth for all date
 * computations in the frontend. Every file that previously generated date
 * strings via inline `Date` arithmetic must use these functions.
 *
 * Two categories:
 *
 *   local*  — user's local timezone (for date inputs, form defaults, display)
 *   api*    — UTC-relative (for backend TIMESTAMP/DATETIME queries)
 *
 * Why UTC for API queries:
 *   The backend stores `recorded_at` as a MySQL TIMESTAMP in UTC
 *   (connection timezone '+00:00'). When the frontend sends a date-only
 *   string like '2026-08-04' to `WHERE recorded_at <= ?`, MySQL interprets
 *   it as midnight UTC. Any entry on that day after 00:00:00 is excluded.
 *   apiDateRange() returns `to` as UTC tomorrow, so `recorded_at <= tomorrow'
 *   correctly includes all of today's entries in every timezone.
 */

/** YYYY-MM-DD in the user's local timezone (for `<input type="date">` defaults). */
export function localToday(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** YYYY-MM-DD N days ago in the user's local timezone. */
export function localDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** YYYY-MM-DD N days from now in the user's local timezone. */
export function localDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Date range for backend API queries against TIMESTAMP/DATETIME columns.
 *
 * Returns:
 *   from — UTC date N days ago     (YYYY-MM-DD)
 *   to   — UTC tomorrow            (YYYY-MM-DD, exclusive upper bound)
 *
 * The exclusive `to` fixes the recorded_at <= 'YYYY-MM-DD' (midnight) bug:
 * entries at 22:22 on the `to` date are included because they are
 * strictly before tomorrow's midnight UTC.
 */
export function apiDateRange(daysBack: number = 30): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}
