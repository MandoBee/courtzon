import type { TimeSlot, LocalTime, LocalDate, BusinessDate, IANATimezone } from './types.js'
import { localToUtc } from './utc-converter.js'
import { getUtcOffsetMinutes, isInGap, isInOverlap, resolveOverlap } from './timezone-resolver.js'
import { isOvernightSession } from './operating-hours-engine.js'

// ── Slot Generator ──
// Generates all time slots for a given Business Day.
// Handles overnight sessions, DST gaps (skip), and DST overlaps (create two slots).

export function generateSlots(
  businessDate: BusinessDate,
  openingHours: LocalTime,
  closingHours: LocalTime,
  slotDurationMinutes: number,
  timezone: IANATimezone,
): TimeSlot[] {
  const slots: TimeSlot[] = []

  const [openH, openM] = openingHours.split(':').map(Number)
  const [closeH, closeM] = closingHours.split(':').map(Number)
  let openMinutes = openH * 60 + openM
  let closeMinutes = closeH * 60 + closeM

  // For overnight sessions, add 24h to closing time so the loop works correctly
  if (closeMinutes <= openMinutes) {
    closeMinutes += 24 * 60
  }

  let currentMinute = openMinutes
  let slotIndex = 0

  while (currentMinute + slotDurationMinutes <= closeMinutes) {
    const currentDayOffset = Math.floor(currentMinute / (24 * 60))
    const dayMinutes = currentMinute % (24 * 60)
    const slotH = Math.floor(dayMinutes / 60)
    const slotM = dayMinutes % 60

    const endMinute = currentMinute + slotDurationMinutes
    const endDayOffset = Math.floor(endMinute / (24 * 60))
    const endDayMinutes = endMinute % (24 * 60)
    const endH = Math.floor(endDayMinutes / 60)
    const endM = endDayMinutes % 60

    const localStartTime = `${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`
    const localEndTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

    // Determine the calendar date for this slot
    const slotDate = addDaysToDate(businessDate, currentDayOffset)

    // Check DST gap: skip if the local time doesn't exist
    if (isInGap(slotDate, localStartTime, timezone)) {
      currentMinute = endMinute
      slotIndex++
      continue
    }

    // Check DST overlap: create two slots if the time occurs twice
    if (isInOverlap(slotDate, localStartTime, timezone)) {
      const result = resolveOverlap(slotDate, localStartTime, timezone, 'first')
      const offset1 = getUtcOffsetMinutes(result.first, timezone)
      const offset2 = getUtcOffsetMinutes(result.second, timezone)

      // First occurrence
      slots.push({
        localStartTime,
        localEndTime,
        startAtUtc: result.first,
        endAtUtc: addDurationToUtc(result.first, slotDurationMinutes),
        businessDate,
        utcOffsetMinutes: offset1,
        dstOverlap: 'first',
      })

      // Second occurrence (one hour later in UTC, same local time)
      slots.push({
        localStartTime,
        localEndTime,
        startAtUtc: result.second,
        endAtUtc: addDurationToUtc(result.second, slotDurationMinutes),
        businessDate,
        utcOffsetMinutes: offset2,
        dstOverlap: 'second',
      })
    } else {
      // Normal case: single slot
      const startUtc = localToUtc(slotDate, localStartTime, timezone)
      const endUtc = localToUtc(slotDate, localEndTime, timezone)
      const offset = getUtcOffsetMinutes(startUtc, timezone)

      slots.push({
        localStartTime,
        localEndTime,
        startAtUtc: startUtc,
        endAtUtc: endUtc,
        businessDate,
        utcOffsetMinutes: offset,
      })
    }

    currentMinute = endMinute
    slotIndex++
  }

  return slots
}

// ── Helpers ──

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  const yStr = date.getUTCFullYear().toString()
  const mStr = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const dStr = date.getUTCDate().toString().padStart(2, '0')
  return `${yStr}-${mStr}-${dStr}`
}

function addDurationToUtc(utcInstant: string, minutes: number): string {
  const date = new Date(utcInstant)
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString()
}
