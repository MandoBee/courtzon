import { describe, it, expect } from 'vitest';
import { TimeEngine } from '../index.js';

// ── R2 — Weekly recurrence occurrence generator (pure, deterministic) ─────
// Calendar-date based in the branch IANA timezone; DST-safe; no DB access.

function gen(opts: Partial<{
  startDate: string; endDate: string; weekdays: number[];
  startTime: string; endTime: string; timezone: string;
}> = {}) {
  return TimeEngine.generateWeeklyOccurrences({
    startDate: opts.startDate ?? '2026-10-01',
    endDate: opts.endDate ?? '2026-10-31',
    weekdays: opts.weekdays ?? [1, 4], // Mon + Thu
    startTime: opts.startTime ?? '18:00',
    endTime: opts.endTime ?? '20:00',
    timezone: opts.timezone ?? 'Africa/Cairo',
  });
}

describe('TimeEngine.generateWeeklyOccurrences (R2)', () => {
  it('1. one-weekday weekly recurrence generates every matching weekday', () => {
    const occ = gen({ weekdays: [1], startDate: '2026-10-01', endDate: '2026-10-31' });
    const dates = occ.map((o) => o.date);
    expect(dates).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    for (const o of occ) expect(o.weekday).toBe(1);
  });

  it('2. two-weekday recurrence (Monday + Thursday) matches the task example', () => {
    const occ = gen({ weekdays: [1, 4], startDate: '2026-10-01', endDate: '2026-10-31' });
    // Thursdays: 01, 08, 15, 22, 29; Mondays: 05, 12, 19, 26 → 9 occurrences.
    expect(occ).toHaveLength(9);
    expect(occ.map((o) => o.date)).toEqual([
      '2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15',
      '2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29',
    ]);
    expect(occ.every((o) => o.startTime === '18:00' && o.endTime === '20:00')).toBe(true);
  });

  it('3. start date is inclusive', () => {
    const occ = gen({ weekdays: [4], startDate: '2026-10-01', endDate: '2026-10-01' });
    expect(occ).toHaveLength(1);
    expect(occ[0].date).toBe('2026-10-01');
  });

  it('4. end date is inclusive', () => {
    const occ = gen({ weekdays: [4], startDate: '2026-10-29', endDate: '2026-10-29' });
    expect(occ).toHaveLength(1);
    expect(occ[0].date).toBe('2026-10-29');
  });

  it('5. start/end on the same day yields at most that weekday', () => {
    // 2026-10-01 is Thursday; weekdays [1] (Monday) → no occurrences; [4] → one.
    expect(gen({ weekdays: [1], startDate: '2026-10-01', endDate: '2026-10-01' })).toHaveLength(0);
    expect(gen({ weekdays: [4], startDate: '2026-10-01', endDate: '2026-10-01' })).toHaveLength(1);
  });

  it('6. no selected weekdays is rejected', () => {
    expect(() => gen({ weekdays: [], startDate: '2026-10-01', endDate: '2026-10-31' })).toThrow(/weekday/i);
  });

  it('7. end date before start date is rejected', () => {
    expect(() => gen({ startDate: '2026-10-31', endDate: '2026-10-01' })).toThrow(/endDate/i);
  });

  it('8. output is deterministic and strictly chronological', () => {
    const a = gen();
    const b = gen();
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].date > a[i - 1].date).toBe(true);
      expect(a[i].startAtUtc > a[i - 1].startAtUtc).toBe(true);
    }
  });

  it('9. no duplicate occurrences', () => {
    const keys = gen().map((o) => o.occurrenceKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('10. DST transition preserves the intended LOCAL time', () => {
    // US spring-forward 2026-03-08 (EST→EDT, UTC-5→-4). Local 18:00 must stay
    // 18:00; only the UTC instant shifts by one hour.
    const occ = gen({
      weekdays: [7], // Sunday
      startDate: '2026-03-01',
      endDate: '2026-03-14',
      timezone: 'America/New_York',
    });
    expect(occ).toHaveLength(2);
    expect(occ[0].date).toBe('2026-03-01');
    expect(occ[0].startTime).toBe('18:00');
    expect(occ[0].startAtUtc).toBe('2026-03-01T23:00:00.000Z'); // EST, UTC-5
    expect(occ[1].date).toBe('2026-03-08');
    expect(occ[1].startAtUtc).toBe('2026-03-08T22:00:00.000Z'); // EDT, UTC-4
    expect(occ[1].endAtUtc).toBe('2026-03-09T00:00:00.000Z');
  });

  it('11. different IANA timezone yields the correct local dates/instants', () => {
    const athens = gen({ timezone: 'Europe/Athens' }); // EEST UTC+3
    expect(athens[0].date).toBe('2026-10-01');
    expect(athens[0].startAtUtc).toBe('2026-10-01T15:00:00.000Z'); // 18:00 local = 15:00Z
    const london = gen({ timezone: 'Europe/London' }); // BST UTC+1
    expect(london[0].startAtUtc).toBe('2026-10-01T17:00:00.000Z');
  });

  it('12. midnight boundary: overnight slot crosses to the next calendar day in UTC', () => {
    // Kolkata UTC+5:30, local 23:30 → 00:30 next day.
    const occ = TimeEngine.generateWeeklyOccurrences({
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      weekdays: [4, 5],
      startTime: '23:30',
      endTime: '00:30',
      timezone: 'Asia/Kolkata',
    });
    expect(occ).toHaveLength(2);
    const first = occ[0];
    expect(first.date).toBe('2026-10-01');
    expect(first.endDate).toBe('2026-10-02'); // end on next calendar day
    expect(first.startAtUtc).toBe('2026-10-01T18:00:00.000Z'); // 23:30+5:30 → 18:00Z
    expect(first.endAtUtc).toBe('2026-10-01T19:00:00.000Z'); // 00:30 next day = 19:00Z prev day
  });

  it('13. occurrence key is deterministic and unique per date', () => {
    const occ = gen();
    for (const o of occ) expect(o.occurrenceKey).toBe(o.date);
    expect(new Set(occ.map((o) => o.occurrenceKey)).size).toBe(occ.length);
  });

  it('14. large but reasonable range (full year) generates correctly', () => {
    const occ = gen({ weekdays: [2, 5], startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(occ.length).toBeGreaterThan(0);
    // First matching weekday must be the first Tue/Fri of 2026-01.
    expect(occ[0].date).toBe('2026-01-02'); // Friday 2026-01-02 (Tue is 01-06)
    expect(occ[0].weekday).toBe(5);
    // Last is the last Tue/Fri of 2026-12.
    expect(occ[occ.length - 1].weekday === 2 || occ[occ.length - 1].weekday === 5).toBe(true);
    for (let i = 1; i < occ.length; i++) {
      expect(occ[i].date > occ[i - 1].date).toBe(true);
    }
  });

  it('15. invalid recurrence definitions are rejected', () => {
    expect(() => gen({ startDate: '2026/10/01' })).toThrow(/YYYY-MM-DD/);
    expect(() => gen({ startTime: '18:00', endTime: '18:00' })).toThrow(/must differ/);
    expect(() => gen({ startDate: '2026-10-31', endDate: '2026-10-01' })).toThrow(/endDate/);
    expect(() => gen({ weekdays: [0] })).toThrow(/weekday/);
    expect(() => gen({ timezone: 'Invalid/Zone' })).toThrow();
  });
});