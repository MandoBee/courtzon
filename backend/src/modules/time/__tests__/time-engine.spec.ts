// ============================================================================
// Time Engine — Architecture Validation Suite
// ============================================================================
// This suite implements the Golden Scenarios defined in the Time Architecture.
// Every bug involving time becomes a permanent regression test here.

import { describe, it, expect, beforeEach } from 'vitest';
import { TimeEngine } from '../time-engine.js';
import { FakeClock } from '../clock.js';

describe('TimeEngine — Clock Abstraction', () => {
  it('SystemClock returns current time as ISO string', () => {
    const now = TimeEngine.now();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('FakeClock returns fixed instant', () => {
    const fixed = '2026-07-12T19:00:00.000Z';
    TimeEngine.setClock(new FakeClock(fixed));
    expect(TimeEngine.now()).toBe(fixed);
    TimeEngine.resetClock();
  });

  it('FakeClock.advanceMinutes advances the clock', () => {
    const clock = new FakeClock('2026-07-12T19:00:00.000Z');
    clock.advanceMinutes(30);
    expect(clock.now()).toBe('2026-07-12T19:30:00.000Z');
  });
});

describe('TimeEngine — TimezoneResolver', () => {
  it('validates Africa/Cairo as a valid IANA timezone', () => {
    expect(TimeEngine.validateTimezone('Africa/Cairo')).toBe('Africa/Cairo');
  });

  it('throws for invalid timezone string', () => {
    expect(() => TimeEngine.validateTimezone('Invalid/Timezone')).toThrow();
  });

  it('getUtcOffsetMinutes returns a numeric offset for Africa/Cairo', () => {
    const offset = TimeEngine.getUtcOffsetMinutes('2026-07-12T19:00:00.000Z', 'Africa/Cairo');
    expect(typeof offset).toBe('number');
    expect(offset % 60).toBe(0); // Should be whole hours
  });

  it('getUtcOffsetMinutes returns correct offset for Europe/London in winter', () => {
    const offset = TimeEngine.getUtcOffsetMinutes('2026-01-12T12:00:00.000Z', 'Europe/London');
    expect(offset).toBe(0);
  });

  it('getUtcOffsetMinutes returns correct offset for Europe/London in summer', () => {
    const offset = TimeEngine.getUtcOffsetMinutes('2026-07-12T12:00:00.000Z', 'Europe/London');
    expect(offset).toBe(60);
  });

  it('getUtcOffsetMinutes returns correct offset for Asia/Dubai (no DST)', () => {
    const offset = TimeEngine.getUtcOffsetMinutes('2026-07-12T12:00:00.000Z', 'Asia/Dubai');
    expect(offset).toBe(240);
  });
});

describe('TimeEngine — UTCConverter — Cairo (timezone-aware)', () => {
  it('local→UTC→local round-trip works for Cairo', () => {
    const utc = TimeEngine.localToUtc('2026-07-12', '22:00', 'Africa/Cairo');
    const back = TimeEngine.utcToLocal(utc, 'Africa/Cairo');
    expect(back.date).toBe('2026-07-12');
    expect(back.time).toBe('22:00');
  });

  it('UTC→local→UTC round-trip works for Cairo', () => {
    const original = '2026-07-12T19:00:00.000Z';
    const local = TimeEngine.utcToLocal(original, 'Africa/Cairo');
    const back = TimeEngine.localToUtc(local.date, local.time, 'Africa/Cairo');
    expect(back).toBe(original);
  });

  it('midnight local converts correctly (round-trip)', () => {
    const utc = TimeEngine.localToUtc('2026-07-13', '00:00', 'Africa/Cairo');
    const back = TimeEngine.utcToLocal(utc, 'Africa/Cairo');
    expect(back.date).toBe('2026-07-13');
    expect(back.time).toBe('00:00');
  });

  it('midnight UTC converts correctly (round-trip)', () => {
    const original = '2026-07-13T00:00:00.000Z';
    const local = TimeEngine.utcToLocal(original, 'Africa/Cairo');
    const back = TimeEngine.localToUtc(local.date, local.time, 'Africa/Cairo');
    expect(back).toBe(original);
  });

  it('London summer: round-trip works', () => {
    const utc = TimeEngine.localToUtc('2026-07-12', '22:00', 'Europe/London');
    expect(utc).toBe('2026-07-12T21:00:00.000Z');
  });

  it('London winter: 22:00 local = 22:00 UTC', () => {
    const utc = TimeEngine.localToUtc('2026-01-12', '22:00', 'Europe/London');
    expect(utc).toBe('2026-01-12T22:00:00.000Z');
  });

  it('London summer: 21:00 UTC = 22:00 local', () => {
    const local = TimeEngine.utcToLocal('2026-07-12T21:00:00.000Z', 'Europe/London');
    expect(local.date).toBe('2026-07-12');
    expect(local.time).toBe('22:00');
  });

  it('London winter: 22:00 UTC = 22:00 local', () => {
    const local = TimeEngine.utcToLocal('2026-01-12T22:00:00.000Z', 'Europe/London');
    expect(local.date).toBe('2026-01-12');
    expect(local.time).toBe('22:00');
  });
});

describe('TimeEngine — UTCConverter — London DST', () => {
  it('London summer: 22:00 local = 21:00 UTC', () => {
    const utc = TimeEngine.localToUtc('2026-07-12', '22:00', 'Europe/London');
    expect(utc).toBe('2026-07-12T21:00:00.000Z');
  });

  it('London winter: 22:00 local = 22:00 UTC', () => {
    const utc = TimeEngine.localToUtc('2026-01-12', '22:00', 'Europe/London');
    expect(utc).toBe('2026-01-12T22:00:00.000Z');
  });

  it('London summer: 21:00 UTC = 22:00 local', () => {
    const local = TimeEngine.utcToLocal('2026-07-12T21:00:00.000Z', 'Europe/London');
    expect(local.date).toBe('2026-07-12');
    expect(local.time).toBe('22:00');
  });

  it('London winter: 22:00 UTC = 22:00 local', () => {
    const local = TimeEngine.utcToLocal('2026-01-12T22:00:00.000Z', 'Europe/London');
    expect(local.date).toBe('2026-01-12');
    expect(local.time).toBe('22:00');
  });
});

describe('TimeEngine — UTCConverter — Sydney', () => {
  it('Sydney summer (UTC+11): 22:00 local = 11:00 UTC', () => {
    const utc = TimeEngine.localToUtc('2026-12-12', '22:00', 'Australia/Sydney');
    expect(utc).toBe('2026-12-12T11:00:00.000Z');
  });

  it('Sydney summer: 11:00 UTC = 22:00 local', () => {
    const local = TimeEngine.utcToLocal('2026-12-12T11:00:00.000Z', 'Australia/Sydney');
    expect(local.date).toBe('2026-12-12');
    expect(local.time).toBe('22:00');
  });
});

describe('TimeEngine — UTCConverter — Dubai (no DST)', () => {
  it('Dubai (UTC+4): 22:00 local = 18:00 UTC', () => {
    const utc = TimeEngine.localToUtc('2026-07-12', '22:00', 'Asia/Dubai');
    expect(utc).toBe('2026-07-12T18:00:00.000Z');
  });
});

describe('TimeEngine — BusinessDayResolver — Overnight session', () => {
  const opening = '13:00';
  const closing = '02:00';
  const tz = 'Africa/Cairo';

  it('O1: 00:00 local on July 13 belongs to Business Day July 12', () => {
    const instant = TimeEngine.localToUtc('2026-07-13', '00:00', tz);
    const bd = TimeEngine.getBusinessDate(instant, opening, closing, tz);
    expect(bd).toBe('2026-07-12');
  });

  it('O2: 01:00 local on July 13 belongs to Business Day July 12', () => {
    const instant = TimeEngine.localToUtc('2026-07-13', '01:00', tz);
    const bd = TimeEngine.getBusinessDate(instant, opening, closing, tz);
    expect(bd).toBe('2026-07-12');
  });

  it('O3: 13:00 local on July 12 belongs to Business Day July 12', () => {
    const instant = TimeEngine.localToUtc('2026-07-12', '13:00', tz);
    const bd = TimeEngine.getBusinessDate(instant, opening, closing, tz);
    expect(bd).toBe('2026-07-12');
  });

  it('O4: 02:00 local on July 13 belongs to Business Day July 13 (new session)', () => {
    const instant = TimeEngine.localToUtc('2026-07-13', '02:00', tz);
    const bd = TimeEngine.getBusinessDate(instant, opening, closing, tz);
    // 02:00 is when the branch closes — the new session starts at 13:00
    expect(bd).toBe('2026-07-13');
  });

  it('getCurrentBusinessDate returns correct business day', () => {
    const clock = new FakeClock('2026-07-12T21:00:00.000Z'); // 00:00 Cairo next day
    TimeEngine.setClock(clock);
    const bd = TimeEngine.getCurrentBusinessDate(opening, closing, tz);
    expect(bd).toBe('2026-07-12');
    TimeEngine.resetClock();
  });
});

describe('TimeEngine — SlotGenerator — Overnight', () => {
  const tz = 'Africa/Cairo';
  const opening = '13:00';
  const closing = '02:00';

  it('generates 13:00-02:00 slots, all tagged with businessDate July 12', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', opening, closing, 60, tz);
    expect(slots.length).toBeGreaterThan(0);

    // All slots should have businessDate = 2026-07-12
    slots.forEach(slot => {
      expect(slot.businessDate).toBe('2026-07-12');
    });

    // First slot at 13:00, last at 01:00
    expect(slots[0].localStartTime).toBe('13:00');
    expect(slots[slots.length - 1].localStartTime).toBe('01:00');
  });

  it('overnight slot 00:00 has businessDate July 12 and correct UTC round-trip', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const midnightSlot = slots.find(s => s.localStartTime === '00:00');
    expect(midnightSlot).toBeDefined();
    expect(midnightSlot!.businessDate).toBe('2026-07-12');
    // Round-trip: UTC → local should give us 00:00
    const local = TimeEngine.utcToLocal(midnightSlot!.startAtUtc, 'Africa/Cairo');
    expect(local.time).toBe('00:00');
  });
});

describe('TimeEngine — Availability — expires using UTC', () => {
  it('A1: future slot is available', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const clock = new FakeClock('2026-07-11T23:00:00.000Z'); // well before any slot
    TimeEngine.setClock(clock);
    const avail = TimeEngine.resolveAvailability(slots, []);
    avail.forEach(s => expect(s.status).toBe('available'));
    TimeEngine.resetClock();
  });

  it('A2: past slot is expired', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const clock = new FakeClock('2026-07-12T12:00:00.000Z'); // At 12:00 UTC = 14:00 Cairo — 13:00 slot is past
    TimeEngine.setClock(clock);
    const avail = TimeEngine.resolveAvailability(slots, []);
    const firstSlot = avail.find(s => s.localStartTime === '13:00');
    expect(firstSlot?.status).toBe('expired');
    TimeEngine.resetClock();
  });

  it('A3: overnight slot 00:00 is not expired when before its UTC time', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const clock = new FakeClock('2026-07-12T20:00:00.000Z'); // Before 00:00 Cairo (22:00 UTC)
    TimeEngine.setClock(clock);
    const avail = TimeEngine.resolveAvailability(slots, []);
    const midSlot = avail.find(s => s.localStartTime === '00:00');
    expect(midSlot?.status).toBe('available');
    TimeEngine.resetClock();
  });

  it('A4: overnight slot 00:00 is expired after its UTC time', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const clock = new FakeClock('2026-07-12T23:00:00.000Z'); // After 00:00 Cairo (22:00 UTC)
    TimeEngine.setClock(clock);
    const avail = TimeEngine.resolveAvailability(slots, []);
    const midSlot = avail.find(s => s.localStartTime === '00:00');
    expect(midSlot?.status).toBe('expired');
    TimeEngine.resetClock();
  });
});

describe('TimeEngine — Availability — conflict detection', () => {
  it('marks a slot as booked when an existing booking overlaps', () => {
    const slots = TimeEngine.generateSlots('2026-07-12', '13:00', '02:00', 60, 'Africa/Cairo');
    const existing = [
      { startAtUtc: '2026-07-12T12:00:00.000Z', endAtUtc: '2026-07-12T13:00:00.000Z' },
    ];
    const avail = TimeEngine.resolveAvailability(slots, existing, '2026-07-11T00:00:00.000Z');
    // Slot 13:00 local = 11:00 UTC. Booking 12:00-13:00 UTC overlaps.
    // Actually 13:00-14:00 local = 11:00-12:00 UTC. No overlap with 12:00-13:00.
    // Let's test with a booking that actually overlaps
    const overlappingBooking = [
      { startAtUtc: '2026-07-12T10:00:00.000Z', endAtUtc: '2026-07-12T12:00:00.000Z' },
    ];
    const avail2 = TimeEngine.resolveAvailability(slots, overlappingBooking, '2026-07-11T00:00:00.000Z');
    // 13:00-14:00 local = 11:00-12:00 UTC. Booking 10:00-12:00 UTC overlaps at 11:00-12:00.
    const firstSlot = avail2.find(s => s.localStartTime === '13:00');
    expect(firstSlot?.status).toBe('booked');
  });
});

describe('TimeEngine — DST Detection', () => {
  it('isInGap detects spring-forward gap (Europe/London, March 29 01:30)', () => {
    // In 2026, clocks spring forward at 01:00 UTC on March 29
    // 01:30 local doesn't exist (jumps to 02:00)
    const gap = TimeEngine.isInGap('2026-03-29', '01:30', 'Europe/London');
    // This is after the transition, so 01:30 should be in the gap
    expect(gap).toBe(true);
  });

  it('isInGap returns false for normal time (Europe/London, Jan 12 01:30)', () => {
    const gap = TimeEngine.isInGap('2026-01-12', '01:30', 'Europe/London');
    expect(gap).toBe(false);
  });
});

describe('TimeEngine — getLocalDayOfWeek', () => {
  it('Friday (July 10 2026) is day 5 in getUTCDay, mapping to 5', () => {
    // July 10, 2026 is a Friday
    const dow = TimeEngine.getLocalDayOfWeek('2026-07-10T12:00:00.000Z', 'Africa/Cairo');
    expect(dow).toBe(5); // Friday
  });

  it('Monday is day 1', () => {
    // July 13, 2026 is a Monday
    const dow = TimeEngine.getLocalDayOfWeek('2026-07-13T12:00:00.000Z', 'Africa/Cairo');
    expect(dow).toBe(1);
  });
});

describe('TimeEngine — computeReminderUtc', () => {
  it('30 minutes before 19:00 UTC is 18:30 UTC', () => {
    const reminder = TimeEngine.computeReminderUtc('2026-07-12T19:00:00.000Z', 30);
    expect(reminder).toBe('2026-07-12T18:30:00.000Z');
  });

  it('60 minutes before 00:00 UTC is 23:00 UTC previous day', () => {
    const reminder = TimeEngine.computeReminderUtc('2026-07-13T00:00:00.000Z', 60);
    expect(reminder).toBe('2026-07-12T23:00:00.000Z');
  });
});

describe('TimeEngine — getBusinessDayRange', () => {
  it('non-overnight: round-trip works for 08:00-22:00 in Cairo', () => {
    const range = TimeEngine.getBusinessDayRange('2026-07-12', '08:00', '22:00', 'Africa/Cairo');
    // Verify the conversion by round-trip
    const fromLocal = TimeEngine.utcToLocal(range.fromUtc, 'Africa/Cairo');
    expect(fromLocal.time).toBe('08:00');
    expect(fromLocal.date).toBe('2026-07-12');
    const toLocal = TimeEngine.utcToLocal(range.toUtc, 'Africa/Cairo');
    expect(toLocal.time).toBe('22:00');
    expect(toLocal.date).toBe('2026-07-12');
  });

  it('overnight: July 12 13:00-02:00 range spans to July 13', () => {
    const range = TimeEngine.getBusinessDayRange('2026-07-12', '13:00', '02:00', 'Africa/Cairo');
    // fromUtc should convert to July 12 13:00 local
    const fromLocal = TimeEngine.utcToLocal(range.fromUtc, 'Africa/Cairo');
    expect(fromLocal.time).toBe('13:00');
    expect(fromLocal.date).toBe('2026-07-12');
    // toUtc should convert to July 13 02:00 local (next day)
    const toLocal = TimeEngine.utcToLocal(range.toUtc, 'Africa/Cairo');
    expect(toLocal.time).toBe('02:00');
    expect(toLocal.date).toBe('2026-07-13');
  });
});
