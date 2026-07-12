import type { TimeSlot, AvailableSlot, UtcInstant, SlotStatus } from './types.js'

// ── Availability Time Service ──
// Determines slot availability and expiry using UTC comparison.
// No database access — receives data, returns computed results.

// ── Mark expired slots ──
// A slot is expired if its startAtUtc is <= nowUtc.
// Uses UTC comparison — no timezone involvement.

export function markExpiredSlots(slots: TimeSlot[], nowUtc: UtcInstant): AvailableSlot[] {
  const nowMs = new Date(nowUtc).getTime()

  return slots.map(slot => ({
    ...slot,
    status: (new Date(slot.startAtUtc).getTime() <= nowMs ? 'expired' : 'available') as SlotStatus,
  }))
}

// ── Check slot availability against existing bookings ──
// A slot is "booked" if any existing booking overlaps its UTC range.
// Booking has: { startAtUtc: string, endAtUtc: string }

export function mergeBookingConflicts(
  slots: AvailableSlot[],
  existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
): AvailableSlot[] {
  if (!existingBookings.length) return slots

  return slots.map(slot => {
    if (slot.status === 'expired') return slot

    const slotStart = new Date(slot.startAtUtc).getTime()
    const slotEnd = new Date(slot.endAtUtc).getTime()

    const hasConflict = existingBookings.some(booking => {
      if (!booking.startAtUtc || !booking.endAtUtc) return false
      const bookingStart = new Date(booking.startAtUtc).getTime()
      const bookingEnd = new Date(booking.endAtUtc).getTime()

      // Overlap: slot starts before booking ends AND slot ends after booking starts
      return slotStart < bookingEnd && slotEnd > bookingStart
    })

    if (hasConflict) {
      return { ...slot, status: 'booked' as SlotStatus }
    }

    return slot
  })
}

// ── Full availability resolution ──
// Generates available slots with status: available, expired, or booked.

export function resolveAvailability(
  slots: TimeSlot[],
  existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
  nowUtc: UtcInstant,
): AvailableSlot[] {
  const withExpiry = markExpiredSlots(slots, nowUtc)
  return mergeBookingConflicts(withExpiry, existingBookings)
}

// ── Single slot conflict check ──
// Returns true if the given UTC range has no conflicts.

export function isSlotAvailable(
  startAtUtc: UtcInstant,
  endAtUtc: UtcInstant,
  existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
): boolean {
  const slotStart = new Date(startAtUtc).getTime()
  const slotEnd = new Date(endAtUtc).getTime()

  return !existingBookings.some(booking => {
    if (!booking.startAtUtc || !booking.endAtUtc) return false
    const bStart = new Date(booking.startAtUtc).getTime()
    const bEnd = new Date(booking.endAtUtc).getTime()
    return slotStart < bEnd && slotEnd > bStart
  })
}
