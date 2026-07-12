import type { IANATimezone, LocalDate, LocalTime, UtcInstant } from './types.js'
import { getUtcOffsetMinutes, isInGap, isInOverlap, resolveOverlap } from './timezone-resolver.js'
import { DSTGapError } from './errors.js'

// ── Local time → UTC ──
// Converts a local date+time in a timezone to a UTC instant.
// Uses iterative convergence to handle DST transitions correctly.
// Throws DSTGapError if the local time doesn't exist (spring-forward gap).

export function localToUtc(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant {
  // Check for spring-forward gap first
  if (isInGap(date, time, tz)) {
    throw new DSTGapError(date, time, tz)
  }

  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)

  // Converge on the correct UTC instant
  // This handles DST transitions by iterating:
  // 1. Tentative UTC = local time as if UTC
  // 2. Get offset at tentative UTC
  // 3. Adjust tentative UTC by the offset
  // 4. Repeat until offset stabilizes
  let tentativeUtc = Date.UTC(y, m - 1, d, h, min)
  let prevOffset: number | null = null

  for (let i = 0; i < 5; i++) {
    const offset = getUtcOffsetMinutes(new Date(tentativeUtc).toISOString(), tz)
    if (prevOffset !== null && offset === prevOffset) break
    prevOffset = offset
    tentativeUtc = Date.UTC(y, m - 1, d, h, min) - offset * 60000
  }

  return new Date(tentativeUtc).toISOString()
}

// ── UTC → Local date+time ──
// Converts a UTC instant to local date and time in a timezone.

export function utcToLocal(instant: UtcInstant, tz: IANATimezone): { date: LocalDate; time: LocalTime } {
  const date = new Date(instant)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const y = parts.find(p => p.type === 'year')?.value || '2026'
  const mo = parts.find(p => p.type === 'month')?.value || '01'
  const day = parts.find(p => p.type === 'day')?.value || '01'
  const h = parts.find(p => p.type === 'hour')?.value || '00'
  const min = parts.find(p => p.type === 'minute')?.value || '00'

  return {
    date: `${y}-${mo}-${day}`,
    time: `${h}:${min}`,
  }
}

// ── UTC → Local date ──

export function utcToLocalDate(instant: UtcInstant, tz: IANATimezone): LocalDate {
  return utcToLocal(instant, tz).date
}

// ── UTC → Local time ──

export function utcToLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime {
  return utcToLocal(instant, tz).time
}

// ── UTC offset at a given local time ──
// Returns the UTC offset in minutes for a given local date+time.

export function getOffsetAtLocalTime(date: LocalDate, time: LocalTime, tz: IANATimezone): number {
  // For the overlap case, we return the offset for the FIRST occurrence
  if (isInOverlap(date, time, tz)) {
    const result = resolveOverlap(date, time, tz, 'first')
    return getUtcOffsetMinutes(result.selected, tz)
  }

  // Normal case: convert and get offset
  const utc = localToUtc(date, time, tz)
  return getUtcOffsetMinutes(utc, tz)
}
