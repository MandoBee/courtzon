// ============================================================================
// CourtZon Time Engine — Core Types
// ============================================================================
// This module is the authoritative source for all time-related type definitions.
// No other module should redefine these types.

export type UtcInstant = string        // ISO 8601: "2026-07-12T19:00:00.000Z"
export type LocalDate = string         // "2026-07-12"
export type LocalTime = string         // "22:00"
export type BusinessDate = string      // "2026-07-12" (business day, not calendar day)
export type IANATimezone = string      // "Africa/Cairo"

export type SlotStatus = 'available' | 'booked' | 'expired' | 'selected'
export type DSTTransitionType = 'spring_forward' | 'fall_back'
export type DSTResolution = 'first' | 'second' | 'skip'
export type DSTHandling = 'preserve_local_time' | 'preserve_utc_offset'

// ── DST ──

export interface DSTTransition {
  type: DSTTransitionType
  localDate: LocalDate
  localTime: LocalTime
  gapStartUtc: UtcInstant
  gapEndUtc: UtcInstant
  beforeOffsetMinutes: number
  afterOffsetMinutes: number
}

export interface AmbiguousPair {
  first: UtcInstant
  second: UtcInstant
}

// ── Operating Hours ──

export interface OperatingSession {
  opensAt: LocalTime
  closesAt: LocalTime
  isClosed: boolean
}

// ── Slots ──

export interface TimeSlot {
  localStartTime: LocalTime
  localEndTime: LocalTime
  startAtUtc: UtcInstant
  endAtUtc: UtcInstant
  businessDate: BusinessDate
  utcOffsetMinutes: number
  dstOverlap?: 'first' | 'second'  // only set when a fall-back overlap produces two slots
}

/** Canonical booking conflict shape consumed by TimeEngine availability checks. */
export interface BookingConflict {
  startAtUtc: UtcInstant
  endAtUtc: UtcInstant
}

export interface AvailableSlot extends TimeSlot {
  status: SlotStatus
}

// ── Booking Instance (recurrence output) ──

export interface BookingInstance {
  businessDate: BusinessDate
  startAtUtc: UtcInstant
  endAtUtc: UtcInstant
  localStartTime: LocalTime
  localEndTime: LocalTime
}

// ── Recurrence ──

export interface RecurrenceRule {
  branchId: number
  resourceId: number
  weekday: number               // 1=Mon .. 7=Sun
  localTime: LocalTime
  timezone: IANATimezone
  firstBusinessDate: BusinessDate
  lastBusinessDate: BusinessDate | null
  intervalWeeks: number
  dstHandling: DSTHandling
}

// ── R2 — Weekly recurring series (canonical recurring booking core) ──
// Calendar-date based in the BRANCH timezone. Multiple weekdays supported.
// Occurrence UTC instants are derived with TimeEngine.localToUtc (DST-aware
// convergence), so a series crossing a DST transition preserves the intended
// LOCAL start/end time.

export interface WeeklyRecurrenceRule {
  /** Branch-local first calendar date, inclusive (YYYY-MM-DD). */
  startDate: LocalDate
  /** Branch-local last calendar date, inclusive (YYYY-MM-DD). */
  endDate: LocalDate
  /** Weekday numbers to include: 1=Mon .. 7=Sun. At least one required. */
  weekdays: number[]
  /** Branch-local start time (HH:mm). */
  startTime: LocalTime
  /** Branch-local end time (HH:mm; may be <= startTime for an overnight slot). */
  endTime: LocalTime
  /** Branch IANA timezone. */
  timezone: IANATimezone
}

export interface WeeklyRecurrenceOccurrence {
  /** Branch-local booking calendar date (YYYY-MM-DD). */
  date: LocalDate
  /** 1=Mon .. 7=Sun. */
  weekday: number
  /** Branch-local start time. */
  startTime: LocalTime
  /** Branch-local end time. */
  endTime: LocalTime
  /** Calendar date the local END time falls on (next day for overnight slots). */
  endDate: LocalDate
  /** UTC instant of the local start (DST-resolved). */
  startAtUtc: UtcInstant
  /** UTC instant of the local end (DST-resolved). */
  endAtUtc: UtcInstant
  /** Deterministic occurrence identity within the series: `${date}`. */
  occurrenceKey: string
}

// ── Reminders ──

export interface ScheduledReminder {
  remindAtUtc: UtcInstant
  type: string
}

export interface ReminderConfig {
  minutesBefore: number
  type: string
}

// ── Ranges ──

export interface UtcRange {
  fromUtc: UtcInstant
  toUtc: UtcInstant
}

// ── Resolution result ──

export interface ResolutionResult {
  utcInstant: UtcInstant
  offsetMinutes: number
  localDate: LocalDate
  localTime: LocalTime
}
