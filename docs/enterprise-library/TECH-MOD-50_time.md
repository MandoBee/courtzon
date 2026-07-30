---
document_id: "TECH-MOD-50"
document_name: "Time Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-04"]
  related: ["TECH-MOD-03", "TECH-MOD-19"]
---

# Time Module (TECH-MOD-50)

**Source:** `backend/src/modules/time/` (13 entries, no subdirectories — flat barrel structure)

## 1. Purpose

The **TimeEngine** (`time-engine.ts`) is the single public entry point for ALL time-related operations in the platform. Business modules must never access individual resolver modules directly — they must go through this facade. Consists of 7 sub-modules.

## 2. Architecture

```
time-engine.ts            ← Facade (public API)
├── timezone-resolver.ts  → IANA timezone validation, UTC offset, DST transitions
├── utc-converter.ts      → Local ↔ UTC conversion
├── operating-hours-engine.ts → Effective hours, open/close checks
├── business-day-resolver.ts  → Business date derivation, range calculation
├── slot-generator.ts     → Time slot generation from operating hours
├── availability-time-service.ts → Expired slot marking, booking conflict merge
├── clock.ts              → SystemClock / FakeClock (DI for testing)
├── types.ts              → Shared type definitions
└── errors.ts             → Domain error classes
```

**Evidence:** Source at `time-engine.ts:1-236`, `index.ts:1-24`.

## 3. Public API (TimeEngine facade)

### TimezoneResolver
| Method | Purpose |
|--------|---------|
| `validateTimezone(tz)` | Validates IANA timezone string |
| `getUtcOffsetMinutes(instant, tz)` | UTC offset at given instant |
| `getNextDSTTransition(afterInstant, tz)` | Next DST change |
| `getAllDSTTransitionsForYear(year, tz)` | All DST transitions in a year |
| `isInGap(date, time, tz)` | Spring-forward gap check |
| `isInOverlap(date, time, tz)` | Fall-back overlap check |
| `resolveOverlap(date, time, tz, preference)` | Resolve ambiguous time |
| `resolveGap(date, time, tz)` | Attempt gap resolution |

### UTC Converter
| Method | Purpose |
|--------|---------|
| `localToUtc(date, time, tz)` | Local → UTC conversion |
| `utcToLocal(instant, tz)` | UTC → local date+time |
| `utcToLocalDate(instant, tz)` | UTC → local date only |
| `utcToLocalTime(instant, tz)` | UTC → local time only |
| `getOffsetAtLocalTime(date, time, tz)` | Offset at local time |

### Operating Hours Engine
| Method | Purpose |
|--------|---------|
| `getEffectiveOperatingHours(businessDate, open, close)` | Effective hours for a date |
| `isOpenOn(businessDate, open, close)` | Check if open on date |
| `isOvernightSession(opensAt, closesAt)` | Detect overnight hours |

### Business Day Resolver
| Method | Purpose |
|--------|---------|
| `getBusinessDate(instant, open, close, tz)` | Derive business date from UTC |
| `getBusinessDayRange(businessDate, open, close, tz)` | UTC range for a business day |
| `getCurrentBusinessDate(open, close, tz)` | Current business date |

### Slot Generator
| Method | Purpose |
|--------|---------|
| `generateSlots(businessDate, open, close, durationMin, tz)` | Generate time slots |

### Availability Time Service
| Method | Purpose |
|--------|---------|
| `markExpiredSlots(slots, nowUtc?)` | Mark past slots as expired |
| `mergeBookingConflicts(slots, existingBookings)` | Merge booking conflicts |
| `resolveAvailability(slots, bookings, nowUtc?)` | Full availability resolution |
| `isSlotAvailable(startUtc, endUtc, bookings)` | Single slot check |

### Phase 2 Stubs
| Method | Purpose |
|--------|---------|
| `generateOccurrences(rule)` | Recurring engine (stub) |
| `computeReminderUtc(startUtc, minutesBefore)` | Reminder time calculation |
| `computeAllReminders(startUtc, config)` | Multiple reminder calculation |
| `getLocalDayOfWeek(instant, tz)` | Local day-of-week (PricingTimeLayer) |
| `getLocalTime(instant, tz)` | Local time (PricingTimeLayer) |
| `getBusinessDateRange(from, to, open, close, tz)` | Business date range (ReportingTimeLayer) |

## 4. Domain Errors

| Error | Description |
|-------|-------------|
| `TimezoneError` | Invalid timezone |
| `DSTGapError` | Time falls in spring-forward gap |
| `AmbiguousTimeError` | Time falls in fall-back overlap (includes both UTC instants) |
| `InvalidSlotError` | Invalid time slot parameters |

## 5. Key Concepts

- **Clock Abstraction:** `SystemClock` for production, `FakeClock` for testing — enables deterministic time in tests
- **DST Safety:** All DST edge cases handled (gaps, overlaps, ambiguous times)
- **Business Date:** The derived operating date for a facility, which may differ from calendar date for overnight sessions
- **Slot Generation:** Generates discrete time slots from operating hours with configurable duration
- **Availability Resolution:** Combines slot generation, expiry marking, and booking conflict merging into a single pipeline
