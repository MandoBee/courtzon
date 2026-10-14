import { describe, it, expect } from 'vitest';
import {
  generateKnockoutBracket,
  normaliseBracketTargets,
  knockoutThirdPlaceEligible,
  withThirdPlaceMatch,
} from '../domain/tournament-aggregate.js';
import { resolveKnockoutPlacements, type KnockoutMatchInput } from '../domain/knockout-placements.js';
import { GskKnockoutSchema } from '../presentation/tournament.dto.js';

/**
 * GSK-3C (Phase 2) — third-place playoff: config contract, bracket topology and
 * the pure placement resolver. All pure/deterministic (no DB).
 */

// ── Config DTO ──────────────────────────────────────────────────────────────

const BASE_KO = {
  startingRound: 'semifinals' as const,
  seeding: 'automatic' as const,
  separateGroupWinners: true,
  preventSameGroupRematch: true,
  allowByes: true,
};

describe('GSK-3C config — thirdPlaceMatch is optional and preserves legacy behaviour', () => {
  it('accepts an omitted thirdPlaceMatch', () => {
    expect(GskKnockoutSchema.safeParse(BASE_KO).success).toBe(true);
  });
  it('accepts thirdPlaceMatch=false', () => {
    expect(GskKnockoutSchema.safeParse({ ...BASE_KO, thirdPlaceMatch: false }).success).toBe(true);
  });
  it('accepts thirdPlaceMatch=true', () => {
    expect(GskKnockoutSchema.safeParse({ ...BASE_KO, thirdPlaceMatch: true }).success).toBe(true);
  });
  it('rejects a non-boolean thirdPlaceMatch', () => {
    expect(GskKnockoutSchema.safeParse({ ...BASE_KO, thirdPlaceMatch: 'yes' }).success).toBe(false);
  });
});

// ── Eligibility ─────────────────────────────────────────────────────────────

describe('GSK-3C — knockoutThirdPlaceEligible (exactly two contested semifinals)', () => {
  it('a direct final (single round) is never eligible', () => {
    expect(knockoutThirdPlaceEligible(2, 1)).toBe(false);
  });
  it('a 3-player padded bracket is NOT eligible (only one determinable loser)', () => {
    expect(knockoutThirdPlaceEligible(3, 2)).toBe(false);
  });
  it('a 4-player bracket IS eligible', () => {
    expect(knockoutThirdPlaceEligible(4, 2)).toBe(true);
  });
  it('8-player and 7-player brackets are eligible; 5- and 6-player are not', () => {
    expect(knockoutThirdPlaceEligible(8, 3)).toBe(true);
    expect(knockoutThirdPlaceEligible(7, 3)).toBe(true);
    expect(knockoutThirdPlaceEligible(6, 3)).toBe(false);
    expect(knockoutThirdPlaceEligible(5, 3)).toBe(false);
  });
  it('16-player (16, 13) eligible; 12- and 9-player not', () => {
    expect(knockoutThirdPlaceEligible(16, 4)).toBe(true);
    expect(knockoutThirdPlaceEligible(13, 4)).toBe(true);
    expect(knockoutThirdPlaceEligible(12, 4)).toBe(false);
    expect(knockoutThirdPlaceEligible(9, 4)).toBe(false);
  });
});

// ── Topology ────────────────────────────────────────────────────────────────

describe('GSK-3C — withThirdPlaceMatch topology', () => {
  it('appends a dedicated third-place slot and wires both semifinal losers', () => {
    const base = normaliseBracketTargets(generateKnockoutBracket([1, 2, 3, 4]), 4);
    const slots = withThirdPlaceMatch(base, 4, 2);

    expect(slots).toHaveLength(base.length + 1);

    // Both round-1 (semifinal) slots route their loser to the third-place slot.
    const semis = slots.filter((s) => s.round === 1);
    expect(semis).toHaveLength(2);
    for (const s of semis) {
      expect(s.loserTargetRound).toBe(2);
      expect(s.loserTargetBracketPosition).toBe(1);
    }
    expect(semis.find((s) => s.bracketPosition === 0)?.loserTargetSide).toBe('player1');
    expect(semis.find((s) => s.bracketPosition === 1)?.loserTargetSide).toBe('player2');

    // The final is untouched and the third-place slot sits beside it (position 1).
    const final = slots.find((s) => s.round === 2 && s.bracketPosition === 0);
    const third = slots.find((s) => s.round === 2 && s.bracketPosition === 1);
    expect(final?.isThirdPlace).not.toBe(true);
    expect(third?.isThirdPlace).toBe(true);
  });

  it('returns the SAME bracket (unchanged) when not eligible', () => {
    const base = normaliseBracketTargets(generateKnockoutBracket([1, 2, 3]), 3);
    const slots = withThirdPlaceMatch(base, 3, 2);
    expect(slots).toBe(base);
    expect(slots.some((s) => s.isThirdPlace === true)).toBe(false);
    expect(slots.some((s) => s.loserTargetRound != null)).toBe(false);
  });

  it('is a strict opt-in — a direct-final bracket is never mutated', () => {
    const base = normaliseBracketTargets(generateKnockoutBracket([1, 2]), 2);
    const slots = withThirdPlaceMatch(base, 2, 1);
    expect(slots).toBe(base);
  });
});

// ── Resolver ────────────────────────────────────────────────────────────────

let seq = 1;
function mk(p: {
  round: number; bp?: number;
  p1?: number | null; p2?: number | null;
  up1?: number | null; up2?: number | null;
  winner?: number | null; loserParticipant?: number | null;
  status?: string | null; ps?: string | null;
  targetRound?: number | null; targetBp?: number | null;
  thirdPlace?: boolean; matchId?: number | null;
}): KnockoutMatchInput {
  const winner = p.winner ?? null;
  const up1 = p.up1 ?? p.p1 ?? null;
  const up2 = p.up2 ?? p.p2 ?? null;
  const winnerParticipant = winner != null && p.p1 != null && winner === p.p1 ? p.p1
    : winner != null && p.p2 != null && winner === p.p2 ? p.p2
    : null;
  const meta: Record<string, unknown> = {
    is_bracket: true,
    ...(p.thirdPlace ? { is_third_place: true } : {}),
    target_round: p.targetRound ?? null,
    target_bracket_position: p.targetBp ?? null,
    target_side: ((p.bp ?? 0) % 2 === 0 ? 'player1' : 'player2'),
  };
  seq += 1;
  return {
    round: p.round,
    bracket_position: p.bp ?? (seq * 7) % 17,
    participant1_id: p.p1 ?? null,
    participant2_id: p.p2 ?? null,
    player1_id: up1,
    player2_id: up2,
    winner_id: winner,
    winner_participant_id: winnerParticipant,
    loser_participant_id: p.loserParticipant ?? null,
    status: p.status ?? 'completed',
    progression_state: p.ps ?? 'completed',
    progression_meta: meta,
    match_id: p.matchId !== undefined ? p.matchId : (p.round * 1000 + (p.bp ?? 0)),
  };
}
function played(m: KnockoutMatchInput, winnerSide: 1 | 2 = 1, loser?: number | null): KnockoutMatchInput {
  const wid = winnerSide === 1 ? m.player1_id : m.player2_id;
  return { ...m, winner_id: wid, winner_participant_id: winnerSide === 1 ? m.participant1_id : m.participant2_id, match_id: m.match_id ?? 5000 + seq, loser_participant_id: loser ?? null };
}
const placement = (placement: number, participantId: number | null, userId: number | null) => ({ placement, participantId, userId, source: 'bracket' as const });

/** 4-player bracket with a dedicated third-place match: semis 11>12, 13>14; final 11>13; third 12>14. */
function fourPlayerWithThird(status = 'completed', ps = 'completed'): KnockoutMatchInput[] {
  const semiA = played(mk({ round: 1, bp: 0, p1: 11, p2: 12, winner: 11, targetRound: 2, targetBp: 0 }), 1, 12);
  const semiB = played(mk({ round: 1, bp: 1, p1: 13, p2: 14, winner: 13, targetRound: 2, targetBp: 0 }), 1, 14);
  const final = played(mk({ round: 2, bp: 0, p1: 11, p2: 13, winner: 11 }), 1, 13);
  const third = played(mk({ round: 2, bp: 1, p1: 12, p2: 14, winner: 12, thirdPlace: true, status, ps }), 1, 14);
  return [semiA, semiB, final, third];
}

describe('GSK-3C — resolver honours a dedicated third-place slot', () => {
  it('a completed third-place match yields placement 3 from its winner', () => {
    const out = resolveKnockoutPlacements(fourPlayerWithThird());
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements).toEqual([
        placement(1, 11, 11),
        placement(2, 13, 13),
        placement(3, 12, 12),
      ]);
    }
  });

  it('the dedicated third-place slot is NOT counted as a championship final', () => {
    // If it were, there would be TWO terminal slots → ambiguous. Resolving proves
    // the champion comes from the real final only.
    const out = resolveKnockoutPlacements(fourPlayerWithThird());
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') expect(out.placements.find((p) => p.placement === 1)).toEqual(placement(1, 11, 11));
  });

  it('an unresolved third-place slot → placement 3 omitted, 1 and 2 preserved (fail closed)', () => {
    const out = resolveKnockoutPlacements(fourPlayerWithThird('scheduled', 'ready'));
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements).toEqual([placement(1, 11, 11), placement(2, 13, 13)]);
      expect(out.placements.find((p) => p.placement === 3)).toBeUndefined();
    }
  });

  it('an unresolved third-place winner → placement 3 omitted', () => {
    const bracket = fourPlayerWithThird();
    // Completed third-place slot but no resolvable winner.
    const third = bracket[bracket.length - 1];
    (third as any).winner_id = null;
    (third as any).winner_participant_id = null;
    const out = resolveKnockoutPlacements(bracket);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') expect(out.placements.find((p) => p.placement === 3)).toBeUndefined();
  });

  it('two dedicated third-place slots → ambiguous (fail closed)', () => {
    const bracket = fourPlayerWithThird();
    bracket.push(played(mk({ round: 2, bp: 2, p1: 12, p2: 14, winner: 12, thirdPlace: true }), 1, 14));
    const out = resolveKnockoutPlacements(bracket);
    expect(out.status).toBe('ambiguous');
    expect(out.placements).toEqual([]);
  });

  it('a bracket WITHOUT a third-place slot keeps the legacy heuristic (4-player with byes)', () => {
    const bye = mk({ round: 1, p1: 11, p2: null, winner: 11, targetRound: 2, targetBp: 0 });
    (bye as any).progression_meta = { is_bracket: true, bye: true, target_round: 2, target_bracket_position: 0, target_side: 'player1' };
    const semi = played(mk({ round: 1, p1: 12, p2: 13, winner: 12, targetRound: 2, targetBp: 1 }), 1, 13);
    const final = played(mk({ round: 2, p1: 11, p2: 12, winner: 11 }), 1, 12);
    const out = resolveKnockoutPlacements([bye, semi, final]);
    expect(out.status).toBe('resolved');
    if (out.status === 'resolved') {
      expect(out.placements).toContainEqual(placement(3, 13, 13));
    }
  });
});
