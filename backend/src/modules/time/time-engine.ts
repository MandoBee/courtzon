// ============================================================================
// CourtZon Time Engine — Facade
// ============================================================================
// This is the single public entry point for ALL time-related operations.
// Business modules must never access the individual resolver modules directly.
// They must go through this facade.

import type {
  UtcInstant, LocalDate, LocalTime, BusinessDate, IANATimezone,
  DSTTransition, OperatingSession, TimeSlot, AvailableSlot,
  RecurrenceRule, BookingInstance, ScheduledReminder, ReminderConfig,
  AmbiguousPair, UtcRange,
} from './types.js'
import type { Clock } from './clock.js'
import { SystemClock } from './clock.js'
import * as TzResolver from './timezone-resolver.js'
import * as UtcConv from './utc-converter.js'
import * as OHEngine from './operating-hours-engine.js'
import * as BDResolver from './business-day-resolver.js'
import * as SlotGen from './slot-generator.js'
import * as AvailService from './availability-time-service.js'

export class TimeEngine {
  private static clock: Clock = new SystemClock()

  // ── Dependency injection ──

  static setClock(clock: Clock): void {
    this.clock = clock
  }

  static resetClock(): void {
    this.clock = new SystemClock()
  }

  // ── TimeEngine.now() — THE ONLY TIME SOURCE ──
  // Every business module calls this instead of new Date().

  static now(): UtcInstant {
    return this.clock.now()
  }

  // ── TimezoneResolver ──

  static validateTimezone(tz: string): IANATimezone {
    return TzResolver.validateTimezone(tz)
  }

  static getUtcOffsetMinutes(instant: UtcInstant, tz: IANATimezone): number {
    return TzResolver.getUtcOffsetMinutes(instant, tz)
  }

  static getNextDSTTransition(afterInstant: UtcInstant, tz: IANATimezone): DSTTransition | null {
    return TzResolver.getNextDSTTransition(afterInstant, tz)
  }

  static getAllDSTTransitionsForYear(year: number, tz: IANATimezone): DSTTransition[] {
    return TzResolver.getAllDSTTransitionsForYear(year, tz)
  }

  static isInGap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean {
    return TzResolver.isInGap(date, time, tz)
  }

  static isInOverlap(date: LocalDate, time: LocalTime, tz: IANATimezone): boolean {
    return TzResolver.isInOverlap(date, time, tz)
  }

  static resolveOverlap(
    date: LocalDate, time: LocalTime, tz: IANATimezone, preference: 'first' | 'second',
  ): { first: UtcInstant; second: UtcInstant; selected: UtcInstant } {
    return TzResolver.resolveOverlap(date, time, tz, preference)
  }

  static resolveGap(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant | null {
    return TzResolver.resolveGap(date, time, tz)
  }

  // ── UTC Converter ──

  static localToUtc(date: LocalDate, time: LocalTime, tz: IANATimezone): UtcInstant {
    return UtcConv.localToUtc(date, time, tz)
  }

  static utcToLocal(instant: UtcInstant, tz: IANATimezone): { date: LocalDate; time: LocalTime } {
    return UtcConv.utcToLocal(instant, tz)
  }

  static utcToLocalDate(instant: UtcInstant, tz: IANATimezone): LocalDate {
    return UtcConv.utcToLocalDate(instant, tz)
  }

  static utcToLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime {
    return UtcConv.utcToLocalTime(instant, tz)
  }

  static getOffsetAtLocalTime(date: LocalDate, time: LocalTime, tz: IANATimezone): number {
    return UtcConv.getOffsetAtLocalTime(date, time, tz)
  }

  // ── Operating Hours Engine ──

  static getEffectiveOperatingHours(
    businessDate: BusinessDate,
    defaultOpeningHours: LocalTime,
    defaultClosingHours: LocalTime,
  ): OperatingSession {
    return OHEngine.getEffectiveOperatingHours(businessDate, defaultOpeningHours, defaultClosingHours)
  }

  static isOpenOn(businessDate: BusinessDate, openingHours: LocalTime, closingHours: LocalTime): boolean {
    return OHEngine.isOpenOn(businessDate, openingHours, closingHours)
  }

  static isOvernightSession(opensAt: LocalTime, closesAt: LocalTime): boolean {
    return OHEngine.isOvernightSession(opensAt, closesAt)
  }

  // ── Business Day Resolver ──

  static getBusinessDate(
    instant: UtcInstant,
    openingHours: LocalTime,
    closingHours: LocalTime,
    timezone: IANATimezone,
  ): BusinessDate {
    return BDResolver.getBusinessDate(instant, openingHours, closingHours, timezone)
  }

  static getBusinessDayRange(
    businessDate: BusinessDate,
    openingHours: LocalTime,
    closingHours: LocalTime,
    timezone: IANATimezone,
  ): UtcRange {
    return BDResolver.getBusinessDayRange(businessDate, openingHours, closingHours, timezone)
  }

  static getCurrentBusinessDate(
    openingHours: LocalTime,
    closingHours: LocalTime,
    timezone: IANATimezone,
  ): BusinessDate {
    return BDResolver.getCurrentBusinessDate(this.now(), openingHours, closingHours, timezone)
  }

  // ── Slot Generator ──

  static generateSlots(
    businessDate: BusinessDate,
    openingHours: LocalTime,
    closingHours: LocalTime,
    slotDurationMinutes: number,
    timezone: IANATimezone,
  ): TimeSlot[] {
    return SlotGen.generateSlots(businessDate, openingHours, closingHours, slotDurationMinutes, timezone)
  }

  // ── Availability Time Service ──

  static markExpiredSlots(slots: TimeSlot[], nowUtc?: UtcInstant): AvailableSlot[] {
    return AvailService.markExpiredSlots(slots, nowUtc ?? this.now())
  }

  static mergeBookingConflicts(
    slots: AvailableSlot[],
    existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
  ): AvailableSlot[] {
    return AvailService.mergeBookingConflicts(slots, existingBookings)
  }

  static resolveAvailability(
    slots: TimeSlot[],
    existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
    nowUtc?: UtcInstant,
  ): AvailableSlot[] {
    return AvailService.resolveAvailability(slots, existingBookings, nowUtc ?? this.now())
  }

  static isSlotAvailable(
    startAtUtc: UtcInstant,
    endAtUtc: UtcInstant,
    existingBookings: Array<{ startAtUtc?: string; endAtUtc?: string }>,
  ): boolean {
    return AvailService.isSlotAvailable(startAtUtc, endAtUtc, existingBookings)
  }

  // ── RecurringEngine — Phase 2 stub ──

  static generateOccurrences(_rule: RecurrenceRule): BookingInstance[] {
    throw new Error('RecurringEngine not yet implemented (Phase 2)')
  }

  // ── NotificationTimeLayer — Phase 2 stub ──

  static computeReminderUtc(startUtc: UtcInstant, minutesBefore: number): UtcInstant {
    const date = new Date(startUtc)
    return new Date(date.getTime() - minutesBefore * 60 * 1000).toISOString()
  }

  static computeAllReminders(startUtc: UtcInstant, config: ReminderConfig[]): ScheduledReminder[] {
    return config.map(c => ({
      remindAtUtc: this.computeReminderUtc(startUtc, c.minutesBefore),
      type: c.type,
    }))
  }

  // ── PricingTimeLayer — Phase 2 stub ──

  static getLocalDayOfWeek(instant: UtcInstant, tz: IANATimezone): number {
    const { date } = UtcConv.utcToLocal(instant, tz)
    const [y, m, d] = date.split('-').map(Number)
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return dayOfWeek === 0 ? 7 : dayOfWeek  // Monday=1 .. Sunday=7
  }

  static getLocalTime(instant: UtcInstant, tz: IANATimezone): LocalTime {
    return UtcConv.utcToLocalTime(instant, tz)
  }

  // ── ReportingTimeLayer — Phase 2 stub ──

  static getBusinessDateRange(
    fromDate: BusinessDate,
    toDate: BusinessDate,
    openingHours: LocalTime,
    closingHours: LocalTime,
    timezone: IANATimezone,
  ): UtcRange {
    // For the from range, use the start of the first business day
    // For the to range, use the end of the last business day (exclusive)
    const from = BDResolver.getBusinessDayRange(fromDate, openingHours, closingHours, timezone)
    const to = BDResolver.getBusinessDayRange(toDate, openingHours, closingHours, timezone)
    return { fromUtc: from.fromUtc, toUtc: to.toUtc }
  }
}
