import { describe, it, expect } from 'vitest';
import { generateKnockoutBracket, normaliseBracketTargets } from '../domain/tournament-aggregate.js';

/**
 * G9-A — Round-1 progression target wiring (single bracket-topology source).
 *
 * These tests assert the EXACT topology produced by the shared helper
 * (normaliseBracketTargets), which is the single source of truth consumed by
 * BOTH the legacy generateBracket path and the G8 locked-draw generation path.
 */
describe('G9-A — knockout bracket target topology (normaliseBracketTargets)', () => {
  function knockout(ids: number[]) {
    return normaliseBracketTargets(generateKnockoutBracket(ids), ids.length);
  }

  function byRound(slots: any[], round: number) {
    return slots
      .filter((s) => s.round === round)
      .sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0));
  }

  it('8 participants — Round-1 slots wire to the correct Round-2 position and side', () => {
    const slots = knockout([1, 2, 3, 4, 5, 6, 7, 8]);

    const r1 = byRound(slots, 1);
    expect(r1.map((s) => s.player1Id)).toEqual([1, 3, 5, 7]);
    expect(r1.map((s) => s.player2Id)).toEqual([2, 4, 6, 8]);
    expect(r1.map((s) => s.bye ?? false)).toEqual([false, false, false, false]);
    // M1/M2 winners feed Round-2 position 0; M3/M4 feed Round-2 position 1.
    expect(r1.map((s) => s.targetRound)).toEqual([2, 2, 2, 2]);
    expect(r1.map((s) => s.targetBracketPosition)).toEqual([0, 0, 1, 1]);
    // Upper feed (even position) → player1; lower feed (odd position) → player2.
    expect(r1.map((s) => s.targetSide)).toEqual(['player1', 'player2', 'player1', 'player2']);

    const r2 = byRound(slots, 2);
    expect(r2.map((s) => s.targetRound)).toEqual([3, 3]);
    expect(r2.map((s) => s.targetBracketPosition)).toEqual([0, 0]);
    expect(r2.map((s) => s.targetSide)).toEqual(['player1', 'player2']);

    const fin = byRound(slots, 3);
    expect(fin).toHaveLength(1);
    expect(fin[0].targetRound).toBeUndefined();
    expect(fin[0].targetBracketPosition).toBeUndefined();
  });

  it('5 participants — byes and padding slots are wired into Round 2, Round 2 into the Final', () => {
    const slots = knockout([1, 2, 3, 4, 5]);

    const r1 = byRound(slots, 1);
    // pos 0: 1v2, pos 1: 3v4, pos 2: 5 + BYE (lone), pos 3: empty padding BYE.
    expect(r1.map((s) => s.bye ?? false)).toEqual([false, false, true, true]);
    expect(r1.map((s) => s.targetRound)).toEqual([2, 2, 2, 2]);
    expect(r1.map((s) => s.targetBracketPosition)).toEqual([0, 0, 1, 1]);
    expect(r1.map((s) => s.targetSide)).toEqual(['player1', 'player2', 'player1', 'player2']);

    const r2 = byRound(slots, 2);
    expect(r2.map((s) => s.targetRound)).toEqual([3, 3]);
    expect(r2.map((s) => s.targetBracketPosition)).toEqual([0, 0]);

    const fin = byRound(slots, 3);
    expect(fin).toHaveLength(1);
    expect(fin[0].targetRound).toBeUndefined();
  });

  it('6 and 7 participants — padding is placed in the final Round-1 slot(s)', () => {
    for (const n of [6, 7]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const slots = knockout(ids);
      const r1 = byRound(slots, 1);
      expect(r1).toHaveLength(4);
      // Every Round-1 slot must be wired (bye or not) — never null target wiring.
      expect(r1.every((s) => s.targetRound === 2)).toBe(true);
      expect(r1.map((s) => s.targetBracketPosition)).toEqual([0, 0, 1, 1]);
    }
  });

  it('9 participants — topology scales to the next power of two with correct wiring', () => {
    const ids = Array.from({ length: 9 }, (_, i) => i + 1);
    const slots = knockout(ids);
    const r1 = byRound(slots, 1);
    expect(r1).toHaveLength(8);
    expect(r1.every((s) => s.targetRound === 2)).toBe(true);
    expect(r1.map((s) => s.targetBracketPosition)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const r2 = byRound(slots, 2);
    expect(r2.map((s) => s.targetRound)).toEqual([3, 3, 3, 3]);
    expect(r2.map((s) => s.targetBracketPosition)).toEqual([0, 0, 1, 1]);
    const r3 = byRound(slots, 3);
    expect(r3.map((s) => s.targetRound)).toEqual([4, 4]);
    expect(r3.map((s) => s.targetBracketPosition)).toEqual([0, 0]);
    const fin = byRound(slots, 4);
    expect(fin).toHaveLength(1);
    expect(fin[0].targetRound).toBeUndefined();
  });

  it('2 participants — Round 1 is the Final: no target wiring is introduced', () => {
    const slots = knockout([1, 2]);
    expect(slots).toHaveLength(1);
    expect(slots[0].round).toBe(1);
    expect(slots[0].targetRound).toBeUndefined();
    expect(slots[0].targetBracketPosition).toBeUndefined();
  });

  it('is deterministic — identical input yields identical topology', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = normaliseBracketTargets(generateKnockoutBracket(ids), ids.length);
    const b = normaliseBracketTargets(generateKnockoutBracket(ids), ids.length);
    expect(a).toEqual(b);
  });
});