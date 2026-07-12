import type { UtcInstant } from './types.js'

// ── Clock interface ──
// TimeEngine receives a Clock via dependency injection.
// This allows deterministic testing with FakeClock.

export interface Clock {
  now(): UtcInstant
}

// ── SystemClock ──
// Production implementation. THE ONLY new Date() call in the Time Engine.

export class SystemClock implements Clock {
  now(): UtcInstant {
    return new Date().toISOString()
  }
}

// ── FakeClock ──
// Test implementation. Returns a fixed instant for deterministic testing.

export class FakeClock implements Clock {
  private readonly fixedInstant: Date

  constructor(isoString: string)
  constructor(date: Date)
  constructor(fixedInstant: string | Date) {
    this.fixedInstant = typeof fixedInstant === 'string'
      ? new Date(fixedInstant)
      : fixedInstant
  }

  now(): UtcInstant {
    return this.fixedInstant.toISOString()
  }

  advanceMs(ms: number): void {
    this.fixedInstant.setTime(this.fixedInstant.getTime() + ms)
  }

  advanceSeconds(seconds: number): void {
    this.advanceMs(seconds * 1000)
  }

  advanceMinutes(minutes: number): void {
    this.advanceMs(minutes * 60 * 1000)
  }
}
