import { describe, it, expect, afterEach, vi } from 'vitest';
import { computeResultState, SUBMISSION_WINDOW_HOURS, AUTO_APPROVAL_WINDOW_HOURS, ELIGIBLE_MATCH_STATUSES } from '../result-window.js';

/** Fixed "now" so window math is deterministic. */
const NOW = new Date('2026-03-01T12:00:00Z');

function row(overrides: Partial<{ status: string; result_entry_open: number | boolean | null; result_status: string | null; played_at: string | number | Date | null }> = {}) {
  return {
    status: 'completed',
    result_entry_open: 1,
    result_status: null,
    played_at: '2026-03-01 10:00:00',
    ...overrides,
  };
}

describe('computeResultState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reflects the server constants', () => {
    expect(SUBMISSION_WINDOW_HOURS).toBe(72);
    expect(AUTO_APPROVAL_WINDOW_HOURS).toBe(72);
    expect(ELIGIBLE_MATCH_STATUSES).toContain('completed');
  });

  it('maps a latest record to approved / disputed / pending', () => {
    expect(computeResultState(row({ result_status: 'approved' }))).toBe('approved');
    expect(computeResultState(row({ result_status: 'disputed' }))).toBe('disputed');
    expect(computeResultState(row({ result_status: 'pending_confirmation' }))).toBe('pending');
  });

  it('maps no_result and treats withdrawn as no open record', () => {
    expect(computeResultState(row({ result_status: 'no_result' }))).toBe('no_result');
    // withdrawn must fall through to the eligibility checks (fresh submission
    // is allowed) instead of short-circuiting to a terminal state.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(computeResultState(row({ result_status: 'withdrawn' }))).toBe('enter');
  });

  it('returns none when the match is not in an eligible lifecycle status', () => {
    expect(computeResultState(row({ status: 'open' }))).toBe('none');
    expect(computeResultState(row({ status: 'cancelled' }))).toBe('none');
  });

  it('returns none before the scheduled end or with no play time', () => {
    expect(computeResultState(row({ result_entry_open: 0 }))).toBe('none');
    expect(computeResultState(row({ result_entry_open: false }))).toBe('none');
    expect(computeResultState(row({ played_at: null }))).toBe('none');
  });

  it('returns enter while within the 72h window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(computeResultState(row())).toBe('enter');
    expect(computeResultState(row({ status: 'full' }))).toBe('enter');
    expect(computeResultState(row({ status: 'in_progress' }))).toBe('enter');
  });

  it('returns expired once 72h have passed since play', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(computeResultState(row({ played_at: '2026-02-26 11:59:00' }))).toBe('expired');
  });

  it('parses the mysql2 UTC literal form YYYY-MM-DD HH:mm:ss', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // Scheduled end 2h ago (booking-end fallback) → within window → enter
    expect(computeResultState(row({ played_at: '2026-03-01 10:00:00' }))).toBe('enter');
  });
});