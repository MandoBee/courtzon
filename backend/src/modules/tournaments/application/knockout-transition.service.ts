import { getPool } from '../../../database/mysql.js';
import { runProvidedTransaction } from '../../../database/database.transaction.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { generateKnockoutBracket, normaliseBracketTargets, withThirdPlaceMatch } from '../domain/tournament-aggregate.js';
import {
  assignKnockoutSeeding,
  validateKnockoutPairing,
  type GskSeedInput,
} from '../domain/knockout-seeding.js';
import type { GskConfiguration } from '../domain/gsk-config.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { participantMemberRepository } from '../infrastructure/repositories/participant-member.repository.js';
import { matchService } from '../../match/application/services/match.service.js';
import { tournamentService } from './tournament.service.js';
import { competitionService } from './competition.service.js';
import { qualificationService } from './qualification.service.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { tournamentRealtimeScope } from './tournament-realtime-scope.js';

const START_ROUND_SIZES: Record<string, number> = {
  round_of_16: 16,
  quarterfinals: 8,
  semifinals: 4,
  final: 2,
};

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
}

/** Lifecycle window in which the knockout transition may run (mirrors 3B-2). */
const TRANSITION_STATUSES = new Set(['registration_closed', 'running']);

/**
 * Step 3B-4 — GSK knockout integration.
 *
 * Consumes the recomputed `GskQualificationResult`, creates (or identifies) the
 * Knockout stage, applies deterministic seeding (group separation + same-group
 * rematch prevention), validates the bracket size against `startingRound` and
 * `allowByes` (play-ins explicitly unsupported), and persists the knockout
 * bracket through the SAME match-creation path the existing engine uses.
 *
 * `group_stage_knockout` is a fully executable `ENGINE_EXECUTABLE_FORMATS`
 * entry: the create contract, group engine, qualification computation and this
 * transition are live end-to-end, and the admin Hub plus public pages drive the
 * groups → qualification → knockout progression.
 */
export class KnockoutTransitionService {
  async introduceKnockoutStage(
    tournamentId: number,
    groupStageId: number,
    actorId: number,
    competitionId?: number | null,
  ): Promise<{ stageId: number; stageOrder: number; bracketSize: number; participants: number; matches: number }> {
    const t = await tournamentService.getByIdDetailed(tournamentId);
    if (!TRANSITION_STATUSES.has(t.status)) {
      throw new ConflictError('The knockout transition requires the tournament to be closed for registration (registration_closed or running)', ErrorCodes.TOURNAMENT_INVALID_STATUS);
    }

    const stages = await tournamentRepository.findStages(tournamentId);
    const groupStage = stages.find((s) => Number(s.id) === Number(groupStageId));
    if (!groupStage) throw new NotFoundError('Stage', ErrorCodes.TOURNAMENT_STAGE_NOT_FOUND);
    if (groupStage.progression_format !== 'round_robin') {
      throw new ConflictError('The transition source is not a round-robin Group Stage', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const config = groupStage.config as GskConfiguration | null;
    if (!config || config.format !== 'group_stage_knockout') {
      throw new ConflictError('The Group Stage is missing a valid Group Stage + Knockout configuration', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const ko = config.knockout;

    // Play-ins are not supported by the existing engine → explicit unsupported error.
    if (ko.playInRounds != null && ko.playInRounds > 0) {
      throw new ConflictError('playInRounds is not supported by the knockout engine yet — configuration rejected', ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
    }
    if (!(ko.startingRound in START_ROUND_SIZES) && ko.startingRound !== 'first_valid_round') {
      throw new ConflictError(`Unknown knockout starting round "${ko.startingRound}"`, ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
    }

    // Competition scope.
    const competition = await competitionService.resolveRegistrationCompetition(tournamentId, competitionId ?? groupStage.competition_id ?? null);
    const scopedCompetitionId = competition?.id != null ? Number(competition.id) : null;
    if (scopedCompetitionId == null) {
      throw new ConflictError('A competition context is required for the knockout transition', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }

    // ── Authoritative qualification (recomputed; never trusts caller lists) ──
    const qualification = await qualificationService.qualifyGroupStage(tournamentId, Number(groupStage.id), scopedCompetitionId);
    const qualified = qualification.qualified;
    const Q = qualification.totalQualified;

    // ── Bracket size resolution (explicit; never silent) ──
    const N = ko.startingRound === 'first_valid_round' ? nextPowerOfTwo(Q) : START_ROUND_SIZES[ko.startingRound];
    if (Q > N) {
      throw new ConflictError(
        `Qualified count ${Q} cannot fit the ${ko.startingRound} bracket (${N}) without play-ins — play-ins are unsupported`,
        ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID,
      );
    }
    if (Q < N) {
      if (ko.allowByes !== true) {
        throw new ConflictError(
          `Qualified count ${Q} is not a supportable bracket for ${ko.startingRound} (${N}) — enable byes or use first_valid_round`,
          ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID,
        );
      }
      if (Q <= N / 2) {
        throw new ConflictError(`Qualified count ${Q} is too low for a ${N}-slot bracket — too many byes required`, ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
      }
    }

    // ── Participant identity + authoritative seeds (from the participant repo) ──
    const raw = await participantDrawRepository.listParticipantsByCompetition(tournamentId, scopedCompetitionId);
    const byParticipant = new Map<number, { userIds: number[]; seed: number | null }>();
    const participantTypeById = new Map<number, string>(raw.map((p) => [Number(p.id), String(p.participant_type)]));
    for (const p of raw) {
      const participantId = Number(p.id);
      // Authoritative active roster (ordered by member_order): every active
      // member of BOTH sides is persisted on the shared knockout Match.
      const members = await participantMemberRepository.listMembersByParticipant(participantId);
      const userIds = members
        .filter((m) => m.status === 'active')
        .sort((a, b) => Number(a.member_order) - Number(b.member_order) || Number(a.id ?? 0) - Number(b.id ?? 0))
        .map((m) => Number(m.user_id));
      byParticipant.set(participantId, { userIds, seed: p.seed_number != null ? Number(p.seed_number) : null });
    }
    for (const q of qualified) {
      if (!byParticipant.has(q.participantId)) {
        throw new ConflictError(`Qualified participant #${q.participantId} is not a tournament participant`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
      }
      const activeMemberCount = byParticipant.get(q.participantId)!.userIds.length;
      if (activeMemberCount === 0) {
        throw new ConflictError(`Qualified participant #${q.participantId} has no active member`, ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      }
      // Phase 3 fix (F1) — a qualified TEAM (including a doubles pair modelled as
      // a team) must have at least TWO active members to enter the knockout
      // bracket; an incomplete forming team is rejected here.
      if (participantTypeById.get(q.participantId) === 'team' && activeMemberCount < 2) {
        throw new ConflictError(
          `Qualified participant #${q.participantId} is an incomplete team: at least 2 active members are required to enter the knockout stage (currently ${activeMemberCount})`,
          ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_COUNT_INVALID,
          { min: 2, actual: activeMemberCount, participantId: q.participantId },
        );
      }
    }
    if (new Set(qualified.map((q) => q.participantId)).size !== qualified.length) {
      throw new ConflictError('Qualification result contains duplicate participants', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }

    // ── Deterministic seeding (automatic) or authoritative manual order ──
    const seedInputs: GskSeedInput[] = qualified.map((q) => ({
      participantId: q.participantId,
      groupId: Number(q.groupId),
      groupRank: q.groupRank,
      qualificationType: q.qualificationType,
      seed: byParticipant.get(q.participantId)!.seed,
    }));
    let orderedIds: number[];
    const opts = { separateGroupWinners: ko.separateGroupWinners, preventSameGroupRematch: ko.preventSameGroupRematch };
    if (ko.seeding === 'manual') {
      if (seedInputs.some((s) => s.seed == null)) {
        throw new ConflictError('Manual seeding requires an authoritative tournament seed for every qualified participant', ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
      }
      orderedIds = [...seedInputs].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0) || a.participantId - b.participantId).map((s) => s.participantId);
      try {
        validateKnockoutPairing(orderedIds, new Map(seedInputs.map((s) => [s.participantId, s])), opts);
      } catch (e) {
        throw new ConflictError((e as Error).message, ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
      }
    } else {
      try {
        orderedIds = assignKnockoutSeeding(seedInputs, opts);
      } catch (e) {
        throw new ConflictError((e as Error).message, ErrorCodes.TOURNAMENT_KNOCKOUT_CONFIG_INVALID);
      }
    }

    // ── Existing knockout generator ──
    let slots = normaliseBracketTargets(generateKnockoutBracket(orderedIds), Q);
    const totalRounds = Math.max(1, Math.round(Math.log2(nextPowerOfTwo(Q))));

    // GSK-3C — optional third-place playoff. Only generated when BOTH semifinals
    // can be contested (two determinable losers); the helper returns the bracket
    // unchanged otherwise, so opt-out behaviour is byte-for-byte identical.
    if (ko.thirdPlaceMatch === true) {
      slots = withThirdPlaceMatch(slots, Q, totalRounds);
    }

    for (const slot of slots) {
      if (slot.isThirdPlace === true) {
        // The dedicated third-place slot is NOT part of the single-elimination
        // tree: it is never the championship final and sits one step off it.
        slot.isFinal = false;
        slot.bracketDepth = 1;
        continue;
      }
      const fromEnd = totalRounds - slot.round;
      slot.isFinal = fromEnd === 0;
      slot.bracketDepth = Math.max(0, fromEnd);
    }
    const matchCount = slots.length;

    const formatCtx = await tournamentService.resolveMatchFormatContext(t);
    const conn = await getPool().getConnection();
    let knockoutStageId = 0;
    let knockoutStageOrder = 0;
    try {
      await runProvidedTransaction(conn, async () => {
        await conn.query('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
        const stageRows = await tournamentRepository.findStages(tournamentId);
        const existing = stageRows.find((s) => Number(s.competition_id) === Number(scopedCompetitionId) && s.progression_format === 'knockout');
        if (existing) {
          knockoutStageId = Number(existing.id);
          knockoutStageOrder = existing.stage_order;
        } else {
          knockoutStageOrder = Number(groupStage.stage_order) + 1;
          knockoutStageId = await tournamentRepository.createStage({
            tournament_id: tournamentId,
            competition_id: scopedCompetitionId,
            stage_order: knockoutStageOrder,
            name: 'Knockout',
            progression_format: 'knockout',
            match_format_id: groupStage.match_format_id,
            rule_set_id: groupStage.rule_set_id,
            advance_count: 1,
            status: 'pending',
            config: config as unknown as Record<string, unknown>,
          }, conn);
        }
        // Idempotency: never generate a second knockout stage.
        const existingMatches = await tournamentRepository.countStageMatches(knockoutStageId, conn);
        if (existingMatches > 0) {
          throw new ConflictError('Knockout matches already exist for this stage — transition is already applied', ErrorCodes.TOURNAMENT_MATCHES_ALREADY_GENERATED);
        }
        await this.persistKnockoutMatches(t, tournamentId, scopedCompetitionId, knockoutStageId, slots, byParticipant, formatCtx, conn, totalRounds);
      });
    } finally {
      conn.release();
    }

    // Mirror the existing knockout generation: resolve draw-time byes/padding so
    // those placeholder slots leave 'pending' (they cannot later block completion).
    await tournamentService.advanceByes(tournamentId);

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.KNOCKOUT_STAGE_GENERATED',
      entityType: 'tournament',
      entityId: tournamentId,
      afterState: { groupStageId: Number(groupStage.id), stageId: knockoutStageId, stageOrder: knockoutStageOrder, bracketSize: N, qualified: Q, matches: matchCount, competitionId: scopedCompetitionId },
    });

    await eventBusV2.emit('tournament:knockout-generated', {
      tournamentId,
      stageId: knockoutStageId,
      competitionId: scopedCompetitionId,
      qualified,
      bracketSize: N,
      matchCount,
      ...tournamentRealtimeScope(t),
    } as Record<string, unknown>, {
      aggregateType: 'tournament',
      aggregateId: String(tournamentId),
      aggregateVersion: 1,
    });

    return { stageId: knockoutStageId, stageOrder: knockoutStageOrder, bracketSize: N, participants: Q, matches: matchCount };
  }

  private async persistKnockoutMatches(
    t: any,
    tournamentId: number,
    competitionId: number,
    stageId: number,
    slots: Array<{ round: number; bracketPosition?: number; player1Id?: number; player2Id?: number; bye?: boolean; isFinal?: boolean; bracketDepth?: number; targetRound?: number; targetBracketPosition?: number; targetSide?: 'player1' | 'player2'; isThirdPlace?: boolean; loserTargetRound?: number; loserTargetBracketPosition?: number; loserTargetSide?: 'player1' | 'player2' }>,
    byParticipant: Map<number, { userIds: number[]; seed: number | null }>,
    formatCtx: any,
    conn: any,
    totalRounds: number,
  ): Promise<void> {
    for (const slot of slots) {
      const p1Id = slot.player1Id != null ? Number(slot.player1Id) : null;
      const p2Id = slot.player2Id != null ? Number(slot.player2Id) : null;
      const roster1 = p1Id != null ? byParticipant.get(p1Id)?.userIds ?? [] : [];
      const roster2 = p2Id != null ? byParticipant.get(p2Id)?.userIds ?? [] : [];
      // Legacy compatibility: player1_id/player2_id keep the FIRST active member
      // of each side (the former primary-member contract).
      const u1 = roster1[0] ?? null;
      const u2 = roster2[0] ?? null;
      const roundLabel = knockoutRoundLabel(slot.round, totalRounds, slot.isThirdPlace === true);
      const meta = buildKnockoutMeta(slot);

      if (p1Id != null && p2Id != null) {
        const shared = await matchService.createForTournament({
          tournamentId,
          sportId: t.sport_id!,
          formatId: formatCtx.formatId,
          ruleSetId: formatCtx.ruleSetId,
          formatSnapshot: formatCtx.formatSnapshot,
          ruleSnapshot: formatCtx.ruleSnapshot,
          participants: [
            ...roster1.map((userId) => ({ userId, side: 'home' as const, teamIndex: 0, role: 'host' as const })),
            ...roster2.map((userId) => ({ userId, side: 'away' as const, teamIndex: 1, role: 'joiner' as const })),
          ],
          conn,
        });
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          competition_id: competitionId,
          match_id: shared.id,
          round: slot.round,
          round_name: roundLabel,
          bracket_position: slot.bracketPosition ?? 0,
          stage_id: stageId,
          participant1_id: p1Id,
          participant2_id: p2Id,
          player1_id: u1,
          player2_id: u2,
          is_final: slot.isFinal === true ? 1 : 0,
          bracket_depth: slot.bracketDepth ?? null,
          status: 'scheduled',
          progression_state: 'pending',
          progression_meta: meta,
        }, conn);
      } else {
        const presentId = p1Id ?? p2Id;
        const presentRoster = presentId != null ? byParticipant.get(presentId)?.userIds ?? [] : [];
        const presentUserId = presentRoster[0] ?? null;
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          competition_id: competitionId,
          round: slot.round,
          round_name: roundLabel,
          bracket_position: slot.bracketPosition ?? 0,
          stage_id: stageId,
          match_number: slot.bye === true ? 0 : undefined,
          participant1_id: presentId,
          participant2_id: null,
          player1_id: presentUserId,
          player2_id: null,
          is_final: slot.isFinal === true ? 1 : 0,
          bracket_depth: slot.bracketDepth ?? null,
          status: 'scheduled',
          progression_state: 'pending',
          progression_meta: slot.bye === true ? { ...meta, bye: true } : meta,
        }, conn);
      }
    }
  }
}

function buildKnockoutMeta(slot: { bracketPosition?: number; bye?: boolean; isFinal?: boolean; bracketDepth?: number; targetRound?: number; targetBracketPosition?: number; targetSide?: 'player1' | 'player2'; isThirdPlace?: boolean; loserTargetRound?: number; loserTargetBracketPosition?: number; loserTargetSide?: 'player1' | 'player2' }): Record<string, unknown> {
  return {
    is_bracket: true,
    bye: slot.bye === true ? true : undefined,
    is_third_place: slot.isThirdPlace === true ? true : undefined,
    target_round: slot.targetRound != null ? slot.targetRound : null,
    target_bracket_position: slot.targetBracketPosition != null ? slot.targetBracketPosition : null,
    target_side: slot.targetSide ?? (((slot.bracketPosition ?? 0) % 2 === 0) ? 'player1' : 'player2'),
    loser_target_round: slot.loserTargetRound != null ? slot.loserTargetRound : null,
    loser_target_bracket_position: slot.loserTargetBracketPosition != null ? slot.loserTargetBracketPosition : null,
    loser_target_side: slot.loserTargetSide ?? null,
    is_final: slot.isFinal === true ? 1 : 0,
    bracket_depth: slot.bracketDepth ?? null,
  };
}

function knockoutRoundLabel(round: number, totalRounds: number, isThirdPlace = false): string {
  if (isThirdPlace) return 'Third-place';
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-final';
  if (fromEnd === 2) return 'Quarter-final';
  return `Round ${round}`;
}

export const knockoutTransitionService = new KnockoutTransitionService();