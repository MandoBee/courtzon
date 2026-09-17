import { describe, it, expect } from 'vitest';
import { generateKnockoutBracket, generateRoundRobinMatches, generateStageMatches, seededShuffle, createSeededRng, computeStandings } from '../domain/tournament-aggregate.js';

describe('Tournament Aggregate', () => {
  describe('Knockout Bracket', () => {
    it('generates correct number of first-round matches', () => {
      const matches = generateKnockoutBracket([1, 2, 3, 4]);
      expect(matches.filter(m => m.round === 1)).toHaveLength(2);
    });

    it('handles non-power-of-2 participant count', () => {
      const matches = generateKnockoutBracket([1, 2, 3]);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('assigns players to correct positions', () => {
      const matches = generateKnockoutBracket([1, 2, 3, 4]);
      const firstRound = matches.filter(m => m.round === 1);
      expect(firstRound[0].player1Id).toBe(1);
      expect(firstRound[0].player2Id).toBe(2);
      expect(firstRound[1].player1Id).toBe(3);
      expect(firstRound[1].player2Id).toBe(4);
    });
  });

  describe('Round Robin', () => {
    it('generates all pairings', () => {
      const matches = generateRoundRobinMatches([1, 2, 3, 4]);
      expect(matches).toHaveLength(6); // n*(n-1)/2
    });

    it('does not create self-matches', () => {
      const matches = generateRoundRobinMatches([1, 2]);
      expect(matches).toHaveLength(1);
      expect(matches[0].player1Id).not.toBe(matches[0].player2Id);
    });
  });

  describe('Standings', () => {
    it('computes standings from completed matches', () => {
      const matches = [
        { tournament_id: 1, round: 1, player1_id: 1, player2_id: 2, winner_id: 1, status: 'completed' as const },
        { tournament_id: 1, round: 1, player1_id: 3, player2_id: 4, winner_id: 3, status: 'completed' as const },
      ];
      const standings = computeStandings(matches as any, [1, 2, 3, 4]);
      expect(standings[0].registration_id).toBe(1);
      expect(standings[0].wins).toBe(1);
      expect(standings[0].points).toBe(3);
    });
  });

  describe('Group 5A — deterministic seeded draws', () => {
    it('the same seed always produces the same bracket (reproducible)', () => {
      const a = generateKnockoutBracket([1, 2, 3, 4], { seed: 42 });
      const b = generateKnockoutBracket([1, 2, 3, 4], { seed: 42 });
      expect(a).toEqual(b);
    });

    it('a different seed can produce a different bracket (draw not hardcoded)', () => {
      const a = generateKnockoutBracket([1, 2, 3, 4], { seed: 1, seededBy: new Map([[1, 2], [2, 1]]) });
      const b = generateKnockoutBracket([1, 2, 3, 4], { seed: 1, seededBy: new Map([[1, 1], [2, 2]]) });
      // Seeding explicitly reorders — a vs b differ because seeds differ.
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it('explicit seeds sort participants authoritatively (registration order is not implicit seed)', () => {
      const seededBy = new Map([[4, 1], [2, 2], [3, 3], [1, 4]]);
      const bracket = generateKnockoutBracket([1, 2, 3, 4], { seed: 7, seededBy });
      const firstRound = bracket.filter((m) => m.round === 1);
      expect(firstRound[0].player1Id).toBe(4); // seed 1
      expect(firstRound[0].player2Id).toBe(2); // seed 2
    });

    it('a bye is explicit metadata, never a fake participant', () => {
      const bracket = generateKnockoutBracket([1, 2, 3], { seed: 1 });
      const firstRound = bracket.filter((m) => m.round === 1);
      const byeSlot = firstRound.find((m) => m.bye === true);
      expect(byeSlot).toBeTruthy();
      expect(byeSlot!.player2Id).toBeUndefined();
      expect(byeSlot!.player1Id).toBe(3);
    });

    it('seededShuffle is deterministic', () => {
      expect(seededShuffle([1, 2, 3, 4], 9)).toEqual(seededShuffle([1, 2, 3, 4], 9));
      expect(createSeededRng(5)()).toBe(createSeededRng(5)());
    });
  });

  describe('Group 5A — round-robin schedule', () => {
    it('produces one pairing per round per participant (no repeats of same opponent)', () => {
      const matches = generateRoundRobinMatches([1, 2, 3, 4]);
      // 4 players → 3 rounds × 2 pairings = 6 matches, all distinct opponents.
      expect(matches).toHaveLength(6);
      const pairs = matches.map((m) => [m.player1Id, m.player2Id].sort((x, y) => x - y).join('-'));
      expect(new Set(pairs).size).toBe(6);
    });

    it('handles an odd participant count (implicit bye, no fake player)', () => {
      const matches = generateRoundRobinMatches([1, 2, 3]);
      // 3 players → 3 rounds × 1 real pairing each = 3 matches.
      expect(matches).toHaveLength(3);
      for (const m of matches) {
        expect(m.player1Id).not.toBe(m.player2Id);
      }
    });
  });

  describe('Group 5A — mixed stages', () => {
    it('generateStageMatches keeps round-robin vs knockout distinct', () => {
      const rr = generateStageMatches('round_robin', [1, 2, 3, 4]);
      const ko = generateStageMatches('knockout', [1, 2, 3, 4], { seed: 1 });
      // Round robin produces 6 pairings across rounds; knockout produces a
      // bracket with round-1 pairings + later rounds.
      expect(rr.length).toBeGreaterThanOrEqual(6);
      expect(ko.filter((m) => m.round === 1).length).toBeGreaterThan(0);
      expect(ko.some((m) => m.round > 1)).toBe(true);
    });
  });
});
