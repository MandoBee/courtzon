# ADR-0009: Local-Time-First Scheduling

## Status

Accepted

## Context

CourtZon operates across multiple time zones (Egypt, UAE, Saudi Arabia, Europe). Sports facilities operate on **local time** — a court in Cairo opens at 08:00 Cairo time, while a court in Dubai opens at 08:00 Dubai time.

The challenge is that bookings span time zones:

- A user in Cairo books a court in Cairo for 18:00–19:00 Cairo time
- The booking must be converted to UTC for storage and comparison
- When displayed back to the user, it must be converted back to the local time of the venue
- DST transitions (spring-forward, fall-back) must be handled correctly
- Some facilities close after midnight (e.g., open 20:00, close 02:00) — the booking "day" spans two calendar dates

## Decision

Adopt a **Local-Time-First** scheduling model with a dedicated `TimeEngine`:

**1. Store local date + time in the booking**

```typescript
interface TimeSlot {
  date: string;       // "2026-07-27" — local date
  startTime: string;  // "22:00" — local time
  endTime: string;    // "00:00" — local time next day
}
```

**2. Convert to UTC for comparison**

```typescript
const startUtc = TimeEngine.localToUtc("2026-07-27", "22:00", "Africa/Cairo");
const endUtc = TimeEngine.localToUtc("2026-07-28", "00:00", "Africa/Cairo");
```

**3. TimeEngine with DST awareness**

The `TimeEngine` uses iterative convergence to handle DST transitions:

```
1. Tentative UTC = treat local time as UTC
2. Get timezone offset at tentative UTC
3. Adjust tentative UTC by the offset
4. Repeat until offset stabilizes (max 5 iterations)
```

**4. DST gap and overlap detection**

- `isInGap()` — detects spring-forward gaps (e.g., 02:00 doesn't exist when clocks jump to 03:00)
- `isInOverlap()` — detects fall-back overlaps (e.g., 01:30 occurs twice when clocks fall back)
- `resolveOverlap()` — picks the first or second occurrence deterministically

**5. Business day resolution**

`getBusinessDate()` determines which calendar day a booking belongs to, considering facilities that close after midnight:

```typescript
// Facility open 20:00, close 02:00
// Booking at 01:00 → belongs to the PREVIOUS calendar day's business day
```

## Consequences

**Benefits:**
- Timezone-aware scheduling without storing UTC offsets per booking
- DST transitions are handled correctly (gap detection throws a clear error, overlap is resolved deterministically)
- Facilities that close after midnight are supported
- Business day resolution enables correct daily reporting for facilities with overnight hours

**Trade-offs:**
- Time conversion is required on every read and write — computational overhead, though negligible
- The iterative convergence algorithm is unusual compared to using standard library `Date` with timezone — but necessary because the UTC offset depends on the local time, creating a circular dependency
- "24:00" as an end time is not a valid ISO time — the fix normalizes it to "00:00" on the next day (see ADR-0006 for the pending payment flow context)

**Alternatives rejected:**
- *Store everything in UTC*: Good for storage, but every display requires timezone conversion, and the "business day" boundary becomes ambiguous for overnight facilities
- *Use `luxon` or `date-fns-tz`*: External dependencies that provide similar functionality but add a dependency; the custom `TimeEngine` is simpler and more explicit about DST handling
- *Timezone-aware time slots per venue*: Over-engineered — the local-time-first model with conversion on read/write handles all cases

**Future considerations:**
- The "24:00" normalization should be extended to handle cases like "25:00" or "24:30" (though these shouldn't occur in practice)
- Consider adding a `localToUtc` overload that accepts the branch timezone directly to avoid passing it separately
- The iterative convergence algorithm should be documented more explicitly for future maintainers
