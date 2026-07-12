# CourtZon Time Architecture — Final Specification

**Status:** Architecture Freeze  
**Date:** July 2026  
**Scope:** 10-year enterprise design  
**Guiding principle:** Correctness > Performance > Complexity. Never assume. Always derive.

---

## 1. Core Principles

### 1.0 Final Review Decisions (July 2026)

The following decisions were made during the final architecture review. These are binding.

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| `local_start_time` / `local_end_time` as stored columns | **KEEP permanently** | Written atomically with UTC columns. Backward compatibility for ALL existing queries. Required by `booking_slots` which references them. Not derived. |
| Timezone rules version snapshot | **REJECTED** | Local time is already stored. Snapshot provides zero value — you can't reconstruct the local time from UTC + version string without the full IANA database at that version. |
| Configurable Business Day Strategy | **REJECTED** | OPENING_BASED is the ONLY correct strategy for any branch that operates past midnight. For non-overnight branches, both strategies produce identical results. Adding a configuration option creates two code paths with zero benefit. |
| Holidays → Override system | **Phase 2** | Branch defaults work for Phase 1. Override table deferred until a branch first needs modified hours. |
| Frontend "Today" button | **Phase 2** | Server-side `apiDate` conversion is functionally correct. The label may be misleading in cross-timezone scenarios, but this is a UX issue, not a correctness issue. |
| ADR creation | **RECOMMENDED** | Five ADRs to document key decisions before implementation begins. |
| Test validation suite | **RECOMMENDED** | Must exist BEFORE implementation. Defines expected behavior for every edge case. |
| Naive `new Date()` fixes (15+ sites) | **Phase 2** | They read existing data, which is unchanged. Not on the critical path for Phase 1. |



### 1.1 The Only Global Absolute

**UTC is the only unambiguous representation of an instant in time.**

Every booking represents a commitment between a customer and a facility. That commitment happens at an instant in the universe. That instant must be recorded in UTC.

### 1.2 Separation of Concerns

| Concept | Definition | Stored? | Source |
|---------|-----------|---------|--------|
| **UtcInstant** | Absolute point in time | YES — TIMESTAMP in bookings | Computed by TimeEngine at creation |
| **BusinessDate** | Which operating session | YES — DATE in bookings | Resolved by OperatingHoursEngine at creation |
| **LocalTime** | Wall-clock time in branch tz | YES — TIME in bookings | Submitted by frontend |
| **CalendarDate** | Date on the calendar | DERIVED from UtcInstant + tz | Never stored directly |
| **Display time** | User-facing formatted time | NEVER | Computed by frontend from UTC + user tz |

### 1.3 Immutability

Once a booking is confirmed:
- `start_at_utc` is IMMUTABLE
- `end_at_utc` is IMMUTABLE
- `business_date` is IMMUTABLE
- `local_start_time` / `local_end_time` are IMMUTABLE

Government changes DST rules? The booking still happens at the same UTC instant. The displayed local time may change, but the hand-off time between customer and court does not.

### 1.4 No Direct Time API Calls

The following are BANNED outside the Time Engine module:

```typescript
new Date()           // BANNED — use TimeEngine.now()
Date.parse()         // BANNED — use TimeEngine.UtcConverter
Intl.DateTimeFormat() // BANNED — use TimeEngine.TimezoneResolver
.toLocaleString()    // BANNED — use TimeEngine.UtcConverter
```

Enforced by:
- ESLint `no-restricted-syntax` rule
- Code review gate
- One exception: `new Date()` inside the Time Engine's `now()` method (single location)

---

## 2. Domain Model (no changes)

The existing hierarchy is preserved:

```
Organisation
  └── Branch
        ├── timezone: IANA string
        ├── opening_time: TIME (local)
        ├── closing_time: TIME (local)
        ├── holidays / modified hours (existing mechanism)
        └── Resources
              └── Bookings
```

**No new entities are created.** The Branch model naturally IS the Operating Hours Engine. Its existing fields provide the default operating session. Overrides (holidays, special events) extend the concept through a lightweight override mechanism — not a new entity.

### 2.1 Operating Hours Engine = Branch Model

The Branch already owns:
- `timezone` — the IANA timezone
- `opening_time` — when a business day starts
- `closing_time` — when a business day ends
- Holiday mechanism (already exists via schedules)

**No new database table is needed for Phase 1.** The Operating Hours Engine reads from the existing Branch model. Overrides are added in Phase 2 only when needed.

The Operating Hours Engine's job is to answer one question:

> Given a BusinessDate and a BranchId, what is the effective operating session?

Initially it returns the Branch defaults. Later it checks overrides.

---

## 3. Time Engine

### 3.1 Module Structure

```
src/time-engine/
├── TimeEngine.ts               # Facade — single public entry point
├── UtcConverter.ts             # Local ↔ UTC conversion
├── TimezoneResolver.ts         # Timezone validation & metadata
├── DSTResolver.ts              # DST gap/overlap handling
├── BusinessDayResolver.ts      # Business date computation
├── OperatingHoursEngine.ts     # Effective hours for a date
├── SlotGenerator.ts            # Slot generation with DST
├── AvailabilityEngine.ts       # Slot availability + expiry
├── RecurringEngine.ts          # Recurrence rule processing
├── NotificationTimeLayer.ts    # Reminder computation
├── PricingTimeLayer.ts         # Pricing period lookup
├── ReportingTimeLayer.ts       # Report time grouping
├── types.ts                    # Shared types
└── errors.ts                   # Time-specific errors
```

### 3.2 Type Definitions

```typescript
// === Core Primitives ===

type UtcInstant = string               // ISO 8601: "2026-07-12T19:00:00Z"
type LocalDate = string                // "2026-07-12"
type LocalTime = string                // "22:00"
type BusinessDate = string             // "2026-07-12"
type IANATimezone = string             // "Africa/Cairo"

// === DST ===

type DSTTransitionType = 'spring_forward' | 'fall_back'

interface DSTTransition {
  type: DSTTransitionType
  localDate: LocalDate
  localTime: LocalTime
  gapStartUtc: UtcInstant
  gapEndUtc: UtcInstant
  beforeOffsetMinutes: number
  afterOffsetMinutes: number
}

type DSTResolution = 'first' | 'second' | 'skip'

// === Operating Hours ===

interface OperatingSession {
  opensAt: LocalTime
  closesAt: LocalTime
  isClosed: boolean
}

// === Slots ===

interface TimeSlot {
  localStartTime: LocalTime
  localEndTime: LocalTime
  startAtUtc: UtcInstant
  endAtUtc: UtcInstant
  businessDate: BusinessDate
  utcOffsetMinutes: number
}

type SlotStatus = 'available' | 'booked' | 'expired' | 'selected'

interface AvailableSlot extends TimeSlot {
  status: SlotStatus
}

// === Recurrence ===

interface RecurrenceRule {
  branchId: number
  resourceId: number
  weekday: number              // 1=Mon .. 7=Sun
  localTime: LocalTime
  timezone: IANATimezone
  firstBusinessDate: BusinessDate
  lastBusinessDate: BusinessDate | null
  intervalWeeks: number
  dstHandling: DSTHandling
}

type DSTHandling = 'preserve_local_time' | 'preserve_utc_offset'

interface BookingInstance {
  businessDate: BusinessDate
  startAtUtc: UtcInstant
  endAtUtc: UtcInstant
  localStartTime: LocalTime
  localEndTime: LocalTime
}

// === Reminders ===

interface ScheduledReminder {
  remindAtUtc: UtcInstant
  type: string
}

// === Report Ranges ===

interface UtcRange {
  fromUtc: UtcInstant
  toUtc: UtcInstant
}

// === Errors ===

class TimezoneError extends Error {}       // Invalid timezone
class DSTGapError extends Error {}          // Time falls in spring-forward gap
class AmbiguousTimeError extends Error {}   // Time occurs twice (fall-back)
class InvalidSlotError extends Error {}     // Slot doesn't exist in this timezone
```

### 3.3 Public API

```typescript
class TimeEngine {
  // ── The ONLY new Date() in the codebase ──
  static now(): UtcInstant

  // ── UtcConverter ──
  static localToUtc(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant
  static utcToLocal(instant: UtcInstant, tz: IANATimezone): { date: LocalDate, time: LocalTime }
  static utcToLocalDate(instant: UtcInstant, tz: IANATimezone): LocalDate
  static utcToLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime

  // ── TimezoneResolver ──
  static validateTimezone(tz: string): IANATimezone
  static getUtcOffsetMinutes(instant: UtcInstant, tz: IANATimezone): number
  static getNextDSTTransition(instant: UtcInstant, tz: IANATimezone): DSTTransition | null
  static getAllDSTTransitionsForYear(year: number, tz: IANATimezone): DSTTransition[]

  // ── DSTResolver ──
  static isInGap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean
  static isInOverlap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean
  static resolveOverlap(date: LocalDate, time: LocalTime, tz: IANATimezone, preference: DSTResolution): UtcInstant
  static resolveGap(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant | null

  // ── OperatingHoursEngine ──
  static getEffectiveOperatingHours(businessDate: BusinessDate, branchId: number): OperatingSession
  static isOpenOn(businessDate: BusinessDate, branchId: number): boolean

  // ── BusinessDayResolver ──
  static getBusinessDate(instant: UtcInstant, branchId: number): BusinessDate
  static getBusinessDayRange(businessDate: BusinessDate, branchId: number): UtcRange
  static getCurrentBusinessDate(branchId: number): BusinessDate

  // ── SlotGenerator ──
  static generateSlots(businessDate: BusinessDate, resourceId: number, branchId: number, durationMinutes: number): TimeSlot[]

  // ── AvailabilityEngine ──
  static getAvailableSlots(businessDate: BusinessDate, resourceId: number, branchId: number): AvailableSlot[]
  static isSlotAvailable(startUtc: UtcInstant, endUtc: UtcInstant, resourceId: number): boolean
  static resolveSlotConflicts(resourceId: number, startUtc: UtcInstant, endUtc: UtcInstant): BookingConflict[]

  // ── RecurringEngine ──
  static generateOccurrences(rule: RecurrenceRule): BookingInstance[]
  static resolveNextOccurrence(rule: RecurrenceRule, afterUtc: UtcInstant): BookingInstance | null

  // ── NotificationTimeLayer ──
  static computeReminderUtc(startUtc: UtcInstant, minutesBefore: number): UtcInstant
  static computeAllReminders(startUtc: UtcInstant, config: { minutesBefore: number }[]): ScheduledReminder[]

  // ── PricingTimeLayer ──
  static getLocalDayOfWeek(instant: UtcInstant, tz: IANATimezone): number
  static getLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime

  // ── ReportingTimeLayer ──
  static getBusinessDateRange(fromDate: BusinessDate, toDate: BusinessDate, branchId: number): UtcRange
  static getUtcDateRange(utcDate: LocalDate): UtcRange
}
```

---

## 4. Database Schema

### 4.1 Changes Classification

| Change | Classification | Rationale |
|--------|---------------|-----------|
| Add `start_at_utc` TIMESTAMP to `bookings` | **Mandatory** | Time Engine needs UTC; backfill now avoids larger migration later |
| Add `end_at_utc` TIMESTAMP to `bookings` | **Mandatory** | Same — defines the absolute booking window |
| Add `business_date` DATE to `bookings` | **Mandatory** | Required for reporting and business-day grouping |
| Add `start_at_utc` TIMESTAMP to `booking_intents` | **Mandatory** | Intents become bookings; must carry UTC |
| Add `end_at_utc` TIMESTAMP to `booking_intents` | **Mandatory** | Same |
| Add `business_date` DATE to `booking_intents` | **Mandatory** | Same |
| Add `start_at_utc` TIMESTAMP to `booking_slots` | **Deferred** | User decision — slot records stay lightweight |
| Add `end_at_utc` TIMESTAMP to `booking_slots` | **Deferred** | Same |
| Add `business_date` DATE to `booking_slots` | **Deferred** | Same |
| Add index on `bookings(start_at_utc)` | **Recommended** | Performance for UTC range queries |
| Add index on `bookings(business_date)` | **Recommended** | Performance for business-day grouping |
| Add `branch_hours_overrides` table | **Deferred** | Not needed until operating hours change |
| Versioned operating hours | **Deferred** | Not needed until historical correctness is audited |
| Generated columns (local_time, booking_date) | **Optional** | Performance optimization — defer until measured need |
| Remove `booking_date` / `start_time` / `end_time` | **Deferred** | Keep for backward compatibility; possibly never remove |
| Dedicated availability projection | **Deferred** | User confirmed — defer until performance measured |

### 4.2 Migration Plan (backward compatible)

```sql
-- Step 1: Add nullable columns
ALTER TABLE bookings
  ADD COLUMN start_at_utc TIMESTAMP NULL AFTER start_time,
  ADD COLUMN end_at_utc TIMESTAMP NULL AFTER end_time,
  ADD COLUMN business_date DATE NULL AFTER booking_date;

ALTER TABLE booking_intents
  ADD COLUMN start_at_utc TIMESTAMP NULL,
  ADD COLUMN end_at_utc TIMESTAMP NULL,
  ADD COLUMN business_date DATE NULL;

-- Step 2: Backfill existing rows
-- Uses TimeEngine on the application side to convert (booking_date + start_time + branch timezone) → UTC
-- Script iterates through each existing booking, computes UTC + business_date, updates the row

-- Step 3: Make NOT NULL after backfill
ALTER TABLE bookings
  MODIFY COLUMN start_at_utc TIMESTAMP NOT NULL,
  MODIFY COLUMN end_at_utc TIMESTAMP NOT NULL,
  MODIFY COLUMN business_date DATE NOT NULL;

ALTER TABLE booking_intents
  MODIFY COLUMN start_at_utc TIMESTAMP NOT NULL,
  MODIFY COLUMN end_at_utc TIMESTAMP NOT NULL,
  MODIFY COLUMN business_date DATE NOT NULL;

-- Step 4: Add indexes
CREATE INDEX idx_bookings_start_at_utc ON bookings(start_at_utc);
CREATE INDEX idx_bookings_business_date ON bookings(business_date);
CREATE INDEX idx_booking_intents_start_at_utc ON booking_intents(start_at_utc);
CREATE INDEX idx_booking_intents_business_date ON booking_intents(business_date);
```

**Backward compatibility:** All existing queries continue to work because `booking_date`, `start_time`, `end_time` remain unchanged. The new columns are additive. The old `CONCAT(booking_date, ' ', start_time) < NOW()` pattern in `booking-auto-complete.worker.ts` continues to work identically for existing bookings.

---

## 5. Business Day

### 5.1 Definition

A Business Day is one complete operating session.

It starts when the branch opens on a given calendar date (after applying all operating hour rules) and ends when the branch closes — even if that extends into the next calendar day.

### 5.2 Resolved by OperatingHoursEngine

```typescript
// Simplified logic
function getBusinessDate(instant: UtcInstant, branchId: number): BusinessDate {
  const local = TimeEngine.utcToLocal(instant, branch.timezone)
  const session = OperatingHoursEngine.getEffectiveOperatingHours(local.date, branchId)

  // Is the instant within the operating session that STARTED on local.date?
  const sessionStartUtc = TimeEngine.localToUtc(local.date, session.opensAt, branch.timezone)
  let sessionEndUtc = TimeEngine.localToUtc(local.date, session.closesAt, branch.timezone)

  // If closing time is before opening time, the session extends to next calendar day
  if (session.closesAt <= session.opensAt) {
    // Add 1 day to the end
    sessionEndUtc = /* sessionStartUtc + 1 day + (closesAt - opensAt) */
  }

  if (instant >= sessionStartUtc && instant < sessionEndUtc) {
    return local.date
  }

  // The instant might belong to the PREVIOUS day's session
  // (e.g., 01:00 on July 13 belongs to July 12's session)
  const previousDate = subtractDays(local.date, 1)
  const prevSession = OperatingHoursEngine.getEffectiveOperatingHours(previousDate, branchId)
  // ... check if instant falls within prevSession
  // ... if yes, return previousDate
}
```

### 5.3 Example

Branch opens 13:00, closes 02:00 (next day). Timezone = Africa/Cairo.

| Calendar Date | Local Time | Belongs to Business Date |
|--------------|------------|--------------------------|
| July 12 | 13:00 | July 12 |
| July 12 | 23:00 | July 12 |
| July 13 | 00:00 | July 12 |
| July 13 | 01:00 | July 12 |
| July 13 | 02:00 | July 13 (next session starts at 13:00 on July 13) |
| July 13 | 13:00 | July 13 |

The hours between 02:00 and 13:00 (when the branch is closed) do not belong to any business day.

---

## 6. DST Support

### 6.1 Spring Forward (gap)

A branch in a DST-observing timezone may have a gap where 02:00 doesn't exist.

**Slot generation behavior:** The SlotGenerator calls `DSTResolver.isInGap()` for each candidate slot. If the slot falls in a gap, it is SKIPPED. The business physically loses that slot for that day.

**Booking creation behavior:** If a user somehow requests a time that falls in a gap, `UtcConverter.localToUtc()` throws `DSTGapError`. The frontend should validate this before submission by calling the Time Engine.

**Example:** At 02:00, clocks jump to 03:00. Slot at 02:00-02:30 doesn't exist. The generator produces slots 01:00-02:00 and 03:00-03:30 instead.

### 6.2 Fall Back (overlap)

The same local hour occurs twice.

**Slot generation behavior:** The SlotGenerator calls `DSTResolver.isInOverlap()` for each candidate slot. If a slot falls in an overlap, TWO slots are generated with the same local time but different UTC instants.

**How to identify the two slots:** They have different `start_at_utc` values and different `utcOffsetMinutes`. The UI shows the offset to the user, or labels them "first" and "second."

**Storage:** Both slots are stored as separate rows in any slot-related structure (though not in `booking_slots` which is per-booking). The availability engine creates two distinct `AvailableSlot` entries.

**Booking:** When a user picks the ambiguous time, they see both options and choose one. The booking records the specific `start_at_utc`.

### 6.3 Government Rules Change

**Existing bookings:** `start_at_utc` is immutable. The booking happens at the same absolute instant. The local time displayed may change under the new rules.

**Future occurrences (recurring):** Use the current timezone rules (the IANA database) at the time of occurrence generation. If the government changes rules before a future occurrence, the new rules apply.

**Implication for cancellation windows:** The cancellation window is `start_at_utc - X hours`. This is always correct regardless of DST rule changes, because it's computed from UTC.

---

## 7. Operating Hours Versioning

### 7.1 Is It Needed?

**Not for structural correctness.** Here's why:

Every booking has `business_date` baked in at creation time. If the branch changes its hours from 13:00-01:00 to 15:00-03:00, the `business_date` on existing bookings does not change. The stored value is the definitive answer.

Versioned operating hours are only needed for:
1. **Past-date reports:** If someone runs "revenue for July 12, 2024" in 2026, the report should use the hours that were in effect on July 12, 2024 to correctly interpret the data.
2. **Past-date availability regeneration:** If the availability engine is asked to regenerate slots for a past date (e.g., for a data audit).

### 7.2 Recommendation

**Defer to Phase 2.** Store operating hours as a snapshot in time only when the business need arises. For Phase 1:
- New bookings store `business_date` at creation — this is the ground truth
- Past reports use the stored `business_date` — not regenerated from hours
- If hours change, the `business_date` on existing bookings is NOT re-evaluated

---

## 8. Booking Creation Flow

```
Frontend sends:
  { businessDate: "2026-07-12",
    startTime: "22:00",
    endTime: "23:00",
    branchId: 3,
    resourceId: 5 }

Backend receives
  │
  ├─ 1. Validate timezone
  │     TimeEngine.validateTimezone(branch.timezone)
  │     → "Africa/Cairo"
  │
  ├─ 2. Convert local to UTC
  │     startAtUtc = TimeEngine.localToUtc("2026-07-12", "22:00", "Africa/Cairo")
  │     → "2026-07-12T19:00:00Z" (assuming UTC+3 summer)
  │
  │     endAtUtc = TimeEngine.localToUtc("2026-07-12", "23:00", "Africa/Cairo")
  │     → "2026-07-12T20:00:00Z"
  │
  ├─ 3. Resolve business date
  │     businessDate = TimeEngine.getBusinessDate(startAtUtc, branchId)
  │     → "2026-07-12"
  │
  ├─ 4. Check availability
  │     TimeEngine.isSlotAvailable(startAtUtc, endAtUtc, resourceId)
  │     → true (or throw conflict error)
  │
  ├─ 5. Check DST validity
  │     TimeEngine.isInGap("2026-07-12", "22:00", "Africa/Cairo")
  │     → false
  │
  │     TimeEngine.isInOverlap("2026-07-12", "22:00", "Africa/Cairo")
  │     → false
  │
  └─ 6. Store
       INSERT INTO bookings (
         start_at_utc, end_at_utc, business_date,
         booking_date, start_time, end_time,
         ...
       )
       VALUES (
         "2026-07-12T19:00:00Z", "2026-07-12T20:00:00Z", "2026-07-12",
         "2026-07-12", "22:00", "23:00",  ← current columns preserved
         ...
       )
```

---

## 9. Slot Display Flow

```
Frontend requests:
  GET /resources/5/slots?businessDate=2026-07-12

Backend
  │
  ├─ 1. Get effective operating hours
  │     TimeEngine.getEffectiveOperatingHours("2026-07-12", branchId)
  │     → { opensAt: "13:00", closesAt: "02:00" }
  │
  ├─ 2. Generate all slots for the business day
  │     TimeEngine.generateSlots("2026-07-12", resourceId, branchId, 60)
  │     → [ { localStart: "13:00", localEnd: "14:00",
  │           startAtUtc: "2026-07-12T10:00:00Z",
  │           businessDate: "2026-07-12", ... },
  │           ...
  │           { localStart: "00:00", localEnd: "01:00",
  │           startAtUtc: "2026-07-12T21:00:00Z",   ← UTC+3
  │           businessDate: "2026-07-12", ... },
  │           { localStart: "01:00", localEnd: "02:00",
  │           startAtUtc: "2026-07-12T22:00:00Z",
  │           businessDate: "2026-07-12", ... }
  │         ]
  │
  ├─ 3. Mark expired
  │     TimeEngine.getAvailableSlots(...)
  │     → marks slots where startAtUtc < TimeEngine.now() as expired
  │     → UTC comparison, not local string comparison
  │
  ├─ 4. Check conflicts against existing bookings
  │     For each slot:
  │       SELECT id FROM bookings
  │       WHERE resource_id = ?
  │         AND start_at_utc < slot.endAtUtc
  │         AND end_at_utc > slot.startAtUtc
  │       → If found, mark as booked
  │
  └─ 5. Return
       [ { localStart: "13:00", localEnd: "14:00",
           status: "available", ... },
         { localStart: "00:00", localEnd: "01:00",
           status: "available", ... },
         { localStart: "01:00", localEnd: "02:00",
           status: "available", ... } ]
```

The entire business day (13:00 to 02:00 next day) appears under one request. No cross-day queries. No dayOffset logic. The slots from 00:00 to 02:00 are correctly identified by `businessDate = July 12` and UTC comparison handles expiry.

---

## 10. Recurring Bookings

### 10.1 Storage (local time)

Recurrence rules are stored in LOCAL TIME + TIMEZONE:

| Field | Value | Reason |
|-------|-------|--------|
| `weekday` | Tuesday | User thinks "every Tuesday" |
| `local_time` | 22:00 | User thinks "at 10 PM" |
| `timezone` | Africa/Cairo | The court operates in local time |
| `first_business_date` | July 1, 2026 | First occurrence |
| `dst_handling` | preserve_local_time | "My class is at 22:00" regardless of DST |

### 10.2 Generation

```typescript
// Simplified
function generateOccurrences(rule, timezone): BookingInstance[] {
  const occurrences = []
  let currentDate = rule.firstBusinessDate

  while (currentDate <= rule.lastBusinessDate) {
    if (getDayOfWeek(currentDate) === rule.weekday) {
      let startUtc = TimeEngine.localToUtc(currentDate, rule.localTime, timezone)

      // Handle DST
      if (TimeEngine.isInGap(currentDate, rule.localTime, timezone)) {
        // Spring-forward: shift to the time just after the gap
        // or skip, depending on configuration
        continue  // or shift
      }

      if (TimeEngine.isInOverlap(currentDate, rule.localTime, timezone)) {
        // Fall-back: pick the first occurrence
        startUtc = TimeEngine.resolveOverlap(currentDate, rule.localTime, timezone, 'first')
      }

      occurrences.push({
        businessDate: currentDate,
        startAtUtc: startUtc,
        endAtUtc: startUtc + slotDuration,
        localStartTime: rule.localTime,
      })
    }
    currentDate = addDays(currentDate, 7 * rule.intervalWeeks)
  }

  return occurrences
}
```

---

## 11. Notifications

### 11.1 Computation

**All reminder times are computed from UTC.**

```
remindAtUtc = start_at_utc - minutesBefore * 60_000
```

This is timezone-independent. A DST change between booking and the booking time does not shift the reminder.

### 11.2 Storage

Notifications store `remind_at_utc` as a TIMESTAMP. The scheduler runs in UTC. The worker picks up due notifications regardless of server timezone.

### 11.3 Display

The frontend converts `remind_at_utc` to the user's device timezone for display.

---

## 12. Pricing

### 12.1 Evaluation

Pricing rules are defined in branch local time.

```
Peak pricing rule: Friday 18:00-23:00 (branch local time)
```

### 12.2 Flow

1. Slot has `start_at_utc` + `business_date` (already computed)
2. Pricing engine calls:
   ```
   localDayOfWeek = TimeEngine.getLocalDayOfWeek(start_at_utc, branch.timezone)
   localTime = TimeEngine.getLocalTime(start_at_utc, branch.timezone)
   ```
3. Check local day-of-week and time against pricing rules
4. Apply price

The pricing engine does NOT use `booking_date` or `start_time` directly — it uses the UTC → local conversion for consistency.

---

## 13. Multi-Region Viewing

### 13.1 Scenario

- Branch: Africa/Cairo (UTC+2/+3)
- Customer: Europe/London (UTC+0/+1)
- Manager: Asia/Dubai (UTC+4)
- Admin: America/Toronto (UTC-5/-4)

### 13.2 Complete Flow

```
Booking stored:
  start_at_utc = "2026-07-12T19:00:00Z"
  business_date = "2026-07-12"
  timezone = "Africa/Cairo"

Each user views the booking:

Customer (London):
  TimeEngine.utcToLocal("2026-07-12T19:00:00Z", "Europe/London")
  → "July 12, 20:00" (UTC+1 summer)
  Display: "July 12, 20:00 (London time)"

Manager (Dubai):
  TimeEngine.utcToLocal("2026-07-12T19:00:00Z", "Asia/Dubai")
  → "July 12, 23:00" (UTC+4)
  Display: "July 12, 23:00 (Dubai time)"

Admin (Toronto):
  TimeEngine.utcToLocal("2026-07-12T19:00:00Z", "America/Toronto")
  → "July 12, 15:00" (UTC-4 summer)
  Display: "July 12, 15:00 (Toronto time)"

Branch Manager (Cairo):
  TimeEngine.utcToLocal("2026-07-12T19:00:00Z", "Africa/Cairo")
  → "July 12, 22:00" (UTC+3 summer)
  Display: "July 12, 22:00 (Cairo time)"

Branch Manager "today's bookings" report:
  TimeEngine.getCurrentBusinessDate(branchId)
  → July 12
  Query: SELECT * FROM bookings WHERE business_date = "2026-07-12" AND branch_id = ?
  → Includes the 00:00-01:00 slot (correct — it belongs to business day July 12)
```

### 13.3 Key Principle

- `business_date` is the SAME for everyone (July 12). It is branch-anchored.
- `start_at_utc` is the SAME for everyone (19:00:00Z). It is universal.
- The displayed local time varies by user. This is correct.

---

## 14. Future Integration Verification

### 14.1 Google Calendar

**Requirement:** UTC timestamps + timezone for event creation.
**Status:** ✅ Supported. `start_at_utc` + `branch.timezone` are all that Google Calendar API needs. For recurring events, the recurrence rule is stored in local time + timezone, which Google Calendar also expects.

### 14.2 Apple Calendar

**Requirement:** iCal format with UTC + timezone.
**Status:** ✅ Supported. Same as Google Calendar. `start_at_utc` provides the VTIMEZONE property. The timezone string provides the VTIMEZONE definition.

### 14.3 Microsoft Outlook / Teams

**Requirement:** UTC timestamps + timezone. Teams meeting creation uses the same.
**Status:** ✅ Supported. Outlook REST API and Graph API accept UTC timestamps with timezone.

### 14.4 Native Mobile (iOS / Android)

**Requirement:** UTC timestamps for cross-platform consistency. The Time Engine concept must be portable.
**Status:** ✅ Supported. The Time Engine is a pure computation module — no platform dependencies. It can be ported to Kotlin (Android) and Swift (iOS) as a shared library. The server API returns UTC timestamps, and each platform converts to the device timezone.

### 14.5 Offline Sync

**Requirement:** Device stores booking locally, syncs later. The booking must be correct after sync even if DST rules changed.
**Status:** ✅ Supported.

**Flow:**
1. Device stores: `{ businessDate: "2026-07-12", startTime: "22:00", branchId: 3 }`
2. Device goes offline
3. DST rules change on the server (IANA database updated)
4. Device comes online
5. Device sends the stored local time + business date + branch ID
6. Server converts: `TimeEngine.localToUtc("2026-07-12", "22:00", branch.timezone)` using CURRENT timezone rules
7. The conversion is correct because the server uses the most recent IANA database — the same rules that will be in effect when the booking occurs

If the device stored UTC instead of local time, the conversion would use the OLD (pre-change) timezone rules and be wrong.

---

## 15. Frontend / UX Recommendations

### 15.1 Phase 1 (no changes)

The existing frontend date picker continues to use browser-local dates. The server-side `apiDate` conversion handles timezone offset correctly. The only known UX issue is cross-timezone label mismatch ("Today" in browser may differ from branch's "today"), but this is cosmetic — the slots returned are correct.

### 15.2 Phase 2 Recommendations

| # | Screen | Recommendation | Priority |
|---|--------|---------------|----------|
| 1 | Branch Settings | Add a "Business Day Preview" that shows the effective operating window. Example: "Opens 13:00 → Closes 02:00 (next day). All slots from 13:00 to 02:00 belong to the same Business Day." | Medium |
| 2 | Booking screen | When displaying 00:00, 01:00 slots, add a small label: "These slots belong to the previous Business Day (e.g., July 12)." Reduces user confusion about why 00:00 appears under a different date. | High |
| 3 | Calendar view | Ensure overnight slots always appear inside the Business Day they belong to. SlotGenerator returns `businessDate` — frontend groups by this field. Verify correct rendering. | High |
| 4 | DST overlap display | When two 02:30 slots exist (fall-back), display both with their UTC offset: "02:30 (+03:00)" and "02:30 (+02:00)". The user picks one. | Low |
| 5 | "Today" button | After branch is selected, the "Today" label should reflect the branch's current Business Day, not the browser's calendar. Requires API: `GET /branches/:id/current-business-day`. Before branch selection, continue using browser timezone. | Medium |

### 15.3 Booking Screen — Phase 2 Wireframe Concept

```
Business Day: July 12
Branch: Cairo Central (Africa/Cairo)
Hours: 13:00 - 02:00 (next day)

Available slots:
  13:00 | 14:00 | 15:00 | ... | 23:00
  ────────────────────────────────────
  00:00 * | 01:00 *     ← continues from July 12
  * These slots belong to Business Day July 12
```

---

## 16. Test Strategy — Time Architecture Validation Suite

A validation suite must be created BEFORE implementation begins. It defines the expected behavior for every edge case. The Time Engine implementation verifies against these scenarios.

Each scenario specifies:
- **Input:** date, time, timezone, branch hours
- **Expected Output:** UTC instant, business date, slot list, availability status

### 16.1 Standard Timezone Scenarios

| # | Scenario | Timezone | Local Date | Local Time | Expected UTC | Expected Business Date |
|---|----------|----------|------------|------------|--------------|----------------------|
| T1 | Egypt summer | Africa/Cairo | July 12 22:00 | 22:00 | July 12 19:00Z (UTC+3) | July 12 |
| T2 | Egypt winter | Africa/Cairo | Jan 12 22:00 | 22:00 | Jan 12 20:00Z (UTC+2) | Jan 12 |
| T3 | London summer | Europe/London | July 12 22:00 | 22:00 | July 12 21:00Z (UTC+1) | July 12 |
| T4 | London winter | Europe/London | Jan 12 22:00 | 22:00 | Jan 12 22:00Z (UTC+0) | Jan 12 |
| T5 | Sydney summer | Australia/Sydney | Dec 12 22:00 | 22:00 | Dec 12 11:00Z (UTC+11) | Dec 12 |
| T6 | Dubai (no DST) | Asia/Dubai | July 12 22:00 | 22:00 | July 12 18:00Z (UTC+4) | July 12 |

### 16.2 Overnight Scenarios

| # | Branch Hours | Business Date | Local Time | Expected UTC | Expected Business Date |
|---|-------------|--------------|------------|--------------|----------------------|
| O1 | 13:00-02:00 | July 12 | 00:00 | July 12 21:00Z (UTC+3) | July 12 |
| O2 | 13:00-02:00 | July 12 | 01:00 | July 12 22:00Z (UTC+3) | July 12 |
| O3 | 13:00-02:00 | July 12 | 13:00 | July 12 10:00Z (UTC+3) | July 12 |
| O4 | 13:00-02:00 | July 12 | 02:00 | **INVALID** — branch is closed at 02:00 | N/A |
| O5 | 22:00-04:00 | July 12 | 22:00 | July 12 19:00Z (UTC+3) | July 12 |
| O6 | 22:00-04:00 | July 12 | 03:00 | July 12 00:00Z (UTC+3) | July 12 |
| O7 | 22:00-04:00 | July 12 | 04:00 | **INVALID** — branch is closed at 04:00 | N/A |
| O8 | 13:00-01:00 | July 12 | 00:00 | July 12 21:00Z (UTC+2 winter) | July 12 |

### 16.3 DST Scenarios (for DST-observing timezones)

| # | Scenario | Local Time | Expected Behavior |
|---|----------|------------|-------------------|
| D1 | Spring-forward gap (02:00 doesn't exist) | 02:30 | `DSTResolver.isInGap()` → true. Slot skipped. |
| D2 | Spring-forward gap — booking creation | 02:30 | `UtcConverter.localToUtc()` throws `DSTGapError`. Frontend must prevent this via API validation. |
| D3 | Fall-back overlap (02:00-02:59 twice) | 02:30 | `DSTResolver.isInOverlap()` → true. Two slots generated with different `start_at_utc`. |
| D4 | Fall-back — pick first occurrence | 02:30 | `resolveOverlap(date, "02:30", tz, "first")` → earlier UTC instant |
| D5 | Fall-back — pick second occurrence | 02:30 | `resolveOverlap(date, "02:30", tz, "second")` → later UTC instant |
| D6 | Government changes DST rules | — | Existing `start_at_utc` remains unchanged. Future occurrences use new rules. |

### 16.4 Business Day Scenarios

| # | Branch Hours | Current UTC | Expected getCurrentBusinessDate |
|---|-------------|-------------|-------------------------------|
| B1 | 13:00-02:00 | July 12 10:00Z (13:00 local) | July 12 |
| B2 | 13:00-02:00 | July 12 23:00Z (02:00 local next day) | July 12 (session still active) |
| B3 | 13:00-02:00 | July 13 10:00Z (13:00 local) | July 13 (new session started) |
| B4 | Closed (holiday) | July 12 15:00Z | **NO Business Day** — OperatingHoursEngine returns isClosed=true |

### 16.5 Availability Scenarios

| # | Slots Generated | Current UTC | Expected |
|---|----------------|-------------|----------|
| A1 | 13:00-14:00 (startAtUtc: July 12 10:00Z) | July 11 23:00Z | Available (future) |
| A2 | 13:00-14:00 (startAtUtc: July 12 10:00Z) | July 12 10:30Z | Expired (past) |
| A3 | 00:00-01:00 (startAtUtc: July 12 21:00Z) | July 12 20:00Z | Available (future) |
| A4 | 00:00-01:00 (startAtUtc: July 12 21:00Z) | July 12 22:00Z | Expired (past) |

### 16.6 Recurrence Scenarios

| # | Rule | Expected Occurrences |
|---|------|---------------------|
| R1 | Every Tuesday 22:00, Africa/Cairo, July 1 - Aug 31 | 9 occurrences (every Tuesday) |
| R2 | Same rule, DST spring-forward on March 26 | Occurrence on March 26 uses UTC+3 after transition |
| R3 | Same rule, DST fall-back on October 29 | Occurrence on October 29 picks first 02:30 |

### 16.7 Calendar Integration Scenarios

| # | Target | Expected Format |
|---|--------|----------------|
| C1 | Google Calendar API | `start: { dateTime: "2026-07-12T19:00:00Z", timeZone: "Africa/Cairo" }` |
| C2 | Apple iCal | `DTSTART;TZID=Africa/Cairo:20260712T220000` |
| C3 | Outlook REST | `"Start": { "DateTime": "2026-07-12T19:00:00", "TimeZone": "Africa/Cairo" }` |

### 16.8 Offline Sync Scenarios

| # | Device Stored | DST Rule Change | Expected After Sync |
|---|--------------|-----------------|---------------------|
| S1 | `{ businessDate: July 12, localTime: "22:00", branchId: 3 }` | None | startAtUtc = July 12 19:00Z |
| S2 | Same | Government changes UTC+3 → UTC+4 | startAtUtc = July 12 18:00Z (re-converted using new rules) |

---

## 17. Architecture Decision Records (ADR)

The following ADRs should be created before implementation begins. Each documents a decision, its rationale, and rejected alternatives.

| ADR | Title | Key Content |
|-----|-------|-------------|
| ADR-001 | **UTC as the absolute source of truth** | Why UTC is stored. Why local time alone is insufficient. Rejected alternative: storing only local time + timezone. |
| ADR-002 | **Business Day definition (OPENING_BASED)** | Why Business Day starts at branch opening, not midnight. Why configurable strategy was rejected. |
| ADR-003 | **Time Engine as sole time entry point** | Why raw `new Date()` is banned. Why all time logic must route through one module. Enforcement via ESLint. |
| ADR-004 | **Branch model as Operating Hours Engine** | Why no new entity was created. How the existing Branch model naturally evolves. Overrides deferred to Phase 2. |
| ADR-005 | **DST Strategy** | How DST is handled — gap detection, overlap resolution, government rule changes. Why auto-select was rejected in favor of explicit edge case UX. |
| ADR-006 | **Booking Time Model** *(created during Phase 1)* | Schema design — why `start_at_utc`/`end_at_utc`/`business_date` are mandatory. Why `booking_date`/`start_time`/`end_time` remain stored permanently. |
| ADR-007 | **API Time Contract** *(created during Phase 1)* | Stable API time contract. Input/output fields that must remain stable for mobile apps and calendar integrations. |

---

## 18. Clock Abstraction

`TimeEngine.now()` must never directly call system time. This enables deterministic testing.

```typescript
interface Clock {
  now(): UtcInstant
}

class SystemClock implements Clock {
  now(): UtcInstant {
    // THE ONLY new Date() call in the entire codebase
    return new Date().toISOString()
  }
}

class FakeClock implements Clock {
  constructor(private fixedInstant: Date) {}
  now(): UtcInstant {
    return this.fixedInstant.toISOString()
  }
}
```

The `TimeEngine` receives a `Clock` via dependency injection:

```typescript
class TimeEngine {
  constructor(private clock: Clock) {}

  now(): UtcInstant {
    return this.clock.now()
  }

  // All other methods use this.now() internally
}
```

**Production:** `new TimeEngine(new SystemClock())`  
**Tests:** `new TimeEngine(new FakeClock(new Date("2026-07-12T19:00:00Z")))`

---

## 19. SQL Functions Rule

### 19.1 Safe vs Unsafe

| Column type | Stored as | SQL functions allowed? | Example |
|-------------|-----------|----------------------|---------|
| `TIMESTAMP` | UTC | ✅ `NOW()`, `CURRENT_TIMESTAMP`, `DATE_ADD` | `expires_at > NOW()` |
| `DATE` or `TIME` | Branch-local time | ❌ NEVER | `booking_date >= CURDATE()` — must use TimeEngine |

### 19.2 Rule

SQL time functions (`NOW()`, `CURDATE()`, `CURRENT_DATE`, `CURRENT_TIMESTAMP`, `DATE_ADD`, `DATE_SUB`) are allowed ONLY when comparing against a `TIMESTAMP` column stored in UTC.

They are FORBIDDEN when comparing against `DATE` or `TIME` columns that contain branch-local values, because the SQL server runs in UTC and the values are in branch-local time.

### 19.3 Current Violations (Phase 2)

| Location | Violation | Fix |
|----------|-----------|-----|
| `booking.repository.ts:538` | `b.booking_date >= CURDATE()` | Use `TimeEngine.getCurrentBusinessDate(branchId)` |
| `booking-auto-complete.worker.ts:13` | `CONCAT(booking_date,' ',start_time) < NOW()` | Use `b.start_at_utc < NOW()` |
| `booking.repository.ts:568/575` | `CURDATE()` for age calculation | Use server-side UTC date (acceptable for age — it's approximate) |

---

## 20. API Time Contract

### 20.1 Request Contract (unchanged from current)

Frontend sends:

```json
{
  "branchId": 123,
  "businessDate": "2026-07-12",
  "startTime": "22:00",
  "endTime": "23:00"
}
```

Backend is the authority for timezone conversion. The frontend does NOT send UTC. The frontend does NOT send the timezone (server uses the branch's stored timezone).

### 20.2 Response Contract (stable for mobile/calendar)

All booking responses consistently expose:

```json
{
  "id": 456,
  "businessDate": "2026-07-12",
  "timezone": "Africa/Cairo",
  "localStart": "22:00",
  "localEnd": "23:00",
  "startAtUtc": "2026-07-12T19:00:00Z",
  "endAtUtc": "2026-07-12T20:00:00Z",
  "status": "confirmed"
}
```

These 7 fields form the **Time Contract**. They must remain stable across all versions. New fields can be added but existing fields must never be removed or renamed. This ensures forward compatibility with:
- Native mobile apps (iOS, Android)
- Google Calendar integration
- Apple Calendar integration
- Outlook / Teams integration
- Offline sync clients

### 20.3 Slot Response Contract

```json
{
  "slots": [
    {
      "localStart": "00:00",
      "localEnd": "01:00",
      "startAtUtc": "2026-07-12T21:00:00Z",
      "endAtUtc": "2026-07-12T22:00:00Z",
      "businessDate": "2026-07-12",
      "utcOffsetMinutes": 180,
      "status": "available"
    }
  ]
}
```

The `businessDate` field in the slot response tells the frontend which Business Day each slot belongs to. Overnight slots show `businessDate = July 12` even though the local time is `00:00` (July 13 calendar). This is how the frontend groups slots correctly.

---

## 21. Logging

Debug-mode only. Never log time conversions in production.

### 21.1 Log Format

```
[TIME] [DEBUG] Conversion
  Branch: Cairo Central (id=3)
  Timezone: Africa/Cairo
  BusinessDate: 2026-07-12
  LocalTime: 22:00
  UTC: 2026-07-12T19:00:00Z
  Offset: +180 min
  Resolver: UtcConverter.localToUtc
```

### 21.2 Rules

- Log level must be configurable (default: `info`, `TimeEngine` uses `debug`)
- Never log PII (user names, emails, phone numbers)
- Never log in performance-critical paths (slot generation, availability checks)
- Include resolver name for traceability

---

## 22. Environment Dependencies

The Time Engine relies on the following runtime environment guarantees:

| Dependency | Requirement | Risk if missing |
|------------|-------------|----------------|
| Node.js ICU data | Full ICU (not `small-icu` or `minimal-icu`) | `Intl.DateTimeFormat` produces wrong results for non-system timezones |
| OS timezone database | Installed and regularly updated (`apt install tzdata`) | DST transitions are wrong; IANA timezone validation fails for newly added zones |
| MySQL timezone tables | Loaded if `CONVERT_TZ` is used (not required for Phase 1) | `CONVERT_TZ` returns NULL |
| ESLint plugin | `no-restricted-syntax` rule banning `new Date()` etc. | New code introduces timezone bugs |

**Docker image guidance:** Use `node:XX-bookworm-slim` (not `alpine` without ICU). Ensure `tzdata` package is installed. The startup-validator should verify ICU availability.

---

## 23. Documentation

### 23.1 Developer Guide

Create `docs/time-cheat-sheet.md` (one page maximum).

Content:
- **Rule 1:** All time logic goes through `TimeEngine`. Never call `new Date()` directly.
- **Rule 2:** UTC is the source of truth. `start_at_utc`/`end_at_utc` are immutable.
- **Rule 3:** Business Day starts at branch opening, not midnight.
- **Rule 4:** SQL `NOW()`/`CURDATE()` are safe only for TIMESTAMP columns.
- **Rule 5:** Frontend sends local time + business date. Backend converts to UTC.
- **Rule 6:** If you need "now" in a test, use `FakeClock`. Never mock `Date`.
- Common mistakes to avoid.
- Where to find the ADRs.

---

## 24. Implementation Roadmap

### Phase 1: Foundation (immediate — 2–3 weeks)

**Goal:** Create the Time Engine. Add UTC timestamps + business_date to bookings. Fix slot expiry to use UTC.

**No new database tables. No removal of existing columns. The Branch model IS the Operating Hours Engine.**

| Task | Why Phase 1 |
|------|-------------|
| **Create ADR-001 through ADR-005** | Document all architectural decisions before implementation begins. Prevents future ambiguity. |
| **Create Time Architecture Validation Suite** | Define all test scenarios (sections 16.1-16.8). Implementation must pass these. |
| Create Time Engine module | Foundation for everything. Every Phase 2 task depends on it. |
| Implement `UtcConverter`, `TimezoneResolver` | Core conversion logic needed immediately. |
| Implement `OperatingHoursEngine` (Branch defaults only) | No new tables. Reads existing Branch `opening_time` / `closing_time`. |
| Implement `BusinessDayResolver` | Required for correct slot display and reporting. |
| Implement `DSTResolver` (core detection) | `isInGap()`, `isInOverlap()` needed even in Phase 1 for validation. Fall-back/spring-forward handling is Phase 2. |
| Implement `SlotGenerator` (basic + DST gap/overlap detection) | Replaces current logic. Produces UTC timestamps. DST gap causes skip; DST overlap causes two slots. |
| Implement `AvailabilityEngine` | Expiry uses UTC comparison (`start_at_utc < TimeEngine.now()`). Eliminates timezone-based expiry bugs. |
| Add `start_at_utc`, `end_at_utc`, `business_date` to `bookings` | Mandatory columns. Backfill now avoids larger migration later. |
| Add same columns to `booking_intents` | Intents become bookings — must carry UTC from creation. |
| Add indexes on `bookings(start_at_utc)` and `bookings(business_date)` | Performance for UTC range queries and business-day grouping. |
| Backfill existing rows | Historical data must be queryable by UTC. Deterministic formula used. |
| Update `getResourceSlots` | Use new SlotGenerator + AvailabilityEngine. Return `start_at_utc` in response. |
| Update `createBooking` | Compute and store UTC + business_date at creation. |
| Add ESLint rule banning `new Date()` outside Time Engine | Enforce the architecture from day one. New code must comply. Existing code is grandfathered until Phase 2. |

### Phase 2: Enhancement (within 3 months)

**Goal:** Fix all existing naive Date constructions. Add recurrence. Add operating hours overrides.

| Task | Why Phase 2 |
|------|-------------|
| Fix all 15+ naive `new Date(...)` constructions | Real bugs affecting cancellation windows, notifications, auto-complete. They read existing data (unchanged) but compute incorrectly for non-UTC branches. |
| Implement full DST generation | Spring-forward: skip non-existent slots. Fall-back: generate two slots with different `start_at_utc`. Both already detected in Phase 1 — this phase handles the full generation logic. |
| Add `branch_hours_overrides` table | Needed as soon as any branch changes its operating hours for a specific day. |
| Update `OperatingHoursEngine` to read overrides | Branch model evolves naturally — overrides extend default hours. |
| Fix `pricing-engine.ts` to use booking's day-of-week | Currently uses `new Date().getDay()` (server day). Must use `TimeEngine.getLocalDayOfWeek(start_at_utc, branch.tz)`. |
| Implement `RecurringEngine` | Recurrence rule table + occurrence generation with DST handling. |
| Frontend: Business Day label for overnight slots | Show "00:00 * belongs to previous Business Day" on booking screen. |
| Frontend: "Today" button uses branch Business Day | `GET /branches/:id/current-business-day` API. Only after branch is selected. |
| Fix `booking-auto-complete.worker.ts` | `CONCAT(booking_date, ' ', start_time) < NOW()` must become `start_at_utc < NOW()`. |

### Phase 3: Expansion (6–18 months)

**Goal:** Multi-region display. Calendar integration. Offline sync.

| Task | Why Phase 3 |
|------|-------------|
| Multi-region display in frontend | Convert `start_at_utc` to user's timezone for display. API already returns UTC. |
| Google Calendar integration | API accepts UTC + timezone. Requires Phase 1 UTC columns. |
| Apple Calendar / Outlook / Teams integration | Same UTC requirement. |
| Native mobile (iOS / Android) | Port Time Engine as shared library. API already returns UTC. |
| Offline sync architecture | Device stores local time + timezone. Server re-converts on sync using current IANA rules. |
| Frontend: Branch Settings Business Day preview | Show effective operating window and overnight behavior. |
| Frontend: DST overlap display | Show both 02:30 slots with UTC offset labels. |

### Phase 4: Optimization (as needed)

**Goal:** Performance improvements based on measured data.

| Task | Why Deferred |
|------|-------------|
| `booking_slots` UTC timestamps | User confirmed — defer until performance measurement shows need. Availability queries use `bookings.start_at_utc` directly. |
| Dedicated availability projection | User confirmed — defer until `bookings` query becomes a bottleneck. |
| Generated columns for local time | Only if `CONVERT_TZ` on every read becomes a bottleneck. |
| Versioned operating hours table | Only if historical report accuracy is audited and existing stored `business_date` is insufficient. |
| Remove legacy columns (booking_date, start_time, end_time) | Only when all legacy code is migrated. Possibly never — they cost nothing to keep and provide backward compatibility. |

### Phase Dependency Graph

```
Phase 1 ───────────────────────────────────────┐
  ├─ Time Engine (core)                        │
  ├─ Database columns (UTC + business_date)    │
  ├─ Updated createBooking / getResourceSlots  │
  ├─ ADRs + Validation Suite                   │
  └─ ESLint rule                               │
                                               │
Phase 2 ◄──────────────────────────────────────┘
  ├─ Fix naive Date constructions              │
  ├─ DST full implementation                   │
  ├─ RecurringEngine                           │
  ├─ Override table                            │
  └─ Frontend UX improvements                  │
                                               │
Phase 3 ◄──────────────────────────────────────┘
  ├─ Calendar integration                      │
  ├─ Multi-region display                      │
  ├─ Native mobile                             │
  └─ Offline sync                              │
                                               │
Phase 4 ◄──────────────────────────────────────┘
  └─ Performance optimization (as needed)
```

---

## 25. Forbidden Assumptions — Final List

These must NEVER appear in the codebase:

1. A timezone has a fixed UTC offset.
2. A timezone abbreviation is globally unique ("CST" = 5 timezones).
3. The server's timezone equals any branch timezone.
4. The user's device timezone equals the branch timezone.
5. DST starts on the same date every year.
6. DST starts at midnight.
7. All timezones observe DST.
8. DST offset is always 1 hour.
9. A day has exactly 86,400 seconds.
10. A local time occurs exactly once per day.
11. A local time always exists.
12. A year has 365 days.
13. A business day starts at midnight.
14. `CURDATE()` returns the branch's local date.
15. `NOW()` returns branch-local time.
16. `new Date("2026-07-12T22:00")` is safe (it's parsed as local time).
17. `date.getHours()` returns branch-local hours.
18. `toISOString()` returns a local date (it returns UTC).
19. The IANA timezone database is static.
20. A branch is open every day.
21. Opening hours never change.
22. A business day maps to a single calendar date.
23. A timestamp without timezone is meaningful.

---

## 26. Final Declaration

### Status

```
CourtZon Time Architecture v1.0

STATUS:

APPROVED

ARCHITECTURE FROZEN

READY FOR IMPLEMENTATION
```

No future architectural changes should be made without a formal ADR and Architecture Impact Analysis. From this point onward, stop improving the architecture — start implementing. Whenever implementation reveals a problem, fix the implementation, not the architecture, unless the issue fundamentally invalidates the design.

### What This Architecture Achieves

| Requirement | Status |
|-------------|--------|
| Enterprise SaaS | ✅ |
| Multi-tenant | ✅ (existing domain model preserved) |
| Multi-country | ✅ (IANA timezones only) |
| Multi-timezone | ✅ (UTC source of truth) |
| DST support | ✅ (gap, overlap, government changes) |
| Overnight operating hours | ✅ (Business Day concept) |
| Google Calendar | ✅ (UTC + timezone in API response) |
| Apple Calendar | ✅ (same UTC + timezone pattern) |
| Microsoft Outlook / Teams | ✅ (same UTC + timezone pattern) |
| Native iOS / Android | ✅ (Time Engine portable; stable API Contract) |
| Offline synchronization | ✅ (device stores local time + timezone; server re-converts) |
| Reporting accuracy | ✅ (Business Date grouping for overnight branches) |
| No future time architecture migration | ✅ (design supports all known scenarios without breaking changes) |

### Architecture Governance

Any future change to Time Architecture requires:

1. **Architecture Decision Record (ADR)** — documents the proposed change
2. **Architecture Impact Analysis** — evaluates impact across all consuming modules
3. **Technical approval** — from the architecture owner or CTO

Only after these steps may implementation begin.

TimeEngine is a **protected subsystem**. Changes to TimeEngine require mandatory code review by at least one engineer who was involved in the architecture design.

### Guiding Principles for Future Changes

1. **Every time operation goes through TimeEngine.** If you need to call `new Date()`, you're doing it wrong.
2. **UTC is immutable.** Once stored, `start_at_utc` and `end_at_utc` never change.
3. **Business Day is not Calendar Date.** The OperatingHoursEngine is the authority.
4. **IANA timezones only.** Never assume UTC offsets.
5. **Frontend sends local time.** Backend converts. Never trust the client for UTC.
6. **SQL NOW()/CURDATE() are safe only for TIMESTAMP columns.**
7. **ADR changes require Architecture Impact Analysis.** No silent architecture drift.

### Code Ownership

- TimeEngine is a **protected subsystem**
- Changes require **mandatory code review**
- TimeEngine must never depend on Booking, Branch, Repositories, Database, HTTP, or UI
- It is a **domain service** — stateless, deterministic, dependency injected, fully testable

---

## 27. Observability

### 27.1 Metrics

TimeEngine should expose the following Prometheus metrics:

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `time_conversion_total` | Counter | `resolver`, `status` | Total timezone conversions performed |
| `business_day_resolution_total` | Counter | `status` | Total Business Day lookups |
| `dst_overlap_total` | Counter | `timezone` | Number of fall-back overlap occurrences detected |
| `dst_gap_total` | Counter | `timezone` | Number of spring-forward gap occurrences detected |
| `time_conversion_errors_total` | Counter | `resolver`, `error_type` | Time conversion failures (invalid timezone, gap, etc.) |

These metrics help detect hidden production problems:
- A spike in `dst_overlap_total` confirms the DST resolver is working correctly during fall-back
- A spike in `time_conversion_errors_total` with `error_type=invalid_timezone` indicates a branch configuration error
- `time_conversion_total` helps track the load on the Time Engine

### 27.2 Golden Scenarios

Every future bug involving time becomes a permanent Golden Scenario added to the Test Validation Suite. No regression is ever accepted twice. When a time-related bug is fixed:
1. The root cause is identified
2. A new test scenario is added to the validation suite
3. The existing validation suite is re-run against all scenarios

---

## 28. Startup Validation

The application startup-validator must verify the following before accepting traffic:

| Check | What it verifies | Failure behavior |
|-------|-----------------|------------------|
| ICU data | `Intl.DateTimeFormat` can format dates for at least 5 test timezones (Africa/Cairo, Europe/London, Asia/Dubai, America/New_York, Asia/Tokyo) | Hard fail — server crashes with clear error message |
| IANA timezone database | `Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Cairo' })` returns a valid date string | Hard fail — `tzdata` package not installed |
| TimezoneResolver | `TimezoneResolver.validate()` works for the project's known timezones | Hard fail |
| Clock implementation | `SystemClock.now()` returns a valid ISO 8601 UTC string | Hard fail |
| Environment compatibility | Node.js version, ICU version, platform | Logged as warning but does not block startup |

The server must **fail fast** if the runtime cannot safely execute TimeEngine. A silent fallback to incorrect time calculations is never acceptable.

---

## 29. Open Questions (for future operational decisions)

These are NOT architecture decisions. They are operational choices that can be made during implementation without changing the architecture.

1. **DST overlap display:** When a fall-back creates two identical slots, the system shows a simple UX: "02:30 (1st)" and "02:30 (2nd)". This UI appears ONLY when the overlap actually occurs. The exact wording is an implementation detail, not an architecture decision.

2. **DST gap behavior:** When a spring-forward eliminates a slot, the system skips it. The hour literally doesn't exist. No pricing adjustment needed — the business loses one slot of revenue that day. Implementation should log when this occurs for operational awareness.

3. **Historical hours backfill:** For existing bookings with overnight hours, use the deterministic formula: if the branch has overnight hours (closing < opening) AND `start_time < opening_time`, then `business_date = booking_date - 1`. Otherwise `business_date = booking_date`. Accept minor inaccuracies for very old data where operating hours have changed.

4. **Legacy column retirement:** `booking_date` / `start_time` / `end_time` remain stored permanently. They are never removed.

5. **Testing time-dependent code:** Use `FakeClock` for all TimeEngine tests. No `jest.useFakeTimers()` needed. No real time waits in test suites.
