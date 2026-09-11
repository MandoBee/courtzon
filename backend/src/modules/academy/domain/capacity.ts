// ============================================================================
// Academy G4 — capacity model (domain)
//
// original_capacity is the immutable baseline. An optional temporary override
// (capacity_override_amount + optional capacity_override_until) raises the
// effective maximum. Overrides are never retroactive: confirmed enrollments are
// never demoted, and original_capacity is never mutated by override operations.
// ============================================================================
import type { AcademyProgramAttributes } from './academy.types.js';

export interface CapacityOverrideState {
  active: boolean;
  amount: number | null;
  until: string | null;
  by: number | null;
  reason: string | null;
}

/**
 * Whether a capacity override is currently active.
 * Active = amount > 0 AND (no expiry OR expiry strictly in the future).
 */
export function isCapacityOverrideActive(program: AcademyProgramAttributes, now: Date = new Date()): boolean {
  const amount = Number(program.capacity_override_amount ?? 0);
  if (!(amount > 0)) return false;
  if (program.capacity_override_until == null) return true;
  const until = new Date(program.capacity_override_until).getTime();
  if (Number.isNaN(until)) return true; // malformed expiry -> treat as no expiry
  return until > now.getTime();
}

/**
 * Effective maximum capacity for enrollment decisions.
 * 0 preserves the "unlimited" semantics (original_capacity = 0 is unlimited,
 * and an override on an unlimited program is meaningless).
 */
export function effectiveCapacity(program: AcademyProgramAttributes, now: Date = new Date()): number {
  const original = Number(program.original_capacity ?? program.capacity ?? 0);
  if (original <= 0) return 0;
  if (isCapacityOverrideActive(program, now)) {
    const amount = Number(program.capacity_override_amount ?? 0);
    return original + amount;
  }
  return original;
}

export function capacityOverrideState(program: AcademyProgramAttributes, now: Date = new Date()): CapacityOverrideState {
  const active = isCapacityOverrideActive(program, now);
  return {
    active,
    amount: active ? Number(program.capacity_override_amount ?? 0) : null,
    until: program.capacity_override_until ?? null,
    by: program.capacity_override_by ?? null,
    reason: program.capacity_override_reason ?? null,
  };
}