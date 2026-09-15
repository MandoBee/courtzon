import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatISODate,
  localTodayString,
  formatDateTime,
  formatDateTimeLocal,
  toUtcIsoForApi,
  toMySqlUtcForApi,
  toLocalDateTimeLocal,
  toDateTimeLocalInTimezone,
} from './formatDate';

describe('formatISODate (date-only)', () => {
  it('renders YYYY-MM-DD as DD/MM/YYYY without any timezone parsing (no day shift)', () => {
    expect(formatISODate('2026-07-15')).toBe('15/07/2026');
  });

  it('does not shift a day even for an instant that would be the prior day in a negative offset', () => {
    // "2026-01-01T00:00:00Z" is 2025-12-31 19:00 in UTC-5 — but the date-only
    // value must render as the calendar date it represents.
    expect(formatISODate('2026-01-01')).toBe('01/01/2026');
  });

  it('handles null/undefined/empty', () => {
    expect(formatISODate(null)).toBe('—');
    expect(formatISODate(undefined)).toBe('—');
  });
});

describe('formatDateTimeLocal (true instants, timezone-aware)', () => {
  it('renders a UTC instant in Africa/Cairo with the correct local date and hour', () => {
    // 2026-07-10T10:00:00Z → Africa/Cairo is UTC+3 in July (DST) → 13:00 same day.
    expect(formatDateTimeLocal('2026-07-10T10:00:00.000Z', 'Africa/Cairo')).toContain('13:00');
  });

  it('renders a winter instant in Africa/Cairo (UTC+2, no DST)', () => {
    // 2026-01-10T10:00:00Z → Africa/Cairo is UTC+2 in January → 12:00 same day.
    expect(formatDateTimeLocal('2026-01-10T10:00:00.000Z', 'Africa/Cairo')).toContain('12:00');
  });

  it('produces the same shape as formatDateTime when no timezone is given', () => {
    expect(formatDateTimeLocal('2026-07-10T10:00:00.000Z')).toBe(formatDateTime('2026-07-10T10:00:00.000Z'));
  });
});

describe('toUtcIsoForApi (datetime-local → UTC)', () => {
  it('round-trips a browser-local naive value to UTC ISO', () => {
    const naive = toLocalDateTimeLocal('2026-07-10T13:00:00.000Z');
    const back = toUtcIsoForApi(naive);
    // Same instant (within a minute) regardless of the test runner's timezone.
    expect(Math.abs(new Date(back).getTime() - new Date('2026-07-10T13:00:00.000Z').getTime())).toBeLessThanOrEqual(60_000);
  });

  it('converts a wall clock in a given IANA timezone (DST-aware, summer +3)', () => {
    // 13:00 Africa/Cairo on 2026-07-10 (UTC+3) === 10:00Z.
    expect(toUtcIsoForApi('2026-07-10T13:00', 'Africa/Cairo')).toBe('2026-07-10T10:00:00.000Z');
  });

  it('converts a wall clock in a given IANA timezone (winter +2)', () => {
    // 12:00 Africa/Cairo on 2026-01-10 (UTC+2) === 10:00Z.
    expect(toUtcIsoForApi('2026-01-10T12:00', 'Africa/Cairo')).toBe('2026-01-10T10:00:00.000Z');
  });

  it('returns "" for empty input', () => {
    expect(toUtcIsoForApi('')).toBe('');
  });
});

describe('toMySqlUtcForApi', () => {
  it('formats a UTC instant as a MySQL DATETIME literal', () => {
    expect(toMySqlUtcForApi('2026-07-10T13:00', 'Africa/Cairo')).toBe('2026-07-10 10:00:00');
  });
});

describe('toDateTimeLocalInTimezone (UTC instant → datetime-local in a given IANA timezone)', () => {
  it('converts a UTC instant to branch-local datetime-local (Africa/Cairo summer +3)', () => {
    // 2026-09-14T17:00:00Z === 2026-09-14 20:00 Africa/Cairo (UTC+3 in Sep).
    expect(toDateTimeLocalInTimezone('2026-09-14T17:00:00.000Z', 'Africa/Cairo')).toBe('2026-09-14T20:00');
  });

  it('keeps the after-midnight slot on the correct branch-local calendar day', () => {
    // A slot whose actual instant is 2026-09-15T21:00:00Z (== 16/09 00:00 Cairo)
    // must be represented as 16/09 00:00 in the branch timezone — NOT the
    // Business-Day display date. This is what bounds the deadline input.
    expect(toDateTimeLocalInTimezone('2026-09-15T21:00:00.000Z', 'Africa/Cairo')).toBe('2026-09-16T00:00');
  });

  it('handles winter offset (Africa/Cairo UTC+2)', () => {
    // 2026-01-10T10:00:00Z === 12:00 Africa/Cairo in January (UTC+2).
    expect(toDateTimeLocalInTimezone('2026-01-10T10:00:00.000Z', 'Africa/Cairo')).toBe('2026-01-10T12:00');
  });

  it('returns "" for empty input', () => {
    expect(toDateTimeLocalInTimezone('', 'Africa/Cairo')).toBe('');
    expect(toDateTimeLocalInTimezone(null, 'Africa/Cairo')).toBe('');
  });
});

describe('Matchmaking deadline serialization regression (14/09 20:00 Cairo → 17:00Z)', () => {
  it('serializes a Cairo wall-clock deadline to its true UTC instant — NOT :00Z', () => {
    // The audit bug: `${deadline}:00Z` sent 14/09 20:00Z (== 23:00 Cairo).
    // The correct UTC instant for 14/09 20:00 Africa/Cairo is 14/09 17:00Z.
    expect(toUtcIsoForApi('2026-09-14T20:00', 'Africa/Cairo')).toBe('2026-09-14T17:00:00.000Z');
  });

  it('a deadline equal to the booking start in Cairo serializes to the same UTC instant', () => {
    // 16/09 00:00 Cairo === 15/09 21:00Z.
    expect(toUtcIsoForApi('2026-09-16T00:00', 'Africa/Cairo')).toBe('2026-09-15T21:00:00.000Z');
  });
});

describe('localTodayString', () => {
  it('returns YYYY-MM-DD', () => {
    expect(localTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatDate', () => {
  it('formats a full ISO instant to DD/MM/YYYY in browser-local time', () => {
    expect(formatDate('2026-07-10T00:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});