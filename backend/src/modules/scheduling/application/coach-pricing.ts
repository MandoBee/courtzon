/**
 * Canonical Coach Session Price calculation.
 *
 * Business rule: the coach session duration ALWAYS equals the court booking
 * duration — coach and court share the exact same start/end window (the
 * scheduling engine prices a single candidate slot for both). The coach is
 * charged an HOURLY RATE, prorated by the actual duration:
 *
 *   coach_price = hourly_rate × duration_minutes / 60
 *
 * Examples (hourly = 350 EGP): 30m → 175 · 60m → 350 · 90m → 525 · 120m → 700.
 *
 * Money convention: computed in integer CENTS and rounded half-up to avoid the
 * floating-point artifacts that `Math.round(x * 100) / 100` can produce for
 * half-cent prices (e.g. 99.99 × 90m → 149.99, never 149.98). Handles a
 * midnight wrap defensively (endTime < startTime ⇒ the session crosses
 * midnight).
 */
export function calculateCoachSessionPrice(
  hourlyRate: number,
  startTime: string,
  endTime: string,
): number {
  const rate = Number(hourlyRate) || 0;
  const [startHour, startMinute] = String(startTime).split(':').map(Number);
  const [endHour, endMinute] = String(endTime).split(':').map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60; // midnight wrap (defensive)
  const rateCents = Math.round(rate * 100);
  const priceCents = Math.round((rateCents * minutes) / 60);
  return priceCents / 100;
}