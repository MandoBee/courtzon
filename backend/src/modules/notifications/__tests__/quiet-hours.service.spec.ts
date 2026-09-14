import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
});

const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [rows] as any),
}));

let rows: any[] = [];

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

import { isInQuietHours } from '../application/quiet-hours.service.js';

describe('quiet-hours timezone evaluation (BE-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00.000Z')); // Friday 10:00 UTC = 13:00 Africa/Cairo (UTC+3, DST)
    rows = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('honors a Cairo quiet window using the STORED timezone (not server-local UTC)', async () => {
    rows = [
      { user_id: 1, weekday: 'fri', start_time: '12:00:00', end_time: '14:00:00', timezone: 'Africa/Cairo', is_active: 1 },
    ];
    const result = await isInQuietHours(1);
    expect(result.inQuietHours).toBe(true);
    // End 14:00 Cairo = 11:00 UTC → resume delay ≈ 1h from 10:00 UTC.
    expect(result.resumeAt).toBeGreaterThan(3_000_000);
    expect(result.resumeAt).toBeLessThanOrEqual(3_600_000 + 60_000);
  });

  it('does NOT treat the same UTC wall clock as quiet when outside the Cairo window', async () => {
    // 10:00 UTC = 13:00 Cairo. A window 08:00-09:00 Cairo is NOT active now.
    rows = [
      { user_id: 1, weekday: 'fri', start_time: '08:00:00', end_time: '09:00:00', timezone: 'Africa/Cairo', is_active: 1 },
    ];
    const result = await isInQuietHours(1);
    expect(result.inQuietHours).toBe(false);
  });

  it('respects the weekday in the stored timezone', async () => {
    // 10:00 UTC Friday = 13:00 Cairo Friday. A Saturday window must not match.
    rows = [
      { user_id: 1, weekday: 'sat', start_time: '12:00:00', end_time: '14:00:00', timezone: 'Africa/Cairo', is_active: 1 },
    ];
    const result = await isInQuietHours(1);
    expect(result.inQuietHours).toBe(false);
  });

  it('computes resumeAt to the LOCAL end time in the stored timezone', async () => {
    // 10:00 UTC = 13:00 Cairo. Window 12:00-13:30 Cairo ends at 13:30 Cairo =
    // 10:30 UTC → resume delay ≈ 30 minutes from 10:00 UTC.
    rows = [
      { user_id: 1, weekday: 'fri', start_time: '12:00:00', end_time: '13:30:00', timezone: 'Africa/Cairo', is_active: 1 },
    ];
    const result = await isInQuietHours(1);
    expect(result.inQuietHours).toBe(true);
    expect(result.resumeAt).toBeGreaterThan(1_600_000);
    expect(result.resumeAt).toBeLessThanOrEqual(1_800_000 + 60_000);
  });
});