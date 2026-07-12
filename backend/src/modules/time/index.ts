// ============================================================================
// CourtZon Time Engine — Public API
// ============================================================================
// Business modules must import from this barrel file only.
// Direct imports to individual resolver modules are FORBIDDEN.

export { TimeEngine } from './time-engine.js'
export type { Clock } from './clock.js'
export { SystemClock, FakeClock } from './clock.js'

// Re-export types for convenience (consumers need these)
export type {
  UtcInstant, LocalDate, LocalTime, BusinessDate, IANATimezone,
  TimeSlot, AvailableSlot, SlotStatus,
  DSTTransition, DSTTransitionType, DSTResolution, DSTHandling, AmbiguousPair,
  OperatingSession,
  RecurrenceRule, BookingInstance,
  ScheduledReminder, ReminderConfig,
  UtcRange,
} from './types.js'

export {
  TimezoneError, DSTGapError, AmbiguousTimeError, InvalidSlotError,
} from './errors.js'
