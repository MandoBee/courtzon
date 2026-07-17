# Booking Time Model — Architecture Reference

## 1. Why `business_date` Exists

`business_date` represents the **operating day** the booking belongs to, according to the branch's timezone and operating hours. It exists because a booking's calendar date can differ from its business date when sessions cross midnight or when DST shifts the operating day boundary.

**Example:** A branch opens at 13:00 and closes at 01:00. A booking at 23:00 on July 18 has calendar date `2026-07-18` but belongs to business date `2026-07-19` (the operating day that starts at 13:00 on July 18 and ends at 01:00 on July 19).

The `business_date` is computed by `TimeEngine.getBusinessDate()` and is the authoritative field for:
- Grouping bookings by operating day
- Slot availability queries (`findBookingsByBusinessDate`)
- Reporting and analytics

## 2. Why `start_at_utc` and `end_at_utc` Are the Canonical Source of Truth

Local times (`start_time`, `end_time`) are ambiguous — they depend on the branch timezone and DST state. UTC timestamps are absolute and unambiguous. `start_at_utc` and `end_at_utc` are the single source of truth for:

- **Overlap detection:** The availability engine compares UTC ranges using `slotStart < bookingEnd && slotEnd > bookingStart`. This works correctly regardless of timezone, DST, or whether the session crosses midnight.
- **Cross-midnight sessions:** A booking at 23:00–01:00 stores UTC values like `2026-07-18 21:00:00` → `2026-07-18 23:00:00`. The UTC ordering guarantees `end_at_utc > start_at_utc` even when local times wrap around.
- **Distributed systems:** UTC timestamps are consistent across servers, timezones, and DST transitions. Two servers in different timezones will compute the same UTC for the same local time.

## 3. Why `booking_date`/`start_time`/`end_time` Are User-Facing Locals Only

These fields store the **local date and time as the user selected them**. They exist for:
- Display in the UI (showing "July 19, 13:00–14:00" in the branch timezone)
- Backward compatibility with legacy queries
- Deriving UTC values for bookings that lack them (legacy fallback)

These fields must NEVER be used for:
- Availability conflict detection (use UTC instead)
- Business date grouping (use `business_date` instead)
- Sorting or ordering (local times may appear out of order across DST transitions)

## 4. How TimeEngine Converts Local Time to Canonical UTC

The conversion uses iterative convergence to handle DST correctly:

```
localToUtc(date, time, timezone) → UtcInstant
```

**Algorithm:**
1. Tentative UTC = local date+time treated as if UTC
2. Look up the UTC offset at that tentative UTC via `Intl.DateTimeFormat`
3. Adjust tentative UTC by the offset: `newUtc = localEpoch - offset * 60000`
4. Repeat until the offset stabilizes (converges within 5 iterations)
5. If the local time falls in a spring-forward gap (doesn't exist), throw `DSTGapError`

**Example for Cairo, July (UTC+3):**
```
localToUtc('2026-07-18', '13:00', 'Africa/Cairo')
  → Iteration 1: tentative = 2026-07-18T13:00:00Z, offset = +180
  → Iteration 2: tentative = 2026-07-18T10:00:00Z, offset = +180
  → Converged: 2026-07-18T10:00:00Z
```

`getBusinessDate()` then computes the business date from the UTC instant:

```
getBusinessDate(utcInstant, openingHours, closingHours, timezone) → LocalDate
```

## 5. How Cross-Midnight Bookings Are Represented

A session that crosses midnight (e.g., 23:00 → 01:00) stores:

| Field | Value |
|-------|-------|
| `booking_date` | `2026-07-18` (user's selected date) |
| `start_time` | `23:00` (local) |
| `end_time` | `01:00` (local, wraps around) |
| `start_at_utc` | `2026-07-18 21:00:00` (UTC) |
| `end_at_utc` | `2026-07-18 23:00:00` (UTC) |
| `business_date` | `2026-07-18` or `2026-07-19` (per branch hours) |

In `createBooking()`, the `end_time` is detected as being before `start_time`, and the `booking_date` for the end time is bumped by one day before UTC conversion:

```
endUtc = TimeEngine.localToUtc(nextDayDate, endTime, timezone)
```

This ensures `end_at_utc > start_at_utc` is always true.

## 6. How `business_date` Differs from Calendar Date

`business_date` is computed by `TimeEngine.getBusinessDate()`, which converts the UTC instant to local time and determines which operating day it belongs to. The branch's operating hours define the business day boundary.

**Example 1 — Standard hours (08:00–22:00):**
- A booking at 13:00 Cairo → UTC 11:00 → local date = Cairo date → `business_date = '2026-07-18'`

**Example 2 — Overnight hours (13:00–01:00):**
- A booking at 23:00 Cairo → UTC 21:00 → local date still July 18, but business day belongs to July 19 (the operating day that started at 13:00 on July 18 and ends at 01:00 on July 19)
- A booking at 00:30 → UTC 22:30 (previous day) → business date = July 18 (belongs to the previous operating day)

**Key rule:** `business_date` can differ from `booking_date`. Always use `business_date` for grouping and `booking_date` for display.

## 7. Why Every New Booking Must Go Through TimeEngine

The `TimeEngine` is the **single authorized entry point** for all time-related operations. Every booking creation path must use it because:

1. **DST safety:** Manual date math does not handle DST transitions. `TimeEngine` uses `Intl.DateTimeFormat` backed by ICU data, which correctly resolves DST for any IANA timezone.
2. **Cross-midnight correctness:** Only `TimeEngine` correctly computes UTC for sessions that wrap past midnight.
3. **Consistency:** All UTC values and business dates are computed identically regardless of which code path creates the booking.
4. **Future-proofing:** If the timezone database or DST rules change, only `TimeEngine` needs updating.

## 8. Purpose of the Legacy Compatibility Layer

The `getResourceSlots()` method in `booking.service.ts` contains a compatibility block that detects bookings without `start_at_utc` or `end_at_utc` and computes these values from local `booking_date`/`start_time`/`end_time` fields at query time.

This exists because bookings created before the TimeEngine was introduced (or bookings created through code paths that didn't set these fields) have `NULL` canonical timestamps. Without this layer, those bookings would be invisible to the availability engine.

The layer is temporary and will be removed after the backfill migration (`scripts/backfill.mjs`) has been executed on every production environment.

## 9. When and How to Remove the Compatibility Layer

**Condition for removal:** After confirming that `SELECT COUNT(*) FROM bookings WHERE start_at_utc IS NULL` returns 0 in every environment (production, staging, development).

**Steps:**
1. Run `scripts/backfill.mjs` on any environment that still has legacy bookings
2. Verify zero remaining: `SELECT COUNT(*) FROM bookings WHERE business_date IS NULL OR start_at_utc IS NULL OR end_at_utc IS NULL`
3. Remove the compatibility block in `booking.service.ts` (marked with `TODO`)
4. Remove the `booking_date`, `start_time`, `end_time` columns from `findBookingsByBusinessDate` SELECT (they are only needed for the legacy conversion)
5. Update `findBookingsByBusinessDate` to restore the `AND start_at_utc IS NOT NULL` filter (now safe because all rows have it)

## 10. Common Mistakes to Avoid

| Mistake | Why It's Wrong | Correct Approach |
|---------|---------------|------------------|
| `new Date()` for business logic | Uses server timezone, not branch timezone | `TimeEngine.now()` |
| `Date.UTC(y, m-1, d, h, min)` for time conversion | Ignores timezone and DST — produces incorrect UTC for any timezone outside UTC itself | `TimeEngine.localToUtc(date, time, timezone)` |
| `setHours()` / `setUTCHours()` | Mutates date in place, timezone-naive | Use `TimeEngine` methods only |
| `getTimezoneOffset()` | Returns server's offset, not branch offset | `TimeEngine.getUtcOffsetMinutes(instant, timezone)` |
| Manual `± offset * 60000` arithmetic | Does not handle DST convergence | `TimeEngine.localToUtc()` uses iterative convergence |
| Creating a booking row without `business_date`, `start_at_utc`, `end_at_utc` | Booking becomes invisible to availability engine and will be excluded from slot queries | Always compute via `TimeEngine` and pass all three fields |
| Using `booking_date` in availability overlap queries | Cross-midnight bookings have wrong `booking_date` for the end time; misses overnight overlap | Use `start_at_utc` / `end_at_utc` (UTC-based) or `business_date` for grouping |
| Comparing local `start_time` / `end_time` for overlap | Fails when session crosses midnight (e.g., 23:00 < 01:00 is false, but 23:00 UTC < 01:00 UTC next day is true) | Use UTC range comparison: `slotStartUtc < bookingEndUtc && slotEndUtc > bookingStartUtc` |
| `toISOString()` on a local Date object | Converts using server timezone, shifting the date unexpectedly | `TimeEngine.localToUtc()` returns a UTC ISO string directly |
| `new Date(dateString)` parsing | Browser/server may interpret "2026-07-18" as UTC or local depending on the format | Always pass explicit date+time+timezone to `TimeEngine` |

## Time Fields Reference

| Column | Type | Purpose | Computed By |
|--------|------|---------|-------------|
| `booking_date` | DATE | User-facing calendar date | Frontend selection |
| `business_date` | DATE | Operating day for grouping/queries | `TimeEngine.getBusinessDate()` |
| `start_time` | TIME(2) | User-facing local start | Frontend selection |
| `end_time` | TIME(2) | User-facing local end | Frontend selection |
| `start_at_utc` | DATETIME | Canonical UTC start (source of truth) | `TimeEngine.localToUtc()` |
| `end_at_utc` | DATETIME | Canonical UTC end (source of truth) | `TimeEngine.localToUtc()` |
