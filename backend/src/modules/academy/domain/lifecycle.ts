import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { AcademyProgramStatus, AcademyEnrollmentStatus } from './academy.types.js';

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

export function getAllowedProgramTransitions(status: AcademyProgramStatus): AcademyProgramStatus[] {
  return PROGRAM_TRANSITIONS[status] || [];
}

export function getAllowedEnrollmentTransitions(status: AcademyEnrollmentStatus): AcademyEnrollmentStatus[] {
  return ENROLLMENT_TRANSITIONS[status] || [];
}
