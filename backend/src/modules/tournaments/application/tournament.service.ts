import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { generateKnockoutBracket, generateRoundRobinMatches, computeStandings } from '../domain/tournament-aggregate.js';
import type { Tournament, TournamentRegistration } from '../domain/tournament-aggregate.js';
import { validateTournamentTransition, validateRegistrationTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { recordAudit } from '../../audit-log/index.js';

export class TournamentService {
  async create(data: Partial<Tournament>): Promise<Tournament> {
    const existing = await tournamentRepository.findByCode(data.code!);
    if (existing) throw new ConflictError('Tournament code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    const id = await tournamentRepository.create(data);
    const tournament = await tournamentRepository.findById(id);
    eventBusV2.emit('tournament.created', { tournamentId: id, name: data.name, format: data.format } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
    });
    return tournament!;
  }

  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string; format?: string; category?: string; sport_id?: number;
  }) {
    return tournamentRepository.list(filters);
  }

  async getById(id: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(id);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    return t;
  }

  async getByCode(code: string): Promise<Tournament | null> {
    return tournamentRepository.findByCode(code);
  }

  async update(id: number, data: Partial<Tournament>): Promise<Tournament> {
    await this.getById(id);
    if (data.code) {
      const existing = await tournamentRepository.findByCode(data.code);
      if (existing && existing.id !== id) throw new ConflictError('Tournament code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    await tournamentRepository.update(id, data);
    return this.getById(id);
  }

  async updateStatus(id: number, status: string): Promise<Tournament> {
    const t = await this.getById(id);
    validateTournamentTransition(t.status, status as any);
    await tournamentRepository.updateStatus(id, status);
    return this.getById(id);
  }

  async publish(id: number) { return this.updateStatus(id, 'published'); }
  async openRegistration(id: number) { return this.updateStatus(id, 'registration_open'); }
  async closeRegistration(id: number) { return this.updateStatus(id, 'registration_closed'); }
  async startTournament(id: number) { return this.updateStatus(id, 'running'); }
  async complete(id: number) { return this.updateStatus(id, 'completed'); }
  async cancel(id: number) { return this.updateStatus(id, 'cancelled'); }
  async archive(id: number) { return this.updateStatus(id, 'archived'); }

  async getOpenTournaments() {
    return tournamentRepository.findOpen();
  }

  async register(tournamentId: number, userId: number, teamId?: number): Promise<TournamentRegistration> {
    const t = await this.getById(tournamentId);
    if (t.status !== 'registration_open' && t.status !== 'published') {
      throw new ConflictError('Registration is not open for this tournament', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);
    }

    const existing = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    if (existing.some((r) => r.user_id === userId)) {
      throw new ConflictError('Already registered in this tournament', ErrorCodes.ACADEMY_ENROLLMENT_EXISTS);
    }

    const cap = t.max_players || 0;
    const confirmedCount = existing.filter((r) => r.status === 'confirmed').length;
    const isFull = cap > 0 && confirmedCount >= cap;

    const status = isFull ? 'waiting' : 'pending';
    let waitingOrder: number | undefined;
    if (isFull) {
      waitingOrder = await tournamentRepository.getNextWaitingOrder(tournamentId);
    }

    const seed = existing.length + 1;
    const id = await tournamentRepository.createRegistration({
      tournament_id: tournamentId,
      user_id: userId,
      team_id: teamId,
      seed,
      status,
      waiting_order: waitingOrder,
    });

    eventBusV2.emit('registration.received', { tournamentId, userId, registrationId: id, status } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });

    const created = await tournamentRepository.getRegistrationById(id);
    return created!;
  }

  async cancelRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'cancelled');
    await tournamentRepository.updateRegistrationStatus(regId, 'cancelled');
  }

  async confirmRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'confirmed');
    await tournamentRepository.updateRegistrationStatus(regId, 'confirmed');
    // Promote next waiting registration if capacity allows
    const waiting = (await tournamentRepository.findRegistrationsByTournament(reg.tournament_id))
      .filter((r) => r.status === 'waiting')
      .sort((a, b) => (a.waiting_order || 0) - (b.waiting_order || 0));
    const t = await this.getById(reg.tournament_id);
    const cap = t.max_players || 0;
    const confirmed = await tournamentRepository.getConfirmedCount(reg.tournament_id);
    if (waiting.length > 0 && confirmed < cap) {
      await tournamentRepository.updateRegistrationStatus(waiting[0].id!, 'confirmed');
    }
  }

  async generateGroups(tournamentId: number, groupSize: number, advanceCount: number): Promise<void> {
    const t = await this.getById(tournamentId);
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) throw new ConflictError('No confirmed registrations', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);

    const numGroups = Math.ceil(confirmed.length / groupSize);
    const shuffled = [...confirmed].sort(() => Math.random() - 0.5);

    for (let g = 0; g < numGroups; g++) {
      const groupName = String.fromCharCode(65 + g);
      const groupId = await tournamentRepository.createGroup({
        tournament_id: tournamentId,
        name: groupName,
        advance_count: advanceCount,
      });
      const members = shuffled.slice(g * groupSize, (g + 1) * groupSize);
      for (let s = 0; s < members.length; s++) {
        await tournamentRepository.addGroupMember({
          group_id: groupId,
          registration_id: members[s].id,
          seed: s + 1,
        });
      }
    }
  }

  async generateFixtures(tournamentId: number): Promise<void> {
    const groups = await tournamentRepository.findGroups(tournamentId);
    if (groups.length === 0) throw new ConflictError('No groups exist. Generate groups first.', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);

    for (const group of groups) {
      const members = await tournamentRepository.findGroupMembers(group.id!);
      const regIds = members.map((m) => m.registration_id);
      const matches = generateRoundRobinMatches(regIds);
      for (const m of matches) {
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          group_id: group.id,
          round: m.round,
          player1_id: m.player1Id,
          player2_id: m.player2Id,
          status: 'scheduled',
        });
      }
    }
  }

  async generateBracket(tournamentId: number): Promise<void> {
    const t = await this.getById(tournamentId);
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    const userIds = confirmed.map((r) => r.user_id!).filter(Boolean);
    if (userIds.length < 2) throw new ConflictError('Need at least 2 participants', ErrorCodes.ACADEMY_CAPACITY_EXCEEDED);

    let matches: any[] = [];
    if (t.format === 'knockout') {
      matches = generateKnockoutBracket(userIds);
    } else if (t.format === 'round_robin') {
      matches = generateRoundRobinMatches(userIds);
    } else if (t.format === 'group_stage_knockout') {
      const groups = await tournamentRepository.findGroups(tournamentId);
      if (groups.length > 0) {
        for (const group of groups) {
          const members = await tournamentRepository.findGroupMembers(group.id!);
          const regIds = members.map((m) => m.registration_id);
          const rr = generateRoundRobinMatches(regIds);
          for (const m of rr) {
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              group_id: group.id,
              round: m.round,
              player1_id: m.player1Id,
              player2_id: m.player2Id,
              status: 'scheduled',
            });
          }
        }
        return;
      }
      matches = generateKnockoutBracket(userIds);
    }

    for (const m of matches) {
      await tournamentRepository.createMatch({
        tournament_id: tournamentId,
        round: m.round,
        bracket_position: m.bracketPosition,
        player1_id: m.player1Id ?? null,
        player2_id: m.player2Id ?? null,
        status: 'scheduled',
      } as any);
    }
  }

  async recordMatchResult(matchId: number, winnerId: number, homeScore?: number, awayScore?: number, scoreDetails?: string, enteredBy?: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);

    await tournamentRepository.createMatchResult({
      match_id: matchId,
      winner_id: winnerId,
      home_score: homeScore,
      away_score: awayScore,
      score_details: scoreDetails,
      entered_by: enteredBy!,
    });

    await tournamentRepository.updateMatchStatus(matchId, 'completed', winnerId);

    if (match.tournament_id) {
      await tournamentRepository.recalculateStandings(match.tournament_id, match.group_id);
    }

    eventBusV2.emit('match.result.recorded', { matchId, winnerId } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(match.tournament_id), aggregateVersion: 1,
    });
  }

  async assignCourt(matchId: number, resourceId: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await tournamentRepository.assignCourt(matchId, resourceId);
  }

  async assignReferee(matchId: number, refereeId: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await tournamentRepository.assignReferee(matchId, refereeId);
  }

  async recalculateStandings(tournamentId: number): Promise<void> {
    await this.getById(tournamentId);
    await tournamentRepository.recalculateStandings(tournamentId);
  }

  async getDashboard() {
    return tournamentRepository.getDashboard();
  }

  async getBracket(tournamentId: number) {
    return tournamentRepository.findMatches(tournamentId);
  }

  async getStandings(tournamentId: number, groupId?: number) {
    return tournamentRepository.getStandings(tournamentId, groupId);
  }

  async getMatches(tournamentId: number) {
    return tournamentRepository.findMatches(tournamentId);
  }

  async getGroups(tournamentId: number) {
    return tournamentRepository.findGroups(tournamentId);
  }

  async getRegistrations(tournamentId: number) {
    return tournamentRepository.findRegistrationsByTournament(tournamentId);
  }
}

export const tournamentService = new TournamentService();
