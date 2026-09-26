import { describe, it, expect } from 'vitest';
import { BookingWindowPolicy } from './booking-window.policy.js';

// ── R1 Player booking-window policy — pure unit tests ─────────────────────
// The policy is calendar-date based in the BRANCH timezone. "now" is always
// injected for determinism; the same injected instant must yield a branch-local
// window regardless of the server/CI timezone.

function win(tz: string, now: string, bookingDate?: string) {
  return BookingWindowPolicy.evaluate({
    bookingDate: bookingDate ?? '2026-10-06',
    timezone: tz,
    now,
  });
}

describe('BookingWindowPolicy', () => {
  const TZ = 'Africa/Cairo';

  // Cairo on 2026-10-01 is EEST (UTC+3). 12:00Z = 15:00 Cairo → local 2026-10-01.
  const now = '2026-10-01T12:00:00.000Z';

  it('1. today is allowed', () => {
    const r = win(TZ, now, '2026-10-01');
    expect(r.allowed).toBe(true);
    expect(r.minDate).toBe('2026-10-01');
    expect(r.maxDate).toBe('2026-10-07');
  });

  it('2. today + 1 is allowed', () => {
    const r = win(TZ, now, '2026-10-02');
    expect(r.allowed).toBe(true);
  });

  it('3. today + 6 is allowed', () => {
    const r = win(TZ, now, '2026-10-07');
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('4. today + 7 is rejected (ABOVE_MAX)', () => {
    const r = win(TZ, now, '2026-10-08');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ABOVE_MAX');
  });

  it('5. a date before today is rejected (BELOW_MIN)', () => {
    const r = win(TZ, now, '2026-09-30');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('BELOW_MIN');
  });

  it('6. timezone changes around midnight → branch-local date wins, not UTC date', () => {
    // 2026-10-01T23:30:00Z:
    //   Asia/Kolkata (UTC+5:30) → local 2026-10-02 05:00 → "today" = 10-02
    //   America/New_York (UTC-4) → local 2026-10-01 19:30 → "today" = 10-01
    const kolkata = win('Asia/Kolkata', '2026-10-01T23:30:00.000Z', '2026-10-08');
    expect(kolkata.minDate).toBe('2026-10-02');
    expect(kolkata.maxDate).toBe('2026-10-08');
    expect(kolkata.allowed).toBe(true); // 10-08 == max for Kolkata

    const newyork = win('America/New_York', '2026-10-01T23:30:00.000Z', '2026-10-08');
    expect(newyork.minDate).toBe('2026-10-01');
    expect(newyork.maxDate).toBe('2026-10-07');
    expect(newyork.allowed).toBe(false); // 10-08 > 10-07 for New York
    expect(newyork.reason).toBe('ABOVE_MAX');
  });

  it('7. DST-safe behavior — the window is 7 calendar days across transitions', () => {
    // US spring-forward: 2026-03-08. The window must be 7 calendar days both
    // before and after the transition instant.
    const before = win('America/New_York', '2026-03-01T12:00:00.000Z');
    expect(before.minDate).toBe('2026-03-01');
    expect(before.maxDate).toBe('2026-03-07');

    const after = win('America/New_York', '2026-03-09T12:00:00.000Z');
    expect(after.minDate).toBe('2026-03-09');
    expect(after.maxDate).toBe('2026-03-15');

    // Cairo is the production default: EEST (UTC+3) → EET (UTC+2) on the last
    // Friday of October (2026-10-30). The window across that boundary is still
    // exact calendar days.
    const cairo = win('Africa/Cairo', '2026-10-25T12:00:00.000Z');
    expect(cairo.minDate).toBe('2026-10-25');
    expect(cairo.maxDate).toBe('2026-10-31');
  });

  it('8. different branch timezone yields the correct branch-local window', () => {
    const sydney = win('Australia/Sydney', '2026-10-01T12:00:00.000Z'); // AEDT UTC+11 → 23:00 local 10-01
    expect(sydney.minDate).toBe('2026-10-01');
    expect(sydney.maxDate).toBe('2026-10-07');
    // A date allowed in Sydney may be rejected in Cairo for the same instant:
    // instant 2026-09-30T22:00:00Z → Sydney 10-01 (min), Cairo 10-01 too (EEST+3 → 01:00 10-01).
    const edge = BookingWindowPolicy.evaluate({
      bookingDate: '2026-10-07',
      timezone: 'Australia/Sydney',
      now: '2026-09-30T22:00:00.000Z',
    });
    expect(edge.minDate).toBe('2026-10-01');
    expect(edge.maxDate).toBe('2026-10-07');
    expect(edge.allowed).toBe(true);
  });

  it('9. deterministic injected "now" — same inputs always produce the same window', () => {
    const a = win(TZ, '2026-12-20T12:00:00.000Z');
    const b = win(TZ, '2026-12-20T12:00:00.000Z');
    expect(a).toEqual(b);
    expect(a.minDate).toBe('2026-12-20');
    expect(a.maxDate).toBe('2026-12-26');
  });

  it('month/year rollover in maxDate arithmetic', () => {
    const r = win(TZ, '2026-12-28T12:00:00.000Z');
    expect(r.minDate).toBe('2026-12-28');
    expect(r.maxDate).toBe('2027-01-03');
  });

  it('rejects a malformed booking date with INVALID_DATE', () => {
    const r = win(TZ, now, 'not-a-date');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('INVALID_DATE');
  });

  it('rejects an invalid timezone with INVALID_TIMEZONE (never throws)', () => {
    const r = BookingWindowPolicy.evaluate({ bookingDate: '2026-10-01', timezone: 'Not/AZone', now: '2026-10-01T12:00:00.000Z' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('INVALID_TIMEZONE');
  });

  it('windowDays is configurable (today..today+N-1)', () => {
    const r = BookingWindowPolicy.evaluate({
      bookingDate: '2026-10-08',
      timezone: 'Africa/Cairo',
      now: '2026-10-01T12:00:00.000Z',
      windowDays: 8,
    });
    expect(r.maxDate).toBe('2026-10-08');
    expect(r.allowed).toBe(true);
  });
});