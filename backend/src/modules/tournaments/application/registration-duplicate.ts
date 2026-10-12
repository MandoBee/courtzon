import { ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

/**
 * Phase 2 — friendly duplicate-registration mapping.
 *
 * `tournament.service.register()` already rejects a duplicate with a 409
 * ConflictError before inserting (the sequential path). The registration number
 * is additionally guarded by the UNIQUE KEY `uk_player_competition`
 * (`tournament_registrations(tournament_id, competition_id, player_id)`), which
 * remains the authoritative duplicate-prevention safeguard — it is the only
 * thing that stops a concurrent registration that passed the pre-check.
 *
 * This helper maps ONLY that specific violation to the same user-safe 409 the
 * pre-check produces, so a race cannot leak a raw ER_DUP_ENTRY (HTTP 500) to
 * the caller. Any other database error — including ER_DUP_ENTRY on a different
 * unique key — is rethrown untouched and must NOT be converted to a conflict.
 *
 * @param err The error thrown by the INSERT.
 * @param message The user-safe conflict message (tournament.registration
 *   already used in the pre-check).
 * @returns never — either throws the ConflictError or rethrows `err`.
 */
export function mapRegistrationDuplicateError(err: unknown, message: string): never {
  const candidate = err as { code?: string; message?: string } | null | undefined;
  if (candidate?.code === 'ER_DUP_ENTRY' && String(candidate.message ?? '').includes('uk_player_competition')) {
    throw new ConflictError(message, ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS);
  }
  throw err;
}