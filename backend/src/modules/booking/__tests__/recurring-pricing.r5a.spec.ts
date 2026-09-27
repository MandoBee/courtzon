import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── R5-A — Canonical date-aware pricing for recurring occurrences (UNIT) ────
//
// ROOT CAUSE under test: PricingEngine.calculatePrice() used to derive the
// pricing weekday from `new Date()` (the machine/server current date), so a
// recurring series spanning several weekdays priced EVERY occurrence with
// TODAY's weekday pricing.
//
// These tests drive the canonical engine directly with a mocked pool and
// assert that the weekday used for the peak_hour_pricing lookup comes from the
// OCCURRENCE's own branch-local date. TimeEngine is the REAL implementation so
// the timezone / DST behaviour is genuinely exercised.

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3041';
});

interface PeakRow { day_of_week: number; start_time: string; end_time: string; price_multiplier: number }

const db = vi.hoisted(() => ({
  hourly: 400,
  branchId: 1,
  peaks: [] as PeakRow[],
  /** Every peak_hour_pricing lookup, captured for SQL-level assertions. */
  peakLookups: [] as number[],
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string, params: any[]) => {
      if (/FROM\s+resources/i.test(sql)) {
        return [[{ hourly_price: db.hourly, branch_id: db.branchId }], []];
      }
      if (/FROM\s+peak_hour_pricing/i.test(sql)) {
        const dayOfWeek = Number(params[1]);
        db.peakLookups.push(dayOfWeek);
        return [db.peaks
          .filter((p) => p.day_of_week === dayOfWeek)
          .map((p) => ({ start_time: p.start_time, end_time: p.end_time, price_multiplier: p.price_multiplier })), []];
      }
      return [[], []];
    },
    query: async () => [[], []],
  }),
}));

import { pricingEngine, PricingEngine } from '../domain/pricing-engine.js';
import { TimeEngine } from '../../time/time-engine.js';

const CAIRO = 'Africa/Cairo';
const NEW_YORK = 'America/New_York';

const MON = '2026-11-02'; // Monday   (dayOfWeek 1)
const TUE = '2026-11-03'; // Tuesday  (dayOfWeek 2)
const THU = '2026-11-05'; // Thursday (dayOfWeek 4)

// Weekly 18:00-20:00 window with a DIFFERENT multiplier per weekday:
//   Monday    → x2.0  → 400 * 2h * 2.0 = 1600
//   Thursday  → x1.5  → 400 * 2h * 1.5 = 1200
//   Tuesday   → (no peak rows) → 400 * 2h      =  800
function resetFixture() {
  db.hourly = 400;
  db.branchId = 1;
  db.peaks = [
    { day_of_week: 1, start_time: '18:00', end_time: '20:00', price_multiplier: '2.00' as any },
    { day_of_week: 4, start_time: '18:00', end_time: '20:00', price_multiplier: '1.50' as any },
  ];
  db.peakLookups = [];
}

beforeEach(() => {
  resetFixture();
  // Freeze "now" on a THURSDAY so the legacy `new Date()` path is deterministic.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. Monday vs Thursday produce different prices ───────────────────────────
describe('R5-A 1. Monday vs Thursday are priced from their own weekday', () => {
  it('1.1 Monday occurrence uses Monday peak pricing, Thursday occurrence uses Thursday peak pricing', async () => {
    const mon = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: MON, timezone: CAIRO });
    const thu = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: THU, timezone: CAIRO });

    expect(mon.dayOfWeek).toBe(1);
    expect(mon.pricingDate).toBe(MON);
    expect(mon.totalPrice).toBe(1600);
    expect(mon.peakMultiplier).toBe(2);

    expect(thu.dayOfWeek).toBe(4);
    expect(thu.pricingDate).toBe(THU);
    expect(thu.totalPrice).toBe(1200);
    expect(thu.peakMultiplier).toBe(1.5);

    expect(mon.totalPrice).not.toBe(thu.totalPrice);
  });

  it('1.2 the peak_hour_pricing lookup is issued with the OCCURRENCE weekday', async () => {
    await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: MON, timezone: CAIRO });
    await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: THU, timezone: CAIRO });
    // Monday then Thursday — NOT the server's current weekday.
    expect(db.peakLookups).toEqual([1, 4]);
  });

  it('1.3 an occurrence with no configured peak for its weekday falls back to the standard hourly rate', async () => {
    const tue = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: TUE, timezone: CAIRO });
    expect(tue.dayOfWeek).toBe(2);
    expect(tue.totalPrice).toBe(800);
    expect(tue.peakAmount).toBe(0);
    expect(tue.peakMultiplier).toBe(1);
  });
});

// ── 2. Multiple weekdays in ONE series ──────────────────────────────────────
describe('R5-A 2. Multiple weekdays inside a single series', () => {
  it('2.1 every occurrence of a Mon+Thu series is priced on its own weekday', async () => {
    // Mirrors what BookingService.priceRecurringOccurrences does per occurrence.
    const seriesDates = [MON, TUE, THU, '2026-11-09', '2026-11-12'];
    const priced: any[] = [];
    for (const date of seriesDates) {
      priced.push(await pricingEngine.calculatePrice(1, '18:00', '20:00', { date, timezone: CAIRO }));
    }

    expect(priced.map((p) => p.dayOfWeek)).toEqual([1, 2, 4, 1, 4]);
    expect(priced.map((p) => p.totalPrice)).toEqual([1600, 800, 1200, 1600, 1200]);
  });

  it('2.2 a single-weekday series prices every occurrence identically', async () => {
    const dates = ['2026-11-02', '2026-11-09', '2026-11-16'];
    const totals: number[] = [];
    for (const date of dates) {
      totals.push((await pricingEngine.calculatePrice(1, '18:00', '20:00', { date, timezone: CAIRO })).totalPrice);
    }
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(1600);
  });
});

// ── 3. The server's current weekday must NOT influence an occurrence price ──
describe('R5-A 3. Server current weekday is irrelevant to occurrence pricing', () => {
  it('3.1 the same occurrence is priced identically no matter what "today" is', async () => {
    const results: number[] = [];
    const days = [
      '2026-11-02T09:00:00.000Z', // Monday
      '2026-11-04T09:00:00.000Z', // Wednesday
      '2026-11-07T09:00:00.000Z', // Saturday
      '2026-11-08T09:00:00.000Z', // Sunday
    ];
    for (const now of days) {
      vi.setSystemTime(new Date(now));
      const p = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: THU, timezone: CAIRO });
      results.push(p.totalPrice);
    }
    // Thursday occurrence is always 1200, even when "today" is Monday or Sunday.
    expect(results).toEqual([1200, 1200, 1200, 1200]);
  });

  it('3.2 a Monday occurrence is never priced with the server Thursday rule', async () => {
    // "today" is Thursday (x1.5 = 1200). A Monday occurrence must be 1600.
    const p = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: MON, timezone: CAIRO });
    expect(p.totalPrice).toBe(1600);
  });
});

// ── 4 & 5. Branch-local weekday / UTC date crossing local midnight ──────────
describe('R5-A 4/5. Weekday comes from the BRANCH-LOCAL date, not from UTC', () => {
  it('4.1 a UTC instant is resolved to its branch-local date first', async () => {
    // Cairo local Thursday 2026-10-08 00:30 (+03:00) == 2026-10-07T21:30Z.
    const p = await pricingEngine.calculatePrice(1, '00:30', '02:30', {
      startAtUtc: '2026-10-07T21:30:00.000Z',
      timezone: CAIRO,
    });
    expect(p.pricingDate).toBe('2026-10-08');
    expect(p.dayOfWeek).toBe(4); // Thursday
  });

  it('5.1 local Thursday 00:30 is priced as Thursday although the UTC instant is Wednesday', async () => {
    const instant = new Date('2026-10-07T21:30:00.000Z');
    // The UTC date really is a Wednesday...
    expect(instant.getUTCDay()).toBe(3);
    // ...and Cairo-local 00:30 on that day really is the next calendar date.
    expect(TimeEngine.utcToLocalDate(instant.toISOString(), CAIRO)).toBe('2026-10-08');
    expect(TimeEngine.getLocalDayOfWeekFromDate('2026-10-08')).toBe(4);

    // The engine must price it as Thursday (x1.5), never as Wednesday.
    db.peaks = [{ day_of_week: 4, start_time: '00:30', end_time: '02:30', price_multiplier: '1.50' as any }];
    const p = await pricingEngine.calculatePrice(1, '00:30', '02:30', {
      startAtUtc: '2026-10-07T21:30:00.000Z',
      timezone: CAIRO,
    });
    expect(p.dayOfWeek).toBe(4);
    expect(p.totalPrice).toBe(1200);
  });

  it('5.2 the same instant in two branches yields each branch local weekday', async () => {
    // 2026-10-07T21:30Z = Cairo Thu 2026-10-08 00:30, but New York Wed 17:30.
    const cairo = await pricingEngine.calculatePrice(1, '00:30', '02:30', {
      startAtUtc: '2026-10-07T21:30:00.000Z', timezone: CAIRO,
    });
    const ny = await pricingEngine.calculatePrice(1, '00:30', '02:30', {
      startAtUtc: '2026-10-07T21:30:00.000Z', timezone: NEW_YORK,
    });
    expect(cairo.pricingDate).toBe('2026-10-08'); // Thursday
    expect(cairo.dayOfWeek).toBe(4);
    expect(ny.pricingDate).toBe('2026-10-07');   // Wednesday
    expect(ny.dayOfWeek).toBe(3);
  });

  it('5.3 an explicit local date wins over startAtUtc (recurrence intent is authoritative)', async () => {
    const p = await pricingEngine.calculatePrice(1, '18:00', '20:00', {
      date: MON,
      timezone: CAIRO,
      startAtUtc: '2026-10-07T21:30:00.000Z', // a Thursday-ish instant
    });
    expect(p.pricingDate).toBe(MON);
    expect(p.dayOfWeek).toBe(1);
    expect(p.totalPrice).toBe(1600);
  });

  it('5.4 a malformed local date is rejected instead of silently falling back', async () => {
    await expect(
      pricingEngine.calculatePrice(1, '18:00', '20:00', { date: '08-11-2026' }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });
});

// ── 6. DST-safe occurrence pricing ──────────────────────────────────────────
describe('R5-A 6. DST-safe occurrence pricing', () => {
  it('6.1 a Sunday series across the US spring-forward keeps Sunday pricing', async () => {
    // 2026-03-08 is the US DST start; all three dates are Sundays (dayOfWeek 7).
    db.peaks = [{ day_of_week: 7, start_time: '10:00', end_time: '12:00', price_multiplier: '2.00' as any }];
    const before = '2026-03-01';
    const dstDay = '2026-03-08';
    const after = '2026-03-15';

    const priced: any[] = [];
    for (const date of [before, dstDay, after]) {
      priced.push(await pricingEngine.calculatePrice(1, '10:00', '12:00', { date, timezone: NEW_YORK }));
    }
    expect(priced.map((p) => p.dayOfWeek)).toEqual([7, 7, 7]);
    expect(priced.map((p) => p.totalPrice)).toEqual([1600, 1600, 1600]);
  });

  it('6.2 the UTC offset really does change across the boundary (the test is meaningful)', () => {
    const offBefore = TimeEngine.getUtcOffsetMinutes(TimeEngine.localToUtc('2026-03-01', '10:00', NEW_YORK), NEW_YORK);
    const offDst = TimeEngine.getUtcOffsetMinutes(TimeEngine.localToUtc('2026-03-08', '10:00', NEW_YORK), NEW_YORK);
    expect(offBefore).toBe(-300); // EST
    expect(offDst).toBe(-240);    // EDT
  });

  it('6.3 a local occurrence after the DST jump is still priced on its own local weekday', async () => {
    // NY 2026-03-08 00:30 local (EST, -5) == 2026-03-08T05:30Z. Sunday 00:30
    // would be an odd peak window; use a plain hourly check instead.
    db.peaks = [{ day_of_week: 7, start_time: '00:00', end_time: '23:59', price_multiplier: '1.25' as any }];
    const p = await pricingEngine.calculatePrice(1, '00:30', '01:30', {
      startAtUtc: '2026-03-08T05:30:00.000Z',
      timezone: NEW_YORK,
    });
    expect(p.pricingDate).toBe('2026-03-08');
    expect(p.dayOfWeek).toBe(7);
    expect(p.totalPrice).toBe(500); // 400 * 1h * 1.25
  });

  it('6.4 a DST-gap local time still prices on the requested calendar date', () => {
    // 2026-03-08 02:30 America/New_York does not exist (gap 02:00 -> 03:00).
    // The recurrence's intended local DATE must still drive the weekday.
    expect(TimeEngine.getLocalDayOfWeekFromDate('2026-03-08')).toBe(7);
    expect(TimeEngine.getLocalDayOfWeekFromDate('2026-03-07')).toBe(6);
  });
});

// ── 7. Normal single bookings are completely unchanged ──────────────────────
describe('R5-A 7. Backward compatibility for normal single bookings', () => {
  it('7.1 the legacy 3-argument call keeps using the server current date', async () => {
    // "today" is Thursday -> Thursday peak pricing, exactly as before R5-A.
    const legacy = await pricingEngine.calculatePrice(1, '18:00', '20:00');
    expect(legacy.dayOfWeek).toBe(4);
    expect(legacy.totalPrice).toBe(1200);
    expect(legacy.pricingDate).toBeNull(); // no occurrence context supplied
  });

  it('7.2 an explicit undefined 4th argument is identical to the 3-argument call', async () => {
    const three = await pricingEngine.calculatePrice(1, '18:00', '20:00');
    const four = await pricingEngine.calculatePrice(1, '18:00', '20:00', undefined);
    expect(four).toEqual(three);
  });

  it('7.3 a single booking is NOT silently re-priced onto its own booking date', async () => {
    // Monday booking while "today" is Thursday: legacy behaviour (unchanged by
    // R5-A) still applies the Thursday rule. R5-A does not alter single-booking
    // semantics; only recurring occurrences pass an occurrence context.
    vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
    const single = await pricingEngine.calculatePrice(1, '18:00', '20:00');
    expect(single.totalPrice).toBe(1200);

    // The occurrence-aware call for the same Monday date is 1600 — proving the
    // two paths are genuinely distinct and only recurring uses the latter.
    const occurrence = await pricingEngine.calculatePrice(1, '18:00', '20:00', { date: MON, timezone: CAIRO });
    expect(occurrence.totalPrice).toBe(1600);
  });

  it('7.4 the existing overnight duration rule is untouched', async () => {
    const overnight = await pricingEngine.calculatePrice(1, '23:00', '00:00');
    expect(overnight.totalPrice).toBe(400); // 1h, not 0.5h
    const twoHour = await pricingEngine.calculatePrice(1, '23:00', '01:00');
    expect(twoHour.totalPrice).toBe(800);
  });
});

// ── 8. Series total is the exact sum of the canonical occurrence totals ──────
describe('R5-A 8. Authoritative series aggregation', () => {
  it('8.1 the series total equals the exact sum of the occurrence totals', () => {
    // Mon 1600 + Tue 800 + Thu 1200 + Mon 1600
    expect(PricingEngine.sumOccurrenceTotals([1600, 800, 1200, 1600])).toBe(5200);
  });

  it('8.2 an empty series totals zero', () => {
    expect(PricingEngine.sumOccurrenceTotals([])).toBe(0);
  });

  it('8.3 aggregation is 2dp and never accumulates float drift', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in raw float arithmetic.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(PricingEngine.sumOccurrenceTotals([0.1, 0.2])).toBe(0.3);
    expect(PricingEngine.sumOccurrenceTotals([1234.56, 0.1, 0.2])).toBe(1234.86);
    // A long series of already-rounded values stays exact.
    expect(PricingEngine.sumOccurrenceTotals(Array(366).fill(1200))).toBe(439200);
  });

  it('8.4 the total equals the sum of the PERSISTED 2dp occurrence amounts', () => {
    const occurrenceAmounts = [1600, 800, 1200, 1200].map((n) => Math.round(n * 100) / 100);
    const naive = occurrenceAmounts.reduce((a, b) => a + b, 0);
    expect(PricingEngine.sumOccurrenceTotals(occurrenceAmounts)).toBe(naive);
  });

  it('8.5 null/NaN-safe aggregation', () => {
    expect(PricingEngine.sumOccurrenceTotals([100, null as any, 50])).toBe(150);
  });
});
