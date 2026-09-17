import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { generateKnockoutBracket, generateRoundRobinMatches, generateStageMatches, seededShuffle, type BracketSlot } from '../domain/tournament-aggregate.js';
import type { Tournament, TournamentRegistration, TournamentStage } from '../domain/tournament-aggregate.js';
import { validateTournamentTransition, validateRegistrationTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { matchResultRepository } from '../../match-result/infrastructure/match-result.repository.js';
import type { MatchFormatSnapshot } from '../../match/domain/match.types.js';

export class TournamentService {
  async create(data: Partial<Tournament>, creatorId: number): Promise<Tournament> {
    if (data.code) {
      const existing = await tournamentRepository.findByCode(data.code);
      if (existing) throw new ConflictError('Tournament code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    // Group 5A — a tournament that declares a Match Format but no Rule Set, or
    // vice versa, is rejected at creation: generated Matches must freeze both.
    if ((data.match_format_id == null) !== (data.rule_set_id == null)) {
      throw new ConflictError('Tournament must configure both a Match Format and a Rule Set, or neither', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    if (data.match_format_id != null && data.rule_set_id != null) {
      await this.assertMatchFormatRuleSetPair(data.match_format_id, data.rule_set_id);
    }
    // Deterministic draw seed: default to creation timestamp (stable, not random).
    const drawSeed = data.draw_seed ?? Date.now();
    const id = await tournamentRepository.create({ ...data, creator_id: creatorId, draw_seed: drawSeed });
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
      throw new ConflictError('Registration is not open for this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }

    const existing = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    if (existing.some((r) => r.player_id === userId)) {
      throw new ConflictError('Already registered in this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS);
    }

    const cap = t.max_participants || 0;
    const confirmedCount = existing.filter((r) => r.status === 'confirmed').length;
    const isFull = cap > 0 && confirmedCount >= cap;
    if (isFull) {
      throw new ConflictError('Tournament is at full capacity', ErrorCodes.TOURNAMENT_CAPACITY_FULL);
    }

    // Group 5A — entry-fee integration uses the SHARED payment capability.
    // Registration is created 'registered'/'unpaid'; the payment reference is
    // recorded via the shared payment flow and this service exposes
    // markRegistrationPaid (below). A paid entry-fee tournament requires the
    // player to settle before confirmation (see confirmRegistration).
    const paymentRequired = Number(t.entry_fee ?? 0) > 0;
    const status = paymentRequired ? 'registered' : 'registered';
    const seed = existing.length + 1;
    const id = await tournamentRepository.createRegistration({
      tournament_id: tournamentId,
      user_id: userId,
      player_id: userId,
      team_id: teamId,
      seed,
      status,
      payment_status: 'unpaid',
    });

    eventBusV2.emit('registration.received', { tournamentId, userId, registrationId: id, status, paymentRequired } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });

    const created = await tournamentRepository.getRegistrationById(id);
    return created!;
  }

  /** Group 5A — record that an entry fee was settled via the shared Payment capability. */
  async markRegistrationPaid(regId: number, actorId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    await tournamentRepository.updateRegistrationPaymentStatus(regId, 'paid');
    await recordAudit({ actorId, action: 'tournament.registration.paid', entityType: 'tournament_registration', entityId: regId, afterState: { payment_status: 'paid' } });
  }

  async cancelRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'withdrawn');
    await tournamentRepository.updateRegistrationStatus(regId, 'withdrawn');
  }

  async confirmRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'confirmed');
    const t = await this.getById(reg.tournament_id);
    // Entry-fee tournaments require settlement (shared payment) before confirmation.
    if (Number(t.entry_fee ?? 0) > 0 && reg.payment_status !== 'paid') {
      throw new ConflictError('Entry fee must be paid before confirmation', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }
    await tournamentRepository.updateRegistrationStatus(regId, 'confirmed');
  }

  async generateGroups(tournamentId: number, groupSize: number, advanceCount: number): Promise<void> {
    const t = await this.getById(tournamentId);
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) throw new ConflictError('No confirmed registrations', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);

    const numGroups = Math.ceil(confirmed.length / groupSize);
    // Group 5A — deterministic seeded shuffle (draw_seed), not Math.random().
    const seed = t.draw_seed ?? Date.now();
    const shuffled = seededShuffle(confirmed, seed);

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
    if (groups.length === 0) throw new ConflictError('No groups exist. Generate groups first.', ErrorCodes.TOURNAMENT_GROUP_NOT_FOUND);

    const t = await this.getById(tournamentId);
    const formatCtx = await this.resolveMatchFormatContext(t);

    for (const group of groups) {
      const members = await tournamentRepository.findGroupMembers(group.id!);
      const regIds = members.map((m) => m.registration_id);
      const regs = await tournamentRepository.findRegistrationsByTournament(tournamentId);
      const idToPlayer = new Map<number, number>();
      for (const reg of regs) { if (reg.id != null && reg.player_id != null) idToPlayer.set(reg.id, reg.player_id); }

      const matches = generateRoundRobinMatches(regIds);
      for (const m of matches) {
        const p1 = idToPlayer.get(m.player1Id);
        const p2 = idToPlayer.get(m.player2Id);
        if (p1 == null || p2 == null) continue;
        const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, {
          round: m.round,
          player1Id: p1,
          player2Id: p2,
        });
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          group_id: group.id,
          round: m.round,
          match_id: sharedMatch.id,
          player1_id: p1,
          player2_id: p2,
          status: 'scheduled',
        });
      }
    }
  }

  async generateBracket(tournamentId: number): Promise<void> {
    const t = await this.getById(tournamentId);
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    const userIds = confirmed.map((r) => r.player_id!).filter(Boolean);
    if (userIds.length < 2) throw new ConflictError('Need at least 2 participants', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);

    // Deterministic draw from the persisted seed (reproducible + auditable).
    const seed = t.draw_seed ?? Date.now();
    const seededBy = new Map<number, number>();
    for (const reg of confirmed) {
      if (reg.player_id != null && reg.seed != null) seededBy.set(reg.player_id, reg.seed);
    }

    const formatCtx = await this.resolveMatchFormatContext(t);

    let slots: BracketSlot[] = [];
    if (t.format === 'knockout') {
      slots = generateKnockoutBracket(userIds, { seed, seededBy });
    } else if (t.format === 'round_robin') {
      slots = generateRoundRobinMatches(userIds).map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
    } else if (t.format === 'group_stage_knockout') {
      const groups = await tournamentRepository.findGroups(tournamentId);
      if (groups.length > 0) {
        for (const group of groups) {
          const members = await tournamentRepository.findGroupMembers(group.id!);
          const regIds = members.map((m) => m.registration_id);
          const regs = await tournamentRepository.findRegistrationsByTournament(tournamentId);
          const idToPlayer = new Map<number, number>();
          for (const reg of regs) { if (reg.id != null && reg.player_id != null) idToPlayer.set(reg.id, reg.player_id); }
          const rr = generateRoundRobinMatches(regIds);
          for (const m of rr) {
            const p1 = idToPlayer.get(m.player1Id);
            const p2 = idToPlayer.get(m.player2Id);
            if (p1 == null || p2 == null) continue;
            const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, { round: m.round, player1Id: p1, player2Id: p2 });
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              group_id: group.id,
              round: m.round,
              match_id: sharedMatch.id,
              player1_id: p1,
              player2_id: p2,
              status: 'scheduled',
            });
          }
        }
        return;
      }
      slots = generateKnockoutBracket(userIds, { seed, seededBy });
    } else if (t.format === 'mixed') {
      slots = await this.generateMixedStages(t, formatCtx, userIds, seed, seededBy);
    } else {
      slots = generateStageMatches(t.format ?? 'round_robin', userIds, { seed, seededBy });
    }

    for (const slot of slots) {
      // A round-1 BYE is explicit metadata — no fake participant, no Match.
      if (slot.round === 1 && slot.bye) {
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          round: slot.round,
          match_number: 0,
          bracket_position: slot.bracketPosition,
          player1_id: slot.player1Id ?? null,
          player2_id: null,
          status: 'scheduled',
        });
        continue;
      }
      // Later-round bracket slots are progression placeholders — the participants
      // are determined by earlier Match results, not a direct draw. They are
      // created as metadata-only (no shared Match) until progression fills them.
      if (slot.player1Id == null || slot.player2Id == null) {
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          round: slot.round,
          bracket_position: slot.bracketPosition,
          player1_id: slot.player1Id ?? null,
          player2_id: slot.player2Id ?? null,
          status: 'scheduled',
        });
        continue;
      }
      const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, slot);
      await tournamentRepository.createMatch({
        tournament_id: tournamentId,
        round: slot.round,
        bracket_position: slot.bracketPosition,
        match_id: sharedMatch.id,
        player1_id: slot.player1Id ?? null,
        player2_id: slot.player2Id ?? null,
        status: 'scheduled',
      });
    }
  }

  /**
   * Group 5A — resolve the frozen Match Format + Rule Set context a tournament
   * generated Match must use. Falls back to the sport's active default when the
   * tournament did not explicitly configure a Match Format/Rule Set.
   */
  private async resolveMatchFormatContext(t: Tournament): Promise<{ formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }> {
    if (t.match_format_id != null && t.rule_set_id != null) {
      const fmt = await matchResultRepository.findFormatById(t.match_format_id);
      if (!fmt) throw new ConflictError('Configured Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      const ruleSet = await matchResultRepository.findRuleSetById(t.rule_set_id);
      if (!ruleSet) throw new ConflictError('Configured Rule Set not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      return {
        formatId: fmt.formatId,
        ruleSetId: t.rule_set_id,
        formatSnapshot: { formatId: fmt.formatId, formatType: fmt.formatType, playersPerSide: fmt.playersPerSide, name: fmt.name },
        ruleSnapshot: (typeof ruleSet.rules === 'string' ? JSON.parse(ruleSet.rules) : ruleSet.rules) as Record<string, unknown>,
      };
    }
    // Fallback: the sport's default active format + its active rule set.
    const sportId = t.sport_id;
    if (sportId == null) throw new ConflictError('Tournament has no sport configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const def = await matchResultRepository.resolveDefaultFormatForSport(sportId);
    if (!def) throw new ConflictError('No active sport format configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const ruleSet = await matchResultRepository.findActiveRuleSetForFormat(def.formatId);
    if (!ruleSet) throw new ConflictError('No active rule set configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    return {
      formatId: def.formatId,
      ruleSetId: ruleSet.ruleSetId,
      formatSnapshot: { formatId: def.formatId, formatType: def.formatType, playersPerSide: def.playersPerSide, name: def.name },
      ruleSnapshot: (typeof ruleSet.rules === 'string' ? JSON.parse(ruleSet.rules) : ruleSet.rules) as Record<string, unknown>,
    };
  }

/** Group 5A — validate that a configured Match Format belongs to the same sport as its Rule Set. */
  private async assertMatchFormatRuleSetPair(matchFormatId: number, ruleSetId: number): Promise<void> {
    const fmt = await matchResultRepository.findFormatById(matchFormatId);
    if (!fmt) throw new ConflictError('Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const ruleSet = await matchResultRepository.findRuleSetById(ruleSetId);
    if (!ruleSet) throw new ConflictError('Rule Set not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    if (fmt.sportId !== ruleSet.formatId && ruleSet.formatId !== fmt.formatId) {
      throw new ConflictError('Match Format and Rule Set must belong to the same sport configuration', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
  }

  /** Group 5A — create the shared Match for a bracket slot and return it. */
  private async createTournamentMatchFromSlot(t: Tournament, formatCtx: { formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }, slot: BracketSlot): Promise<any> {
    const { matchService } = await import('../../match/application/services/match.service.js');
    const participants = [
      { userId: slot.player1Id!, side: 'home' as const, teamIndex: 0, role: 'host' as const },
      { userId: slot.player2Id!, side: 'away' as const, teamIndex: 1, role: 'joiner' as const },
    ].filter((p) => p.userId != null);
    if (participants.length < 2) throw new ConflictError('A tournament match requires two participants', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    return matchService.createForTournament({
      tournamentId: t.id!,
      sportId: t.sport_id!,
      formatId: formatCtx.formatId,
      ruleSetId: formatCtx.ruleSetId,
      formatSnapshot: formatCtx.formatSnapshot,
      ruleSnapshot: formatCtx.ruleSnapshot,
      participants,
    });
  }

  /** Group 5A — MIXED tournaments: per-stage progression (round-robin -> knockout). */
  private async generateMixedStages(t: Tournament, formatCtx: { formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }, userIds: number[], seed: number, seededBy: Map<number, number>): Promise<BracketSlot[]> {
    const stages = await tournamentRepository.findStages(t.id!);
    if (stages.length === 0) {
      // No explicit stages — default to a single round-robin stage.
      return generateRoundRobinMatches(userIds).map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
    }
    const slots: BracketSlot[] = [];
    let offset = 0;
    for (const stage of stages) {
      const stageFormat = stage.progression_format as Tournament['format'];
      const stageCtx = stage.match_format_id != null && stage.rule_set_id != null
        ? await this.resolveMatchFormatContext({ ...t, match_format_id: stage.match_format_id, rule_set_id: stage.rule_set_id })
        : formatCtx;
      if (stageFormat === 'knockout') {
        const knock = generateKnockoutBracket(userIds, { seed: seed + offset, seededBy });
        slots.push(...knock.map((s) => ({ ...s, round: s.round + offset })));
      } else {
        const rr = generateRoundRobinMatches(userIds).map((m) => ({ round: m.round + offset, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
        slots.push(...rr);
      }
      offset += 100;
    }
    return slots;
  }

  async recordMatchResult(matchId: number, winnerId: number, homeScore?: string, awayScore?: string, scoreDetails?: string, enteredBy?: number): Promise<void> {
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
      await tournamentRepository.recalculateStandings(match.tournament_id, match.group_id ?? undefined);
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
    await this.emitRefereeAssigned(match, refereeId, 'tournament');
  }

  /** Emit referee:assigned with the referee's user_id (non-fatal). */
  private async emitRefereeAssigned(match: any, refereeId: number, matchType: 'league' | 'tournament'): Promise<void> {
    try {
      const [rows] = await getPool().execute<any[]>(
        'SELECT user_id FROM referees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [refereeId],
      );
      const userId = rows[0]?.user_id;
      if (!userId) return;
      eventBusV2.emit('referee:assigned', {
        matchId: Number(match.id),
        refereeId,
        userId,
        matchType,
      } as any);
    } catch (err) {
      // Notification emission is non-fatal; assignment already persisted.
      console.error('emitRefereeAssigned failed', err);
    }
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

  /** Group 5A — MIXED tournament stages. */
  async createStage(tournamentId: number, data: Partial<TournamentStage>): Promise<TournamentStage> {
    const t = await this.getById(tournamentId);
    if (data.match_format_id != null && data.rule_set_id != null) {
      await this.assertMatchFormatRuleSetPair(data.match_format_id, data.rule_set_id);
    }
    if (data.match_format_id != null && data.rule_set_id == null) {
      throw new ConflictError('A stage with a Match Format must also configure a Rule Set', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const id = await tournamentRepository.createStage({ ...data, tournament_id: tournamentId });
    const stage = (await tournamentRepository.findStages(tournamentId)).find((s) => s.id === id);
    if (!stage) throw new NotFoundError('Stage', ErrorCodes.TOURNAMENT_GROUP_NOT_FOUND);
    eventBusV2.emit('tournament.stage-created', { tournamentId, stageId: id, name: stage.name, progressionFormat: stage.progression_format } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
    return stage;
  }

  async getStages(tournamentId: number) {
    return tournamentRepository.findStages(tournamentId);
  }
}

export const tournamentService = new TournamentService();
