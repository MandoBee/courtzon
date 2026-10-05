/**
 * Defensive bracket-navigation resolver — pure unit coverage.
 *
 * Verifies the frontend never invents a bracket relationship: targets are only
 * returned when they can be proven from already-loaded rows and the documented
 * `progression_meta` contract. Ambiguity always yields `null` (fail closed).
 */
import { describe, it, expect } from 'vitest';
import { resolveBracketNavigation } from '../matchNavigation';
import type { TournamentMatchNode } from '../../../types/tournamentBracket';

const meta = (o: Record<string, unknown>) => o as TournamentMatchNode['progression_meta'];

function m(partial: Partial<TournamentMatchNode> & { id: number }): TournamentMatchNode {
  return { tournament_id: 1, ...partial } as TournamentMatchNode;
}

// 4-player single elimination: two round-1 feeders → one final.
const feederP1 = m({
  id: 101, round: 1, bracket_position: 0, player1_id: 10, player2_id: 11,
  progression_meta: meta({ is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' }),
});
const feederP2 = m({
  id: 102, round: 1, bracket_position: 1, player1_id: 12, player2_id: 13,
  progression_meta: meta({ is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player2' }),
});
const final = m({
  id: 103, round: 2, bracket_position: 0, player1_id: 10, player2_id: 12,
  progression_meta: meta({ is_bracket: true, target_round: null, target_bracket_position: null }),
});
const bracket = [feederP1, feederP2, final];

describe('resolveBracketNavigation — next (winner progression)', () => {
  it('resolves the unique slot a feeder winner advances into', () => {
    expect(resolveBracketNavigation(feederP1, bracket)?.next?.id).toBe(103);
    expect(resolveBracketNavigation(feederP2, bracket)?.next?.id).toBe(103);
  });

  it('has no next for a terminal (final) slot', () => {
    expect(resolveBracketNavigation(final, bracket).next).toBeNull();
  });

  it('stays disabled when two matches share the target coordinates (ambiguous)', () => {
    const dupFinal = m({ id: 104, round: 2, bracket_position: 0 });
    expect(resolveBracketNavigation(feederP1, [...bracket, dupFinal]).next).toBeNull();
  });

  it('ignores matches from a different tournament', () => {
    const foreignFinal = m({ id: 105, tournament_id: 99, round: 2, bracket_position: 0 });
    const rows = [feederP1, feederP2, foreignFinal];
    expect(resolveBracketNavigation(feederP1, rows).next).toBeNull();
  });
});

describe('resolveBracketNavigation — previous (feeder)', () => {
  it('stays disabled when two feeders exist and the viewer side is unknown', () => {
    expect(resolveBracketNavigation(final, bracket, null).prev).toBeNull();
  });

  it('resolves via the authenticated player side when two feeders exist', () => {
    // user 10 is player1 of the final → the target_side 'player1' feeder.
    expect(resolveBracketNavigation(final, bracket, 10).prev?.id).toBe(101);
    // user 12 is player2 of the final → the target_side 'player2' feeder.
    expect(resolveBracketNavigation(final, bracket, 12).prev?.id).toBe(102);
  });

  it('resolves a lone feeder unambiguously', () => {
    const soloFinal = m({
      id: 200, round: 2, bracket_position: 0,
      progression_meta: meta({ is_bracket: true, target_round: null, target_bracket_position: null }),
    });
    const loneFeeder = m({
      id: 201, round: 1, bracket_position: 0,
      progression_meta: meta({ is_bracket: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' }),
    });
    expect(resolveBracketNavigation(soloFinal, [soloFinal, loneFeeder]).prev?.id).toBe(201);
  });

  it('has no previous for an opening-round slot', () => {
    expect(resolveBracketNavigation(feederP1, bracket).prev).toBeNull();
  });
});

describe('resolveBracketNavigation — safety', () => {
  it('never offers progression for a round-robin (non-bracket) slot', () => {
    const rrA = m({ id: 301, round: 1, bracket_position: 0, progression_meta: meta({ is_bracket: false }) });
    const rrB = m({ id: 302, round: 1, bracket_position: 1, progression_meta: meta({ is_bracket: false }) });
    const nav = resolveBracketNavigation(rrA, [rrA, rrB]);
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
  });

  it('tolerates unknown / malformed progression_meta without throwing', () => {
    const weird = m({
      id: 401, round: 1, bracket_position: 0,
      progression_meta: meta({ is_bracket: true, target_round: 'abc', nested: { deep: true } }),
    });
    expect(() => resolveBracketNavigation(weird, [weird])).not.toThrow();
    expect(resolveBracketNavigation(weird, [weird])).toEqual({ prev: null, next: null });

    const nullMeta = m({ id: 402, round: 1, bracket_position: 0, progression_meta: null });
    expect(resolveBracketNavigation(nullMeta, [nullMeta])).toEqual({ prev: null, next: null });
  });

  it('returns empty navigation for missing inputs', () => {
    expect(resolveBracketNavigation(null, bracket)).toEqual({ prev: null, next: null });
    expect(resolveBracketNavigation(feederP1, null)).toEqual({ prev: null, next: null });
    expect(resolveBracketNavigation(feederP1, [])).toEqual({ prev: null, next: null });
  });
});
