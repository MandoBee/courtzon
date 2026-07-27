import { describe, it, expect } from 'vitest';
import { generateKnockoutBracket, generateRoundRobinMatches, computeStandings } from '../domain/tournament-aggregate.js';

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
      expect(standings[0].player_id).toBe(1);
      expect(standings[0].wins).toBe(1);
      expect(standings[0].points).toBe(3);
    });
  });
});
