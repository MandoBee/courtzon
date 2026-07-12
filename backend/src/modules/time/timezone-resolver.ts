import type { IANATimezone, LocalDate, LocalTime, UtcInstant, DSTTransition, AmbiguousPair } from './types.js'
import { TimezoneError } from './errors.js'

// ── Timezone validation ──

export function validateTimezone(tz: string): IANATimezone {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return tz as IANATimezone
  } catch {
    throw new TimezoneError(`Invalid IANA timezone: "${tz}"`)
  }
}

// ── UTC offset at a given instant ──
// Uses Intl.DateTimeFormat with timeZoneName to get the UTC offset.
// This works on any Node.js version with full ICU.

export function getUtcOffsetMinutes(instant: UtcInstant, tz: IANATimezone): number {
  const date = new Date(instant)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT'

  // "GMT+03:00" → +180, "GMT-05:00" → -300, "GMT" → 0
  const match = tzName.match(/GMT([+-]\d{2}):(\d{2})/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    return hours * 60 + (hours >= 0 ? mins : -mins)
  }
  return 0
}

// ── Find the next DST transition after a given instant ──
// Checks each month's 1st and 15th to detect offset changes,
// then binary-searches the exact transition date.

export function getNextDSTTransition(afterInstant: UtcInstant, tz: IANATimezone): DSTTransition | null {
  const after = new Date(afterInstant)
  const afterOffset = getUtcOffsetMinutes(after.toISOString(), tz)

  // Check up to 18 months ahead
  for (let monthOffset = 1; monthOffset <= 18; monthOffset++) {
    const checkDate = new Date(after)
    checkDate.setUTCMonth(after.getUTCMonth() + monthOffset)
    checkDate.setUTCDate(1)
    checkDate.setUTCHours(0, 0, 0, 0)

    const checkOffset = getUtcOffsetMinutes(checkDate.toISOString(), tz)
    if (checkOffset !== afterOffset) {
      // Transition found in this month — binary search to find the exact day
      return findExactTransition(checkDate, tz, afterOffset, checkOffset)
    }
  }

  return null
}

function findExactTransition(
  monthStart: Date,
  tz: IANATimezone,
  beforeOffset: number,
  afterOffset: number,
): DSTTransition {
  let low = 1
  let high = 31
  const year = monthStart.getUTCFullYear()
  const month = monthStart.getUTCMonth()

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const midDate = new Date(Date.UTC(year, month, mid, 0, 0, 0))
    const midOffset = getUtcOffsetMinutes(midDate.toISOString(), tz)

    if (midOffset === beforeOffset) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  // low is the first day with the new offset
  // The transition happened between (low-1) 00:00 UTC and (low) 00:00 UTC
  const transitionDay = low
  const beforeDate = new Date(Date.UTC(year, month, transitionDay - 1, 0, 0, 0))
  const afterDate = new Date(Date.UTC(year, month, transitionDay, 0, 0, 0))

  // Refine to find the exact hour of transition
  let hourLow = 0
  let hourHigh = 23
  while (hourLow < hourHigh) {
    const midHour = Math.floor((hourLow + hourHigh) / 2)
    const midDate = new Date(Date.UTC(year, month, transitionDay - 1, midHour, 0, 0))
    const midOffset = getUtcOffsetMinutes(midDate.toISOString(), tz)

    if (midOffset === beforeOffset) {
      hourLow = midHour + 1
    } else {
      hourHigh = midHour
    }
  }

  const isSpring = afterOffset < beforeOffset
  const transitionTime = new Date(Date.UTC(year, month, transitionDay - 1, hourLow, 0, 0))

  return {
    type: isSpring ? 'spring_forward' : 'fall_back',
    localDate: '',
    localTime: '',
    gapStartUtc: transitionTime.toISOString(),
    gapEndUtc: new Date(transitionTime.getTime() + Math.abs(afterOffset - beforeOffset) * 60000).toISOString(),
    beforeOffsetMinutes: beforeOffset,
    afterOffsetMinutes: afterOffset,
  }
}

// ── Get all DST transitions for a year ──

export function getAllDSTTransitionsForYear(year: number, tz: IANATimezone): DSTTransition[] {
  const transitions: DSTTransition[] = []
  const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const startOffset = getUtcOffsetMinutes(startOfYear.toISOString(), tz)

  let currentOffset = startOffset
  let currentInstant = startOfYear.toISOString()

  for (let attempt = 0; attempt < 6; attempt++) {
    const next = getNextDSTTransition(currentInstant, tz)
    if (!next) break

    // Only include transitions within the requested year
    const transitionDate = new Date(next.gapStartUtc)
    if (transitionDate.getUTCFullYear() > year) break

    transitions.push(next)
    currentOffset = next.afterOffsetMinutes
    currentInstant = next.gapEndUtc
  }

  return transitions
}

// ── DST gap detection ──
// A spring-forward gap occurs when the local time doesn't exist
// (e.g., 02:00 doesn't exist when clocks jump to 03:00).

export function isInGap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)

  // Create the local time as if it were UTC
  let tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min))
  let prevOffset: number | null = null

  // Converge on the correct UTC instant (handles DST transitions)
  for (let i = 0; i < 5; i++) {
    const offset = getUtcOffsetMinutes(tentativeUtc.toISOString(), tz)
    if (prevOffset !== null && offset === prevOffset) break
    prevOffset = offset
    tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min) - offset * 60000)
  }

  // Check if the resulting local time matches the input
  const resultLocal = utcInstantToLocalTime(tentativeUtc.toISOString(), tz)
  return resultLocal !== time
}

function utcInstantToLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant))
  const h = parts.find(p => p.type === 'hour')?.value || '00'
  const min = parts.find(p => p.type === 'minute')?.value || '00'
  return `${h}:${min}`
}

// ── DST overlap detection ──
// A fall-back overlap occurs when the same local time happens twice
// (e.g., 02:30 happens twice when clocks fall back from 03:00 to 02:00).

export function isInOverlap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean {
  if (!isInGap(date, time, tz)) {
    // The time exists at least once.
    // Check if it exists twice by looking at the offset ±1 hour.
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    let tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min))

    for (let i = 0; i < 5; i++) {
      const offset = getUtcOffsetMinutes(tentativeUtc.toISOString(), tz)
      tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min) - offset * 60000)
    }

    // Check one hour ahead
    const laterUtc = new Date(tentativeUtc.getTime() + 3600 * 1000)
    const laterLocal = utcInstantToLocalTime(laterUtc.toISOString(), tz)
    return laterLocal === time
  }
  return false
}

// ── Resolve overlap ──
// Returns both possible UTC instants for a repeated local time.

export function resolveOverlap(
  date: LocalDate,
  time: LocalTime,
  tz: IANATimezone,
  preference: 'first' | 'second',
): { first: UtcInstant; second: UtcInstant; selected: UtcInstant } {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  let tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min))

  for (let i = 0; i < 5; i++) {
    const offset = getUtcOffsetMinutes(tentativeUtc.toISOString(), tz)
    tentativeUtc = new Date(Date.UTC(y, m - 1, d, h, min) - offset * 60000)
  }

  // The first occurrence is the one where offset corresponds to the
  // earlier UTC time (the one before the clocks fall back).
  // The second occurrence is one hour later in UTC.
  const first = tentativeUtc.toISOString()
  const second = new Date(tentativeUtc.getTime() + 3600 * 1000).toISOString()

  return {
    first,
    second,
    selected: preference === 'first' ? first : second,
  }
}

// ── Resolve gap ──
// For a spring-forward gap, returns the UTC instant just after the gap ends.
// Returns null if the time is not in a gap.

export function resolveGap(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant | null {
  if (!isInGap(date, time, tz)) return null

  // The time is in a gap. Return the instant just after the gap ends.
  const transitions = getAllDSTTransitionsForYear(parseInt(date.slice(0, 4), 10), tz)
  for (const t of transitions) {
    if (t.type === 'spring_forward') {
      const gapEnd = new Date(t.gapEndUtc)
      return gapEnd.toISOString()
    }
  }

  return null
}
