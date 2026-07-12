import type { BusinessDate, IANATimezone, LocalDate, LocalTime, UtcInstant, UtcRange } from './types.js'
import { utcToLocal, localToUtc } from './utc-converter.js'
import { isOvernightSession } from './operating-hours-engine.js'

// ── Business Day Resolver ──
// Determines which Business Day a given UTC instant belongs to.
// A Business Day starts when the branch opens and ends when it closes
// (possibly crossing midnight).

// ── Get the Business Date for a given UTC instant ──
// Returns the Business Date string (YYYY-MM-DD) that this instant belongs to.

export function getBusinessDate(
  instant: UtcInstant,
  openingHours: LocalTime,
  closingHours: LocalTime,
  timezone: IANATimezone,
): BusinessDate {
  const local = utcToLocal(instant, timezone)
  const localDate = local.date
  const localTime = local.time

  // Check if the instant falls within the operating session that STARTED on localDate
  // Session time range: localDate + opensAt → localDate + closesAt (possibly next day)
  if (!isOvernightSession(openingHours, closingHours)) {
    // Normal (non-overnight) session: opens and closes on the same calendar day
    // Business Date = local calendar date
    if (localTime >= openingHours && localTime < closingHours) {
      return localDate
    }
    // If the time is before opening, it belongs to the previous business day
    // Actually, for non-overnight, if we're before opening, we're between sessions
    // This shouldn't happen for valid slots
    return localDate
  }

  // Overnight session: closes on the next calendar day
  // Session: localDate + opensAt → localDate + 1 + closesAt
  // If localTime >= opensAt → we're in the session that started today
  // If localTime < opensAt and localTime < closesAt → we're in yesterday's session
  if (localTime >= openingHours) {
    // We're in the session that started ON localDate
    return localDate
  }

  if (localTime < closingHours) {
    // We're in the session that started YESTERDAY
    // Compute yesterday's date
    const [y, m, d] = localDate.split('-').map(Number)
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
    const yStr = yesterday.getUTCFullYear().toString()
    const mStr = (yesterday.getUTCMonth() + 1).toString().padStart(2, '0')
    const dStr = yesterday.getUTCDate().toString().padStart(2, '0')
    return `${yStr}-${mStr}-${dStr}`
  }

  // We're in the gap between sessions (branch is closed)
  // This shouldn't happen for valid bookings
  return localDate
}

// ── Get the UTC range of a Business Day ──
// Returns { fromUtc, toUtc } representing the start and end of the business day.

export function getBusinessDayRange(
  businessDate: BusinessDate,
  openingHours: LocalTime,
  closingHours: LocalTime,
  timezone: IANATimezone,
): UtcRange {
  const fromUtc = localToUtc(businessDate, openingHours, timezone)

  // For overnight sessions, the closing time is on the next calendar day
  let endDate: string
  if (isOvernightSession(openingHours, closingHours)) {
    const [y, m, d] = businessDate.split('-').map(Number)
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1))
    const yStr = nextDay.getUTCFullYear().toString()
    const mStr = (nextDay.getUTCMonth() + 1).toString().padStart(2, '0')
    const dStr = nextDay.getUTCDate().toString().padStart(2, '0')
    endDate = `${yStr}-${mStr}-${dStr}`
  } else {
    endDate = businessDate
  }

  const toUtc = localToUtc(endDate, closingHours, timezone)

  return { fromUtc, toUtc }
}

// ── Get the current Business Date ──
// Uses the provided clock to get "now" and determines the current business date.

export function getCurrentBusinessDate(
  nowUtc: UtcInstant,
  openingHours: LocalTime,
  closingHours: LocalTime,
  timezone: IANATimezone,
): BusinessDate {
  return getBusinessDate(nowUtc, openingHours, closingHours, timezone)
}
