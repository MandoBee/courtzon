import { describe, it, expect } from 'vitest';
import { resolveKnockoutPlacements, toKnockoutMatchInput, type KnockoutMatchInput } from '../domain/knockout-placements.js';
import type { TournamentMatch } from '../domain/tournament-aggregate.js';

/**
 * G11.14 — pure knockout placement resolver contract (FAIL-CLOSED).
 *
 * Verifies every resolver case the G11.14 phase mandates:
 *   8-player bracket · 4-player with byes · 3-player bye cascade ·
 *   withdrawn-slot resolution · placeholder/unseated · ambiguous bracket ·
 *   incomplete final · missing winner · multiple possible finals.
 *
 * The resolver NEVER fabricates a loser/placement: an undecidable graph
 * yields ZERO placements with a structured outcome.
 */

let seq = 1;
function mkMatch(p: Partial<KnockoutMatchInput> & {
  round: number;
  bracket_position?: number | null;
  p1?: number | null;
  p2?: number | null;
  up1?: number | null;
  up2?: number | null;
  winner?: number | null;
  winnerParticipant?: number | null;
  loserParticipant?: number | null;
  status?: string | null;
  ps?: string | null;
  targetRound?: number | null;
  targetBp?: number | null;
  bye?: boolean;
  matchId?: number | null;
}): KnockoutMatchInput {
  const winner = p.winner ?? null;
  const up1 = p.up1 ?? p.p1 ?? null;
  const up2 = p.up2 ?? p.p2 ?? null;
  const winnerParticipant = p.winnerParticipant != null
    ? p.winnerParticipant
    : winner != null && p.p1 != null && winner === p.p1 && p.up1 != null ? p.up1
    : winner != null && p.p2 != null && winner === p.p2 && p.up2 != null ? p.up2
    : null;
  const meta: Record<string, unknown> = {
    is_bracket: true,
    ...(p.bye ? { bye: true } : {}),
    target_round: p.targetRound ?? null,
    target_bracket_position: p.targetBp ?? null,
    target_side: ((p.bracket_position ?? 0) % 2 === 0 ? 'player1' : 'player2'),
  };
  seq += 1;
  return {
    round: p.round,
    bracket_position: p.bracket_position ?? (seq * 7) % 17,
    participant1_id: p.p1 ?? null,
    participant2_id: p.p2 ?? null,
    player1_id: p.up1 ?? p.p1 ?? null,
    player2_id: p.up2 ?? p.p2 ?? null,
    winner_id: winner,
    winner_participant_id: winnerParticipant,
    loser_participant_id: p.loserParticipant ?? null,
    status: p.status ?? 'completed',
    progression_state: p.ps ?? 'completed',
    progression_meta: meta,
    match_id: p.matchId !== undefined ? p.matchId : (p.bye ? null : p.round * 1000 + (p.bracket_position ?? 0)),
  };
}

/** Default winner pairing for a played match (side 1 wins unless overridden). */
function played(m: KnockoutMatchInput, winnerSide: 1 | 2 = 1, loserParticipant?: number | null): KnockoutMatchInput {
  const wid = winnerSide === 1 ? m.player1_id : m.player2_id;
  return { ...m, winner_id: wid, winner_participant_id: winnerSide === 1 ? m.participant1_id : m.participant2_id, match_id: m.match_id ?? 5000 + seq, loser_participant_id: loserParticipant ?? null };
}

const placement = (placement: number, participantId: number | null, userId: number | null) => ({ placement, participantId, userId, source: 'bracket' as const });

/**
 * ── 8-PLAYER bracket ──
 *  Round 1: (11v12)(13v14)(15v16)(17v18) → winners 11,13,15,17
 *  Round 2: (11v13)(15v17) → winners 11,15
 *  Final:   (11v15) → champion 11, runner-up 15
 *  Placement 3 is TIED between {13,17} (two semi losers) → omitted.
 */
function eightPlayerBracket(): KnockoutMatchInput[] {
  const r1 = [
    mkMatch({ round: 1, p1: 11, p2: 12, winner: 11, targetRound: 2, targetBp: 0 }),
    mkMatch({ round: 1, p1: 13, p2: 14, winner: 13, targetRound: 2, targetBp: 1 }),
    mkMatch({ round: 1, p1: 15, p2: 16, winner: 15, targetRound: 2, targetBp: 2 }),
    mkMatch({ round: 1, p1: 17, p2: 18, winner: 17, targetRound: 2, targetBp: 3 }),
  ];
  const r2 = [
    mkMatch({ round: 2, p1: 11, p2: 13, winner: 11, targetRound: 3, targetBp: 0 }),
    mkMatch({ round: 2, p1: 15, p2: 17, winner: 15, targetRound: 3, targetBp: 0 }),
  ];
  const final = mkMatch({ round: 3, p1: 11, p2: 15, winner: 11 });
  return [...r1.map((m) => played(m)), ...r2.map((m) => played(m)), played(final)];
}

describe('G11.14 knockout-placements resolver', () => {
  it('8-player bracket → champion+runner-up; third is ambiguity-omitted', () => {
    const brackets = eightPlayerBracket();
    const out = resolveKnockoutPlacements(brackets);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements).toEqual([
        placement(1, 11, 11),
        placement(2, 15, 15),
      ]);
      expect(out.placements.find((p) => p.placement === 3)).toBeUndefined();
    }
  });

  it('4-player bracket with byes → champion + runner-up + unique third (the real semi loser)', () => {
    // Round 1: bye slot (11 advancing alone) + played (12 v 13 → 12 wins, 13 knocked out)
    const bye = mkMatch({ round: 1, p1: 11, p2: null, winner: 11, bye: true, targetRound: 2, targetBp: 0 });
    const semi = played(mkMatch({ round: 1, p1: 12, p2: 13, winner: 12, targetRound: 2, targetBp: 1 }), 1, 13);
    const final = played(mkMatch({ round: 2, p1: 11, p2: 12, winner: 11 }), 1, 12);
    const out = resolveKnockoutPlacements([bye, semi, final]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements).toContainEqual(placement(1, 11, 11));
      expect(out.placements).toContainEqual(placement(2, 12, 12));
      expect(out.placements).toContainEqual(placement(3, 13, 13));
    }
  });

  it('3-player bye cascade (bye + single semi + padding placeholder) → 1,2,3 resolve; placeholders never lose', () => {
    // 3 entrants padded into a 4-slot bracket: A gets a bye, B v C is the only
    // round-1 real match (C is eliminated = 3rd), the padding placeholder slot
    // carries no participant. Penultimate losers = {C} uniquely → 1,2,3 resolve;
    // the placeholder contributes NO loser (fail closed).
    const bye = mkMatch({ round: 1, p1: 11, p2: null, winner: 11, bye: true, targetRound: 2, targetBp: 0 });
    const semi = played(mkMatch({ round: 1, p1: 12, p2: 13, winner: 12, targetRound: 2, targetBp: 1 }), 1, 13);
    const padding = mkMatch({ round: 1, p1: null, p2: null, matchId: null, targetRound: 2, targetBp: 0 });
    const final = played(mkMatch({ round: 2, p1: 11, p2: 12, winner: 11 }), 1, 12);
    const out = resolveKnockoutPlacements([bye, semi, padding, final]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements.map((p) => p.placement)).toEqual([1, 2, 3]);
      expect(out.placements.find((p) => p.placement === 3)).toEqual(placement(3, 13, 13));
    }
  });

  it('withdrawn-slot final → champion only; runner-up NEVER invented', () => {
    // The final was a withdrawal resolution: loser side is the withdrawn
    // participant (loser_participant_id NULL, no shared match) → placement 2
    // must be omitted (fail closed) — never a fabricated runner-up.
    const bye = mkMatch({ round: 1, p1: 11, p2: null, winner: 11, bye: true, targetRound: 2, targetBp: 0 });
    const semi = played(mkMatch({ round: 1, p1: 12, p2: 13, winner: 12, targetRound: 2, targetBp: 1 }), 1, 13);
    const final = mkMatch({ round: 2, p1: 11, p2: 12, winner: 11, matchId: null }); // withdrawal-style resolution
    const out = resolveKnockoutPlacements([bye, semi, final]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') expect(out.placements).toEqual([placement(1, 11, 11)]);
  });

  it('placeholder / unseated final → champion only (no runner-up guess)', () => {
    const r1 = played(mkMatch({ round: 1, p1: 50, p2: 51, winner: 50, targetRound: 2, targetBp: 0 }), 1, 51);
    const final = mkMatch({ round: 2, p1: 50, p2: null, winner: 50 }); // opponent never seated
    const out = resolveKnockoutPlacements([r1, final]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') expect(out.placements).toEqual([placement(1, 50, 50)]);
  });

  it('ambiguous bracket (zero terminal slots) → no placements', () => {
    const a = played(mkMatch({ round: 1, p1: 1, p2: 2, winner: 1, targetRound: 2, targetBp: 0 }));
    const b = played(mkMatch({ round: 2, p1: 1, p2: 3, winner: 1, targetRound: 3, targetBp: 0 }));
    const c = played(mkMatch({ round: 3, p1: 1, p2: 4, winner: 1, targetRound: 3, targetBp: 0 })); // dangling target → no terminal
    const out = resolveKnockoutPlacements([a, b, c]);
    expect(out.status).toBe('ambiguous');
    expect(out.placements).toEqual([]);
  });

  it('multiple possible finals → ambiguous (no placements)', () => {
    const r1 = played(mkMatch({ round: 1, p1: 1, p2: 2, winner: 1, targetRound: 2, targetBp: 0 }));
    const f1 = played(mkMatch({ round: 2, p1: 1, p2: 3, winner: 1 }));          // final #1
    const g1 = played(mkMatch({ round: 1, p1: 4, p2: 5, winner: 4, targetRound: 2, targetBp: 0 }));
    const f2 = played(mkMatch({ round: 2, p1: 4, p2: 6, winner: 4 }));          // final #2 (forged graph)
    const out = resolveKnockoutPlacements([r1, f1, g1, f2]);
    expect(out.status).toBe('ambiguous');
    expect(out.placements).toEqual([]);
  });

  it('incomplete final (not terminally resolved) → incomplete, no placements', () => {
    const r1 = played(mkMatch({ round: 1, p1: 1, p2: 2, winner: 1, targetRound: 2, targetBp: 0 }));
    const final = mkMatch({ round: 2, p1: 1, p2: 3, status: 'in_progress', ps: 'pending' });
    const out = resolveKnockoutPlacements([r1, final]);
    expect(out.status).toBe('incomplete');
    expect(out.placements).toEqual([]);
  });

  it('missing winner (final resolved but winner unresolvable) → ambiguous, no placements', () => {
    const r1 = played(mkMatch({ round: 1, p1: 1, p2: 2, winner: 1, targetRound: 2, targetBp: 0 }));
    const final = mkMatch({ round: 2, p1: 1, p2: 3, winner: null }); // completed, no winner
    const out = resolveKnockoutPlacements([r1, final]);
    expect(out.status).toBe('ambiguous');
    expect(out.placements).toEqual([]);
  });

  it('not a knockout graph → not_knockout, no placements', () => {
    const rr = mkMatch({ round: 1, p1: 1, p2: 2, winner: 1 });
    rr.progression_meta = { is_bracket: false };
    const out = resolveKnockoutPlacements([rr]);
    expect(out.status).toBe('not_knockout');
    expect(out.placements).toEqual([]);
  });

  it('toKnockoutMatchInput maps a TournamentMatch (defensive numeric coercion)', () => {
    const tm = {
      id: 7, tournament_id: 9, round: 2, match_number: 1, status: 'completed',
      progression_state: 'completed',
      player1_id: 10, player2_id: 20, participant1_id: '100' as unknown as number, participant2_id: 200,
      winner_id: 10, winner_participant_id: 100,
      progression_meta: { is_bracket: true, target_round: null, target_bracket_position: null },
      bracket_position: 0,
    } as TournamentMatch;
    const m = toKnockoutMatchInput(tm);
    expect(m.round).toBe(2);
    expect(m.participant1_id).toBe(100);
    expect(m.winner_participant_id).toBe(100);
    const out = resolveKnockoutPlacements([m]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') expect(out.placements[0]).toEqual(placement(1, 100, 10));
  });
});