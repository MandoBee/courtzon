import type { LocalDate, LocalTime, OperatingSession, BusinessDate } from './types.js'

// ── Operating Hours Engine ──
// Determines the effective operating window for a given Business Date.
//
// Phase 1: Returns branch defaults directly.
// Phase 2+: Checks holiday overrides, modified hours, special events.
//
// This is a pure computation function. No database access.

export function getEffectiveOperatingHours(
  _businessDate: BusinessDate,
  defaultOpeningHours: LocalTime,
  defaultClosingHours: LocalTime,
): OperatingSession {
  // Phase 1: Use defaults directly
  // Phase 2+: Check branch_hours_overrides table, holiday calendar, etc.

  return {
    opensAt: defaultOpeningHours,
    closesAt: defaultClosingHours,
    isClosed: false,
  }
}

// ── Holiday/override check ──
// Phase 2 will expand this to check a holiday/override store.

export function isOpenOn(
  businessDate: BusinessDate,
  _defaultOpeningHours: LocalTime,
  _defaultClosingHours: LocalTime,
): boolean {
  // Phase 1: Always open
  // Phase 2+: Check if businessDate has a holiday override or is closed

  return true
}

// ── Check if operating hours represent an overnight schedule ──

export function isOvernightSession(opensAt: LocalTime, closesAt: LocalTime): boolean {
  // An overnight session has closing time before or equal to opening time
  // (e.g., 13:00 → 01:00, or 22:00 → 02:00)
  return closesAt <= opensAt
}
