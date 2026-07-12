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
