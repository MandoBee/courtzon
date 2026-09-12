import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyProgramStatus, AcademyEnrollmentStatus, AcademyLifecycleState, AcademySessionStatus } from './academy.types.js';

/**
 * G1 — Academy ownership lifecycle foundation. An Academy starts in `setup`
 * (coach / compensation / ownership editable) and moves to `confirmed` exactly
 * once; `confirmed` is terminal for G1 (coach, compensation and ownership
 * identity become locked).
 */
const LIFECYCLE_TRANSITIONS: Record<AcademyLifecycleState, AcademyLifecycleState[]> = {
  setup: ['confirmed'],
  confirmed: [],
};

export function validateLifecycleTransition(from: AcademyLifecycleState, to: AcademyLifecycleState): void {
  if (from === to) return;
  const allowed = LIFECYCLE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition Academy lifecycle from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

const PROGRAM_TRANSITIONS: Record<AcademyProgramStatus, AcademyProgramStatus[]> = {
  draft: ['published'],
  published: ['open', 'cancelled', 'archived'],
  open: ['full', 'running', 'cancelled', 'archived'],
  full: ['open', 'running', 'cancelled', 'archived'],
  running: ['completed', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

const ENROLLMENT_TRANSITIONS: Record<AcademyEnrollmentStatus, AcademyEnrollmentStatus[]> = {
  pending: ['confirmed', 'waiting', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  waiting: ['confirmed', 'cancelled'],
  cancelled: [],
  completed: [],
};

// ── G5 — session execution state machine ──
// scheduled → in_progress (explicit admin start)
// scheduled → cancelled
// in_progress → completed
// in_progress → cancelled
// completed / cancelled are terminal for G5 lifecycle operations.
const SESSION_TRANSITIONS: Record<AcademySessionStatus, AcademySessionStatus[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function validateProgramTransition(from: AcademyProgramStatus, to: AcademyProgramStatus): void {
  if (from === to) return;
  const allowed = PROGRAM_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition program from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

export function validateEnrollmentTransition(from: AcademyEnrollmentStatus, to: AcademyEnrollmentStatus): void {
  if (from === to) return;
  const allowed = ENROLLMENT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition enrollment from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

/** G5 — validate a session lifecycle transition (throws ACADEMY_INVALID_TRANSITION). */
export function validateSessionTransition(from: AcademySessionStatus, to: AcademySessionStatus): void {
  if (from === to) return;
  const allowed = SESSION_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition session from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

export function getAllowedProgramTransitions(status: AcademyProgramStatus): AcademyProgramStatus[] {
  return PROGRAM_TRANSITIONS[status] || [];
}

export function getAllowedEnrollmentTransitions(status: AcademyEnrollmentStatus): AcademyEnrollmentStatus[] {
  return ENROLLMENT_TRANSITIONS[status] || [];
}
