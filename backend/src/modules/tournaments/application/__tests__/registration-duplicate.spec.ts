import { describe, it, expect } from 'vitest';
import { mapRegistrationDuplicateError } from '../registration-duplicate.js';
import { ErrorCodes } from '../../../../shared/errors/error-codes.js';

/**
 * Phase 2 — friendly duplicate registration mapping.
 *
 * The ONLY database error eligible for a friendly 409 is an ER_DUP_ENTRY on
 * `uk_player_competition` (`tournament_registrations(tournament_id,
 * competition_id, player_id)`). Any other error, including an ER_DUP_ENTRY on a
 * different unique key, must be rethrown untouched so it is never mis-mapped to
 * a conflict response.
 */
describe('mapRegistrationDuplicateError', () => {
  it('maps an ER_DUP_ENTRY on uk_player_competition to a 409 ConflictError with the user-safe message', () => {
    const err = Object.assign(new Error("Duplicate entry '1-5-9' for key 'tournament_registrations.uk_player_competition'"), { code: 'ER_DUP_ENTRY' });
    let thrown: any = null;
    try {
      mapRegistrationDuplicateError(err, 'Already registered in this competition');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.statusCode).toBe(409);
    expect(thrown.errorCode).toBe('CONFLICT');
    expect(thrown.code).toBe(ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS);
    expect(thrown.message).toBe('Already registered in this competition');
  });

  it('rethrows an ER_DUP_ENTRY that belongs to a DIFFERENT unique key (never mis-mapped to 409)', () => {
    const err = Object.assign(new Error("Duplicate entry 'x' for key 'tournament_prizes.uk_tprize_cash_competition_placement'"), { code: 'ER_DUP_ENTRY' });
    expect(() => mapRegistrationDuplicateError(err, 'Already registered in this competition')).toThrowError(err);
  });

  it('rethrows non-duplicate database errors untouched', () => {
    const err = Object.assign(new Error('some constraint failure'), { code: 'ER_ROW_IS_REFERENCED_2' });
    expect(() => mapRegistrationDuplicateError(err, 'Already registered in this competition')).toThrowError(err);
  });

  it('rethrows an error with no usable payload', () => {
    const err = new Error('boom');
    expect(() => mapRegistrationDuplicateError(err, 'Already registered in this competition')).toThrowError(err);
  });
});