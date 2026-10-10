import { AppError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import type { TournamentGenderCategory } from './tournament-aggregate.js';

/**
 * Phase 1 — server-authoritative gender rule for pair participants (doubles /
 * mixed doubles), enforced on the BACKEND at pair creation.
 *
 * A competition's `gender_categories` governs the pair composition:
 *   ['mixed'] only           → the pair must be exactly one male + one female
 *   ['male'] only            → every member must be male
 *   ['female'] only          → every member must be female
 *   any other combination /  → no gender restriction (open)
 *   empty
 *
 * Faces are resolved from the frozen eligibility snapshots evaluated at
 * creation time (never re-read, never client-supplied). This is deliberately
 * PAIR-scoped (the Phase 1 requirement); team gender rules remain unchanged.
 */

export interface PairGenderMember {
  userId: number;
  playerGender: string | null | undefined;
}

export function enforcePairGenderRule(
  members: ReadonlyArray<PairGenderMember>,
  genderCategories: ReadonlyArray<TournamentGenderCategory>,
): void {
  if (members.length <= 1) return;
  const set = new Set(genderCategories ?? []);
  if (set.size !== 1) return; // open, multiple categories, or empty → unrestricted

  const [only] = set;
  const missingGender = (id: number, g: string | null | undefined): string | null =>
    g !== 'male' && g !== 'female' ? `Player #${id} has no recorded gender` : null;

  if (only === 'mixed') {
    for (const m of members) {
      const miss = missingGender(m.userId, m.playerGender);
      if (miss) {
        throw new AppError(miss, 422, 'TOURNAMENT_PAIR_GENDER_INVALID');
      }
    }
    const males = members.filter((m) => m.playerGender === 'male').length;
    if (males !== 1 || members.length - males !== 1) {
      throw new AppError(
        'A mixed competition pair requires exactly one male and one female',
        422,
        'TOURNAMENT_PAIR_GENDER_INVALID',
        { code: ErrorCodes.TOURNAMENT_PAIR_GENDER_INVALID },
      );
    }
    return;
  }

  if (only === 'male' || only === 'female') {
    for (const m of members) {
      if (m.playerGender !== only) {
        throw new AppError(
          only === 'male' ? 'This competition is men-only' : 'This competition is women-only',
          422,
          'TOURNAMENT_PAIR_GENDER_INVALID',
          { code: ErrorCodes.TOURNAMENT_PAIR_GENDER_INVALID },
        );
      }
    }
  }
}