/**
 * Shared Tournament match Result form helpers.
 *
 * Single source of truth for the option form state + payload builder used by the
 * standalone Tournament Matches page and the consolidated Tournament Hub Matches
 * section. Reuses the EXISTING tournament result API contract
 * (POST /admin/tournaments/matches/:matchId/result with the shared
 * RawMatchResultPayload) — no new result engine, no duplicated calculation.
 */

export interface ResultForm {
  outcome: string;
  winnerSide: string;
  sets: { home: string; away: string }[];
  homeGoals: string;
  awayGoals: string;
}

export function emptyResultForm(): ResultForm {
  return { outcome: 'completed', winnerSide: '', sets: [{ home: '', away: '' }], homeGoals: '', awayGoals: '' };
}

/** Build the shared RawMatchResultPayload ({outcome, winner, score, termination}). */
export function buildResultPayload(form: ResultForm, scoreStructure: string | undefined): any {
  const winner = form.winnerSide || null;
  if (form.outcome === 'abandoned') return { outcome: 'abandoned', winner: null };
  if (form.outcome === 'completed') {
    if (scoreStructure === 'goals') {
      return { outcome: 'completed', winner: null, score: { homeGoals: Number(form.homeGoals || 0), awayGoals: Number(form.awayGoals || 0) } };
    }
    const sets = form.sets
      .map((s) => ({ home: Number(s.home), away: Number(s.away) }))
      .filter((s) => Number.isInteger(s.home) && Number.isInteger(s.away) && s.home >= 0 && s.away >= 0);
    if (sets.length === 0) return { outcome: 'completed', winner: null, score: { sets: [{ home: 0, away: 0 }] } };
    return { outcome: 'completed', winner: null, score: { sets } };
  }
  if (form.outcome === 'retired') {
    return { outcome: 'retired', winner: null, termination: { retired_side: winner } };
  }
  return { outcome: form.outcome, winner };
}