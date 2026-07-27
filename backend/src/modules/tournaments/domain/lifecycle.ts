import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { TournamentStatus, RegistrationStatus } from './tournament-aggregate.js';

const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['published'],
  published: ['registration_open'],
  registration_open: ['registration_closed'],
  registration_closed: ['running'],
  running: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

const REGISTRATION_TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  pending: ['confirmed', 'waiting', 'cancelled'],
  waiting: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  cancelled: [],
  completed: [],
};

export function validateTournamentTransition(from: TournamentStatus, to: TournamentStatus): void {
  if (from === to) return;
  const allowed = TOURNAMENT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition tournament from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

export function validateRegistrationTransition(from: RegistrationStatus, to: RegistrationStatus): void {
  if (from === to) return;
  const allowed = REGISTRATION_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition registration from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}

export function getAllowedTournamentTransitions(status: TournamentStatus): TournamentStatus[] {
  return TOURNAMENT_TRANSITIONS[status] || [];
}

export function getAllowedRegistrationTransitions(status: RegistrationStatus): RegistrationStatus[] {
  return REGISTRATION_TRANSITIONS[status] || [];
}
