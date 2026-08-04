import { describe, it, expect } from 'vitest';
import { toMySqlDateTime, nowMySql } from './mysql-date.js';

const ISO_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe('toMySqlDateTime', () => {
  it('formats a UTC date as YYYY-MM-DD HH:mm:ss', () => {
    const date = new Date('2026-08-04T20:48:13.123Z');
    expect(toMySqlDateTime(date)).toBe('2026-08-04 20:48:13');
  });

  it('preserves seconds', () => {
    const date = new Date(Date.UTC(2026, 0, 1, 10, 30, 59, 999));
    expect(toMySqlDateTime(date)).toBe('2026-01-01 10:30:59');
  });

  it('has no milliseconds', () => {
    const date = new Date('2026-06-15T12:00:00.999Z');
    expect(toMySqlDateTime(date)).toMatch(ISO_REGEX);
    expect(toMySqlDateTime(date)).not.toMatch(/\.\d+/);
  });

  it('has no trailing Z / timezone suffix', () => {
    const date = new Date('2026-06-15T12:00:00.999Z');
    const out = toMySqlDateTime(date);
    expect(out).not.toMatch(/[TZ]/);
    expect(out).not.toMatch(/[+-]\d{2}:?\d{2}$/);
  });

  it('uses the space separator, not T', () => {
    const date = new Date('2026-06-15T12:00:00Z');
    expect(toMySqlDateTime(date)).toBe('2026-06-15 12:00:00');
    expect(toMySqlDateTime(date)).not.toContain('T');
  });

  it('handles midnight', () => {
    const date = new Date('2026-03-01T00:00:00.000Z');
    expect(toMySqlDateTime(date)).toBe('2026-03-01 00:00:00');
  });

  it('handles end of month', () => {
    const date = new Date('2026-04-30T23:59:59.000Z');
    expect(toMySqlDateTime(date)).toBe('2026-04-30 23:59:59');
  });

  it('handles leap year', () => {
    const date = new Date('2024-02-29T13:05:07.000Z');
    expect(toMySqlDateTime(date)).toBe('2024-02-29 13:05:07');
  });

  it('handles non-leap year February (28 days only)', () => {
    const date = new Date('2026-02-28T23:59:59.000Z');
    expect(toMySqlDateTime(date)).toBe('2026-02-28 23:59:59');
  });

  it('handles a local-timezone date deterministically (no locale dependence)', () => {
    const date = new Date(2026, 7, 4, 22, 48, 13);
    expect(toMySqlDateTime(date)).toMatch(ISO_REGEX);
  });

  it('zero-pads month, day, hour, minute, second', () => {
    const date = new Date('2026-01-05T07:08:09.000Z');
    expect(toMySqlDateTime(date)).toBe('2026-01-05 07:08:09');
  });

  it('does not round seconds up from fractional milliseconds', () => {
    const date = new Date('2026-12-31T23:59:59.999Z');
    expect(toMySqlDateTime(date)).toBe('2026-12-31 23:59:59');
  });
});

describe('nowMySql', () => {
  it('returns a MySQL-compatible string for the current instant', () => {
    const out = nowMySql();
    expect(out).toMatch(ISO_REGEX);
  });

  it('is accepted by MySQL as a valid datetime literal', () => {
    expect(nowMySql()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
