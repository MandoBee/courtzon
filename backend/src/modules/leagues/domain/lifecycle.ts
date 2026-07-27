import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { SeasonStatus, LeagueStatus, TeamRegistrationStatus } from './league.types.js';

const SEASON_TRANSITIONS: Record<SeasonStatus, SeasonStatus[]> = {
  draft: ['published'],
  published: ['running'],
  running: ['completed'],
  completed: ['archived'],
  archived: [],
};

const LEAGUE_TRANSITIONS: Record<LeagueStatus, LeagueStatus[]> = {
  draft: ['registration_open'],
  registration_open: ['registration_closed'],
  registration_closed: ['running'],
  running: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

const TEAM_TRANSITIONS: Record<TeamRegistrationStatus, TeamRegistrationStatus[]> = {
  pending: ['confirmed', 'waiting', 'cancelled', 'withdrawn'],
  waiting: ['confirmed', 'cancelled', 'withdrawn'],
  confirmed: ['cancelled', 'withdrawn'],
  cancelled: [],
  withdrawn: [],
};

export function validateSeasonTransition(from: SeasonStatus, to: SeasonStatus): void {
  if (from === to) return;
  const allowed = SEASON_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition season from '${from}' to '${to}'`,
      ErrorCodes.LEAGUE_INVALID_TRANSITION,
    );
  }
}

export function validateLeagueTransition(from: LeagueStatus, to: LeagueStatus): void {
  if (from === to) return;
  const allowed = LEAGUE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition league from '${from}' to '${to}'`,
      ErrorCodes.LEAGUE_INVALID_TRANSITION,
    );
  }
}

export function validateTeamTransition(from: TeamRegistrationStatus, to: TeamRegistrationStatus): void {
  if (from === to) return;
  const allowed = TEAM_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition team registration from '${from}' to '${to}'`,
      ErrorCodes.LEAGUE_INVALID_TRANSITION,
    );
  }
}

export function getAllowedSeasonTransitions(status: SeasonStatus): SeasonStatus[] {
  return SEASON_TRANSITIONS[status] || [];
}

export function getAllowedLeagueTransitions(status: LeagueStatus): LeagueStatus[] {
  return LEAGUE_TRANSITIONS[status] || [];
}

export function getAllowedTeamTransitions(status: TeamRegistrationStatus): TeamRegistrationStatus[] {
  return TEAM_TRANSITIONS[status] || [];
}
