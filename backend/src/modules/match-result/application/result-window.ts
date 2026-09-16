/**
 * Single source of truth for match-result window rules.
 *
 * These constants were historically defined inside match-result.service.ts and
 * duplicated client-side (frontend SUBMISSION_WINDOW_MS). Keeping them here —
 * alongside a pure, server-authoritative state computer — lets the match
 * controller expose a `result_state` per row, so the UI never has to re-derive
 * the 72h window / eligible-status logic itself.
 */

/** Part E.127 — 3-day window to submit a result after play. */
export const SUBMISSION_WINDOW_HOURS = 72;
/** Part E.60 — if the opponent does not respond within 3 days the result is auto-approved. */
export const AUTO_APPROVAL_WINDOW_HOURS = 72;

export const ELIGIBLE_MATCH_STATUSES: string[] = ['full', 'closed', 'in_progress', 'completed'];

export type MatchResultListState =
  | 'approved'
  | 'disputed'
  | 'pending'
  | 'no_result'
  | 'enter'
  | 'expired'
  | 'none';

interface ResultStateRow {
  status: string;
  result_entry_open: number | boolean | bigint | null;
  result_status: string | null;
  played_at: string | number | Date | null;
}

function parsePlayedAt(row: ResultStateRow): number | null {
  if (row.played_at == null) return null;
  if (row.played_at instanceof Date) return row.played_at.getTime();
  const raw = String(row.played_at);
  // mysql2 returns TIMESTAMP columns as 'YYYY-MM-DD HH:mm:ss' (UTC) — the same
  // normalized UTC literal form the repositories write with toMySqlTs().
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Server-authoritative result state for a match row, recomputed on every read.
 *
 * Mirrors the backend submission rules (ELIGIBLE_MATCH_STATUSES + the 72h
 * window from played_at) so the frontend never duplicates business rules:
 *   approved / disputed / pending / no_result  → record exists (withdrawn is
 *     treated as no open record so a fresh submission can begin)
 *   enter                                      → ended + eligible status + window open
 *   expired                                    → ended + eligible status + window closed
 *   none                                       → not ended / not eligible / no play time
 */
export function computeResultState(row: ResultStateRow): MatchResultListState {
  const rs = row.result_status ?? null;
  if (rs === 'approved' || rs === 'disputed' || rs === 'pending_confirmation') {
    return rs === 'disputed' ? 'disputed' : rs === 'approved' ? 'approved' : 'pending';
  }
  if (rs === 'no_result') return 'no_result';

  if (!ELIGIBLE_MATCH_STATUSES.includes(row.status)) return 'none';
  if (!row.result_entry_open) return 'none';

  const playedTs = parsePlayedAt(row);
  if (playedTs == null) return 'none';
  return Date.now() <= playedTs + SUBMISSION_WINDOW_HOURS * 3_600_000 ? 'enter' : 'expired';
}