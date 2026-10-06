import { getPool } from '../../../database/mysql.js';
import { runProvidedTransaction } from '../../../database/database.transaction.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { isTournamentParticipantProgressionEligible, generateRoundRobinMatches } from '../domain/tournament-aggregate.js';
import { planGroupMemberCounts, assignGroupsDeterministic } from '../domain/group-stage.js';
import type { GskConfiguration } from '../domain/gsk-config.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { matchService } from '../../match/application/services/match.service.js';
import { tournamentService } from './tournament.service.js';
import { competitionService } from './competition.service.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';

interface StageContext {
  participantId: number;
  registrationId: number;
}

/** Lifecycle window in which a Group Stage may be generated (mirrors the draw/match window). */
const GROUP_STAGE_STATUSES = new Set(['registration_closed', 'running']);

/**
 * Step 3B-2 — Group Stage engine.
 *
 * Converts the ACTIVE tournament participants of a competition into exactly
 * `groupCount` deterministic groups, persists group membership, and generates a
 * complete Round Robin schedule per group with every match carrying
 * `stage_id` + `group_id`.
 *
 * Hard boundary: this service STOPS at the group stage. It never computes
 * qualification, never builds best-third runners, never creates a knockout
 * stage or knockout matches (Step 3B-3).
 *
 * Safety:
 *  - transactional (FOR UPDATE on the tournament row, in-transaction re-check)
 *  - idempotent (a second run for the same tournament+competition is rejected)
 *  - deterministic (seededShuffle with the tournament draw_seed)
 */
export class GroupStageService {
  async generateGroupStage(
    tournamentId: number,
    stageId: number,
    actorId: number,
    competitionId?: number | null,
  ): Promise<{ stageId: number; groups: number; members: number; matches: number }> {
    const t = await tournamentService.getByIdDetailed(tournamentId);
    if (!GROUP_STAGE_STATUSES.has(t.status)) {
      throw new ConflictError(
        'Group stage generation requires the tournament to be closed for registration (registration_closed or running)',
        ErrorCodes.TOURNAMENT_INVALID_STATUS,
      );
    }

    const stage = (await tournamentRepository.findStages(tournamentId)).find((s) => Number(s.id) === Number(stageId));
    if (!stage) throw new NotFoundError('Stage', ErrorCodes.TOURNAMENT_STAGE_NOT_FOUND);
    if (stage.status === 'completed') {
      throw new ConflictError('The group stage is already completed and cannot be regenerated', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    if (stage.progression_format !== 'round_robin') {
      throw new ConflictError('The target stage is not a round-robin Group Stage', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const config = stage.config as GskConfiguration | null;
    if (!config || config.format !== 'group_stage_knockout' || config.groupStage?.format !== 'round_robin') {
      throw new ConflictError('The stage is missing a valid Group Stage + Knockout configuration', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const { groupCount, participantsPerGroup } = config.groupStage;

    // Competition scope (authoritative; never mixes categories in a stage).
    const competition = await competitionService.resolveRegistrationCompetition(tournamentId, competitionId ?? stage.competition_id ?? null);
    const scopedCompetitionId = competition?.id != null ? Number(competition.id) : null;
    if (scopedCompetitionId == null) {
      throw new ConflictError('A competition context is required for group stage generation', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }

    // ── Authoritative participant source: ACTIVE tournament participants ──
    const raw = await participantDrawRepository.listParticipantsByCompetition(tournamentId, scopedCompetitionId);
    const contexts: StageContext[] = raw
      .filter((p) => isTournamentParticipantProgressionEligible(p.status))
      .map((p) => ({ participantId: Number(p.id), registrationId: p.registration_id != null ? Number(p.registration_id) : null })) as StageContext[];
    const missingRegistration = contexts.find((c) => c.registrationId == null);
    if (missingRegistration) {
      throw new ConflictError(
        `Participant #${missingRegistration.participantId} has no registration — cannot join a group`,
        ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID,
      );
    }

    // ── Configuration ↔ participant-count validation ──
    let sizes: number[];
    try {
      sizes = planGroupMemberCounts(contexts.length, groupCount, participantsPerGroup);
    } catch (e) {
      throw new ConflictError((e as Error).message, ErrorCodes.TOURNAMENT_GROUP_CONFIG_INVALID);
    }

    // Primary member (user) per participant — needed for the shared Match rows.
    const primaryMemberByParticipant = new Map<number, number>();
    for (const c of contexts) {
      const members = await participantMemberRepository.listMembersByParticipant(c.participantId);
      const primary = members.find((m) => m.status === 'active')?.user_id ?? null;
      if (primary == null) {
        throw new ConflictError(`Participant #${c.participantId} has no active member`, ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      }
      primaryMemberByParticipant.set(c.participantId, Number(primary));
    }

    // ── Deterministic assignment (same tournament + participant set + seed ⇒ same groups) ──
    const seed = t.draw_seed ?? Date.now();
    const assignable = contexts.map((c) => ({ ...c, id: c.participantId }));
    const groups = assignGroupsDeterministic(assignable, seed, sizes);
    const participantsById = new Map(contexts.map((c) => [c.participantId, c]));
    const pairingsByGroup = groups.map((g) => generateRoundRobinMatches(g.map((m) => m.participantId)));

    const matchCount = pairingsByGroup.reduce((acc, p) => acc + p.length, 0);
    const formatCtx = await tournamentService.resolveMatchFormatContext(t);

    const conn = await getPool().getConnection();
    try {
      await runProvidedTransaction(conn, async () => {
        // Race safety: serialize on the tournament row, then re-check inside the
        // locked transaction so two concurrent runs cannot both generate.
        await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
        const existing = await tournamentRepository.findGroups(tournamentId, scopedCompetitionId, conn);
        if (existing.length > 0) {
          throw new ConflictError(
            'Group stage already generated for this competition — regeneration is blocked (delete groups first)',
            ErrorCodes.TOURNAMENT_GROUPS_ALREADY_GENERATED,
          );
        }

        for (let g = 0; g < groups.length; g++) {
          const name = String.fromCharCode(65 + g); // A, B, C, ...
          const groupId = await tournamentRepository.createGroup({
            tournament_id: tournamentId,
            competition_id: scopedCompetitionId,
            name,
            advance_count: config.groupStage.qualification.topPerGroup,
          }, conn);

          const members = groups[g];
          for (let i = 0; i < members.length; i++) {
            const p = participantsById.get(members[i].participantId)!;
            await tournamentRepository.addGroupMember({
              group_id: groupId,
              registration_id: p.registrationId,
              seed: i + 1,
            }, conn);
          }

          for (const pairing of pairingsByGroup[g]) {
            const p1 = participantsById.get(pairing.player1Id)!;
            const p2 = participantsById.get(pairing.player2Id)!;
            const u1 = primaryMemberByParticipant.get(p1.participantId)!;
            const u2 = primaryMemberByParticipant.get(p2.participantId)!;
            // Shared authoritative Match (results/courts run through it).
            const shared = await matchService.createForTournament({
              tournamentId,
              sportId: t.sport_id!,
              formatId: formatCtx.formatId,
              ruleSetId: formatCtx.ruleSetId,
              formatSnapshot: formatCtx.formatSnapshot,
              ruleSnapshot: formatCtx.ruleSnapshot,
              participants: [
                { userId: u1, side: 'home', teamIndex: 0, role: 'host' },
                { userId: u2, side: 'away', teamIndex: 1, role: 'joiner' },
              ],
              conn,
            });
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              competition_id: scopedCompetitionId,
              match_id: shared.id,
              round: pairing.round,
              round_name: `Round ${pairing.round}`,
              group_id: groupId,
              stage_id: Number(stage.id),
              bracket_position: 0,
              participant1_id: p1.participantId,
              participant2_id: p2.participantId,
              player1_id: u1,
              player2_id: u2,
              status: 'scheduled',
              progression_state: 'pending',
              progression_meta: { is_bracket: false },
              is_final: 0,
            }, conn);
          }
        }
      });
    } finally {
      conn.release();
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.GROUP_STAGE_GENERATED',
      entityType: 'tournament',
      entityId: tournamentId,
      afterState: { stageId: Number(stage.id), competitionId: scopedCompetitionId, groups: groups.length, members: contexts.length, matches: matchCount },
    });

    await eventBusV2.emit('tournament:group-stage-generated', {
      tournamentId,
      stageId: Number(stage.id),
      competitionId: scopedCompetitionId,
      groupCount: groups.length,
      memberCount: contexts.length,
      matchCount,
      ...tournamentRealtimeScope(t),
    } as Record<string, unknown>, {
      aggregateType: 'tournament',
      aggregateId: String(tournamentId),
      aggregateVersion: 1,
    });

    return { stageId: Number(stage.id), groups: groups.length, members: contexts.length, matches: matchCount };
  }
}

export const groupStageService = new GroupStageService();