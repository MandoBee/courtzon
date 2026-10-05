/**
 * Reusable tournament score formatting.
 *
 * Consumes the existing read-model fields documented in
 * docs/HANDOVER_CURRENT/69_TOURNAMENT_BRACKET_API_AUDIT.md:
 *   - match.score_summary  (display string, e.g. "2 - 1", "6-4 6-3")
 *   - match.rule_snapshot.score_structure ("goals" | "sets")
 *   - match.format_snapshot (sport/format metadata)
 *   - optional detailed result: match_result_records.raw_result / final_result
 *
 * Order of precedence:
 *   1. Detailed structured score (goals: "2 - 0"; sets: "6-3, 4-6, 6-2").
 *   2. score_summary verbatim (keeps the exact strings the UI/tests show).
 *   3. Empty string (callers render a dash).
 */
import type { TournamentMatchNode } from '../types/tournamentBracket';

export interface DetailedTournamentResult {
  rawResult?: Record<string, unknown> | null;
  finalResult?: Record<string, unknown> | null;
}

function scoreFromSets(sets: unknown[]): string {
  return sets
    .map((s) => {
      if (s && typeof s === 'object') {
        const rec = s as Record<string, unknown>;
        const home = rec.home != null ? rec.home : rec.homeGoals != null ? rec.homeGoals : '?';
        const away = rec.away != null ? rec.away : rec.awayGoals != null ? rec.awayGoals : '?';
        return `${home}-${away}`;
      }
      return String(s);
    })
    .join(', ');
}

export function formatTournamentScore(match: TournamentMatchNode, result?: DetailedTournamentResult | null): string {
  // 1) Detailed structured result when available.
  if (result) {
    const raw = result.rawResult as Record<string, unknown> | undefined;
    const fin = result.finalResult as Record<string, unknown> | undefined;
    const score = (raw?.score as Record<string, unknown> | undefined) ?? (fin?.score as Record<string, unknown> | undefined);
    if (score && typeof score === 'object') {
      const homeGoals = typeof score.homeGoals === 'number' ? score.homeGoals : null;
      const awayGoals = typeof score.awayGoals === 'number' ? score.awayGoals : null;
      if (homeGoals != null && awayGoals != null) return `${homeGoals} - ${awayGoals}`;
      const sets = Array.isArray(score.sets) ? score.sets : null;
      if (sets && sets.length) return scoreFromSets(sets);
      if (Array.isArray(score)) return scoreFromSets(score as unknown[]);
    }
    const summary = (fin?.scoreSummary ?? fin?.score_summary ?? fin?.scoreDisplay) as string | undefined;
    if (summary) return String(summary);
  }

  // 2) score_summary verbatim (primary display source in the current API).
  if (match.score_summary) return String(match.score_summary);

  return '';
}

/** A match with fewer than two players filled is a bye/placeholder slot. */
export function hasBye(match: TournamentMatchNode): boolean {
  return !match.player1_id || !match.player2_id || match.match_id == null;
}
