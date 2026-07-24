import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { generateKnockoutBracket, generateRoundRobinMatches, calculateElo, computeStandings } from '../domain/tournament-aggregate.js';
import type { Tournament } from '../domain/tournament-aggregate.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

export class TournamentService {
  async create(data: Tournament): Promise<number> {
    const id = await tournamentRepository.create(data);
    eventBusV2.emit('tournament.created', { tournamentId: id, name: data.name, format: data.format } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
    });
    return id;
  }

  async getOpenTournaments() {
    return tournamentRepository.findOpen();
  }

  async getTournament(id: number) {
    return tournamentRepository.findById(id);
  }

  async register(tournamentId: number, userId: number): Promise<number> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new Error('Tournament not found');
    if (t.current_participants >= t.max_participants) throw new Error('Tournament full');

    // Check for existing registration
    const participants = await tournamentRepository.findParticipants(tournamentId);
    if (participants.some((p: any) => p.user_id === userId)) throw new Error('Already registered');

    const participantId = await tournamentRepository.addParticipant({ tournamentId, userId, seed: participants.length + 1 } as any);
    await tournamentRepository.updateTournamentParticipants(tournamentId, participants.length + 1);

    eventBusV2.emit('registration.received', { tournamentId, userId, participantId } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });

    return participantId;
  }

  async generateBracket(tournamentId: number): Promise<void> {
    const participants = await tournamentRepository.findParticipants(tournamentId);
    const userIds = participants.filter((p: any) => p.status === 'approved' || p.status === 'registered').map((p: any) => p.user_id);
    const tournament = await tournamentRepository.findById(tournamentId);

    if (!tournament) throw new Error('Tournament not found');

    let matches: any[] = [];
    if (tournament.format === 'knockout' || tournament.format === 'single_elimination') {
      matches = generateKnockoutBracket(userIds);
    } else if (tournament.format === 'round_robin') {
      matches = generateRoundRobinMatches(userIds);
    }

    for (const m of matches) {
      await tournamentRepository.createMatch({ tournamentId, ...m, status: 'scheduled' } as any);
    }

    await tournamentRepository.updateTournamentStatus(tournamentId, 'in_progress');

    eventBusV2.emit('bracket.generated', { tournamentId, matchCount: matches.length } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
  }

  async updateScore(matchId: number, winnerId: number, score: string): Promise<void> {
    const match = await tournamentRepository.findMatches(matchId); // need findMatchById, using findMatches for now
    await tournamentRepository.updateMatchStatus(matchId, 'completed', winnerId, score);

    eventBusV2.emit('score.updated', { matchId, winnerId, score } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(matchId), aggregateVersion: 1,
    });

    // Update ELO ratings
    const [fullMatch] = await tournamentRepository.findMatches(matchId);
    if (fullMatch && fullMatch.player1_id && fullMatch.player2_id) {
      const rating1 = await tournamentRepository.getEloRating(fullMatch.player1_id, fullMatch.sport_id || 0);
      const rating2 = await tournamentRepository.getEloRating(fullMatch.player2_id, fullMatch.sport_id || 0);
      const rA = rating1?.rating || 1200;
      const rB = rating2?.rating || 1200;
      const result = winnerId === fullMatch.player1_id ? 'win' : 'loss';
      const { newRatingA, newRatingB } = calculateElo(rA, rB, result);

      await tournamentRepository.upsertEloRating({ userId: fullMatch.player1_id, sportId: fullMatch.sport_id || 0, rating: newRatingA, matchesPlayed: (rating1?.matchesPlayed || 0) + 1, kFactor: 32 });
      await tournamentRepository.upsertEloRating({ userId: fullMatch.player2_id, sportId: fullMatch.sport_id || 0, rating: newRatingB, matchesPlayed: (rating2?.matchesPlayed || 0) + 1, kFactor: 32 });

      eventBusV2.emit('ranking.updated', { userId: fullMatch.player1_id, newRating: newRatingA } as Record<string, unknown>, {
        aggregateType: 'ranking', aggregateId: String(fullMatch.player1_id), aggregateVersion: 1,
      });
    }
  }

  async getStandings(tournamentId: number) {
    const participants = await tournamentRepository.findParticipants(tournamentId);
    const matches = await tournamentRepository.findMatches(tournamentId);
    const userIds = participants.map((p: any) => p.user_id);
    return computeStandings(matches, userIds);
  }

  async getBracket(tournamentId: number) {
    return tournamentRepository.findMatches(tournamentId);
  }

  async getElo(userId: number, sportId: number) {
    return tournamentRepository.getEloRating(userId, sportId);
  }
}

export const tournamentService = new TournamentService();
