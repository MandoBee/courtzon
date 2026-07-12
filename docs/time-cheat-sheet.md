# CourtZon Time Cheat Sheet — One-Minute Developer Guide

## The Golden Rule

**NEVER call `new Date()` outside `TimeEngine`.**

```typescript
// ❌ WRONG
const now = new Date()
const start = new Date(`${bookingDate}T${startTime}`)

// ✅ CORRECT
const now = TimeEngine.now()
const utc = TimeEngine.localToUtc(bookingDate, startTime, branchTimezone)
```

## Three Sources of Truth

| Column | What it is | When to use |
|--------|-----------|-------------|
| `start_at_utc` / `end_at_utc` | Absolute instant | Business logic, expiry, notifications, calendar APIs |
| `business_date` | The operating day | Reporting, availability, cash closing |
| `booking_date` / `start_time` | Local display value | Backward compatibility, booking_slots |

## Architecture Rules

1. **Frontend sends local time.** Backend converts to UTC. The frontend never sends UTC.
2. **SQL `NOW()` is safe only for `TIMESTAMP` columns.** Never compare `DATE`/`TIME` columns with SQL clock functions.
3. **Business Day starts at branch opening**, not midnight. A slot at 00:30 on July 13 can belong to business day July 12.
4. **DST is handled by the OS IANA database.** Trust `Intl.DateTimeFormat` — it reflects the latest government rules.
5. **Testing:** Use `FakeClock` instead of mocking `Date`.

## Common Mistakes

- `new Date("2026-07-12T22:00")` — This is parsed as **server local time**, not UTC. Always use `TimeEngine.localToUtc()`.
- `.toISOString().slice(0, 10)` — This returns the **UTC date**, not the local date. Use `TimeEngine.utcToLocalDate()` instead.
- `CURDATE()` in SQL — Returns the server's UTC date. Not the branch's local date.

## Quick Reference

```typescript
// Convert local → UTC
const utc = TimeEngine.localToUtc("2026-07-12", "22:00", "Africa/Cairo")

// Convert UTC → local
const { date, time } = TimeEngine.utcToLocal("2026-07-12T19:00:00Z", "Africa/Cairo")

// What business day is it right now?
const bd = TimeEngine.getCurrentBusinessDate("13:00", "02:00", "Africa/Cairo")

// What time is "now" in UTC?
const now = TimeEngine.now()

// Generate all slots for a business day
const slots = TimeEngine.generateSlots("2026-07-12", "13:00", "02:00", 60, "Africa/Cairo")

// Check slot availability
const avail = TimeEngine.resolveAvailability(slots, existingBookings, TimeEngine.now())
```

## Architecture Documents

- `docs/time-architecture.md` — Full specification (29 sections)
- `docs/adr/ADR-001` through `ADR-005` — Key architectural decisions
