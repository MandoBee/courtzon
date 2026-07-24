import { describe, it, expect } from 'vitest';
import { generateKnockoutBracket, generateRoundRobinMatches, calculateElo, computeStandings } from '../domain/tournament-aggregate.js';

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

  describe('ELO Calculation', () => {
    it('favorite loses fewer points on upset', () => {
      const result = calculateElo(1600, 1400, 'loss', 32);
      expect(result.newRatingA).toBeLessThan(1600);
      expect(result.newRatingB).toBeGreaterThan(1400);
      const ratingChange = 1600 - result.newRatingA;
      expect(ratingChange).toBeLessThan(32);
    });

    it('draw preserves ratings approximately', () => {
      const result = calculateElo(1500, 1500, 'draw', 32);
      expect(Math.abs(result.newRatingA - 1500)).toBeLessThanOrEqual(16);
      expect(Math.abs(result.newRatingB - 1500)).toBeLessThanOrEqual(16);
    });
  });

  describe('Standings', () => {
    it('computes standings from completed matches', () => {
      const matches = [
        { tournamentId: 1, round: 1, player1Id: 1, player2Id: 2, winnerId: 1, status: 'completed' as const, score: '6-4', aggregateVersion: 1 },
        { tournamentId: 1, round: 1, player1Id: 3, player2Id: 4, winnerId: 3, status: 'completed' as const, score: '6-2', aggregateVersion: 1 },
      ];
      const standings = computeStandings(matches, [1, 2, 3, 4]);
      expect(standings[0].participantId).toBe(3); // better game difference (6-2 vs 6-4)
      expect(standings[0].wins).toBe(1);
      expect(standings[0].points).toBe(3);
    });
  });
});
