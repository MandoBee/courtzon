import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import { toBirthYear } from '../application/tournament-eligibility.service.js';

/**
 * Phase 4 Step 2 — regression guard for the birth-year extraction used by the
 * YEAR-only age formula. `users.birth_date` is a DATE column and mysql2 hands it
 * back as a JS `Date` (app pool has no `dateStrings`); the legacy
 * `Number(String(value).slice(0, 4))` produced NaN for Date objects and made
 * every age-category evaluation fail.
 */
describe('Phase 4 Step 2 — toBirthYear', () => {
  it('accepts plain DATE strings', () => {
    expect(toBirthYear('2010-05-05')).toBe(2010);
    expect(toBirthYear('1995-05-05')).toBe(1995);
  });

  it('accepts ISO datetime strings', () => {
    expect(toBirthYear('2010-05-04T21:00:00.000Z')).toBe(2010);
  });

  it('accepts JS Date objects (mysql2 DATE inflation)', () => {
    expect(toBirthYear(new Date(Date.UTC(2010, 4, 5)))).toBe(2010);
    expect(toBirthYear(new Date('2026-12-01T00:00:00Z'))).toBe(2026);
  });

  it('accepts a Date that was already stringified by a legacy reader', () => {
    expect(toBirthYear('Wed May 05 2010 03:00:00 GMT+0300 (Eastern European Summer Time)')).toBe(2010);
  });

  it('rejects empty/null and unparseable values with null (never NaN)', () => {
    expect(toBirthYear(null)).toBeNull();
    expect(toBirthYear('')).toBeNull();
    expect(toBirthYear('garbage')).toBeNull();
    expect(toBirthYear('Tues...')).toBeNull();
    expect(Number.isNaN(toBirthYear(new Date('nope')) as number)).toBe(false);
  });
});