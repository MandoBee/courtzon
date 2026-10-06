import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { isTournamentParticipantProgressionEligible } from '../domain/tournament-aggregate.js';
import type { GskConfiguration } from '../domain/gsk-config.js';
import {
  compareStandingRows,
  compareGroupIdentity,
  type GskQualifiedParticipant,
  type GskQualificationResult,
  type GskQualificationType,
} from '../domain/gsk-qualification.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { tournamentService } from './tournament.service.js';
import { competitionService } from './competition.service.js';

/**
 * Step 3B-3 — GSK Qualification engine (READ-ONLY, deterministic).
 *
 * consumes the EXISTING authoritative per-group standings
 * (`tournamentRepository.getStandings(tournamentId, groupId)`) — never a second
 * scoring implementation — ranks inside each group, applies `topPerGroup`,
 * optionally selects `bestThirdPlaces` best third-place candidates using the
 * existing standings comparator, validates the configuration and returns a
 * deterministic ordered qualified participant list.
 *
 * HARD STOP: this service never creates any knockout stage/match, never seeds a
 * bracket, never completes the tournament. Step 3B-4 consumes the result.
 */
export class QualificationService {
  async qualifyGroupStage(
    tournamentId: number,
    stageId: number,
    competitionId?: number | null,
  ): Promise<GskQualificationResult> {
    const t = await tournamentService.getByIdDetailed(tournamentId);

    const stage = (await tournamentRepository.findStages(tournamentId)).find((s) => Number(s.id) === Number(stageId));
    if (!stage) throw new NotFoundError('Stage', ErrorCodes.TOURNAMENT_STAGE_NOT_FOUND);
    if (stage.progression_format !== 'round_robin') {
      throw new ConflictError('Only a round-robin Group Stage can be qualified', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const config = stage.config as GskConfiguration | null;
    if (!config || config.format !== 'group_stage_knockout') {
      throw new ConflictError('The stage is missing a valid Group Stage + Knockout configuration', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }
    const gs = config.groupStage;
    const qual = gs.qualification;
    if (!Number.isInteger(gs.groupCount) || gs.groupCount < 1
      || !Number.isInteger(gs.participantsPerGroup) || gs.participantsPerGroup < 2) {
      throw new ConflictError('Invalid group-stage configuration', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }
    if (!Number.isInteger(qual.topPerGroup) || qual.topPerGroup < 1 || qual.topPerGroup > gs.participantsPerGroup) {
      throw new ConflictError('topPerGroup must be between 1 and participantsPerGroup', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }
    const bestThirdPlaces = qual.bestThirdPlaces ?? 0;
    if (!Number.isInteger(bestThirdPlaces) || bestThirdPlaces < 0) {
      throw new ConflictError('bestThirdPlaces must be a non-negative integer', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }
    if (!['seed', 'points', 'rank'].includes(qual.ordering)) {
      throw new ConflictError(`Unknown qualification ordering "${qual.ordering}"`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }

    const competition = await competitionService.resolveRegistrationCompetition(tournamentId, competitionId ?? stage.competition_id ?? null);
    const scopedCompetitionId = competition?.id != null ? Number(competition.id) : null;
    if (scopedCompetitionId == null) {
      throw new ConflictError('A competition context is required for qualification', ErrorCodes.TOURNAMENT_GROUP_STAGE_INVALID);
    }

    // 1. Group Stage must be complete (authoritative product rule: every stage
    //    match `progression_state` is 'completed' or 'bye').
    const unresolved = await tournamentRepository.countIncompleteStageMatches(Number(stage.id));
    if (unresolved > 0) {
      throw new ConflictError(`Group Stage has ${unresolved} unresolved match(es) — qualification rejected`, ErrorCodes.TOURNAMENT_MATCHES_UNRESOLVED);
    }

    // 2. Authoritative participants (active, competition-scoped) + identity key.
    const raw = await participantDrawRepository.listParticipantsByCompetition(tournamentId, scopedCompetitionId);
    const knownUsers = new Map<number, { participantId: number; seed: number | null }>();
    for (const p of raw) {
      if (!isTournamentParticipantProgressionEligible(p.status)) continue;
      const primaryUserId = firstMemberUserId(p.member_user_ids);
      if (primaryUserId == null) throw new ConflictError(`Participant #${Number(p.id)} has no active member`, ErrorCodes.TOURNAMENT_PARTICIPANT_MEMBER_NOT_FOUND);
      if (knownUsers.has(primaryUserId)) {
        throw new ConflictError(`Duplicate participant identity for user #${primaryUserId}`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
      }
      knownUsers.set(primaryUserId, {
        participantId: Number(p.id),
        seed: p.seed_number != null ? Number(p.seed_number) : null,
      });
      // Step 3B-5C — `tournament_standings.registration_id` is persisted as the
      // participant's REGISTRATION id (FK to tournament_registrations), so the
      // standings key must ALSO resolve to the participant.
      if (p.registration_id != null) {
        knownUsers.set(Number(p.registration_id), {
          participantId: Number(p.id),
          seed: p.seed_number != null ? Number(p.seed_number) : null,
        });
      }
    }

    // 3. Groups must all exist and be fully ranked.
    const groups = await tournamentRepository.findGroups(tournamentId, scopedCompetitionId);
    if (groups.length !== gs.groupCount) {
      throw new ConflictError(`Expected ${gs.groupCount} groups, found ${groups.length}`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }

    const qualified: Array<GskQualifiedParticipant & { points: number; gamesDiff: number }> = [];
    const thirdCandidates: Array<{ entry: GskQualifiedParticipant & { points: number; gamesDiff: number } }> = [];

    for (const g of groups) {
      const members = await tournamentRepository.findGroupMembers(g.id!);
      const standings = await tournamentRepository.getStandings(tournamentId, g.id!);
      if (standings.length === 0) {
        throw new ConflictError(`Missing standings for group ${g.name} — qualification rejected`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
      }
      if (standings.length !== members.length) {
        throw new ConflictError(
          `Group ${g.name} standings (${standings.length}) do not match its members (${members.length})`,
          ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID,
        );
      }
      const rows = standings.map((row) => {
        const p = knownUsers.get(Number(row.registration_id));
        if (!p) {
          throw new ConflictError(`Standing for group ${g.name} references an unknown participant`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
        }
        return { row, p };
      });
      if (new Set(rows.map((r) => r.p.participantId)).size !== rows.length) {
        throw new ConflictError(`Duplicate participant in group ${g.name}`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
      }
      // Rank: authoritative rank_position first; the existing comparator is the
      // deterministic fallback for ties / unranked rows.
      rows.sort((a, b) => ((a.row.rank_position ?? 0) - (b.row.rank_position ?? 0)) || compareStandingRows(a.row, b.row));

      const topN = rows.slice(0, qual.topPerGroup);
      if (topN.length < qual.topPerGroup) {
        throw new ConflictError(`Group ${g.name} does not have enough ranked participants for topPerGroup`, ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
      }
      topN.forEach((r, index) => {
        qualified.push({
          participantId: r.p.participantId,
          groupId: Number(g.id),
          groupRank: index + 1,
          qualificationType: 'group_position',
          qualificationRank: 0,
          seed: r.p.seed,
          points: Number(r.row.points ?? 0),
          gamesDiff: Number(r.row.games_won ?? 0) - Number(r.row.games_lost ?? 0),
        });
      });

      // Best-third candidate = the participant ranked 3rd (rank_position === 3),
      // excluded when they already qualified through top-N.
      const thirdRow = rows.find((r) => r.row.rank_position === 3);
      if (thirdRow && qual.topPerGroup < 3) {
        const p = thirdRow.p;
        thirdCandidates.push({
          entry: {
            participantId: p.participantId,
            groupId: Number(g.id),
            groupRank: 3,
            qualificationType: 'best_third' as GskQualificationType,
            qualificationRank: 0,
            seed: p.seed,
            points: Number(thirdRow.row.points ?? 0),
            gamesDiff: Number(thirdRow.row.games_won ?? 0) - Number(thirdRow.row.games_lost ?? 0),
          },
        });
      }
    }

    // 4. Best-third selection (deterministic: standings comparator then identity).
    const bestThirdCount = bestThirdPlaces ?? 0;
    if (bestThirdCount > 0) {
      if (bestThirdCount > thirdCandidates.length) {
        throw new ConflictError(
          `Requested ${bestThirdCount} best third-place participant(s), only ${thirdCandidates.length} available`,
          ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID,
        );
      }
      const picked = [...thirdCandidates]
        .sort((a, b) => compareStandingRowsNum(a.entry, b.entry) || compareGroupIdentity(a.entry, b.entry));
      picked.slice(0, bestThirdCount).forEach((c) => qualified.push(c.entry));
    }

    if (qualified.length < 2) {
      throw new ConflictError('Qualification requires at least 2 participants', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }
    const unique = new Set(qualified.map((q) => q.participantId));
    if (unique.size !== qualified.length) {
      throw new ConflictError('Duplicate participant in the qualified list', ErrorCodes.TOURNAMENT_QUALIFICATION_INVALID);
    }

    // 5. Deterministic ordering (contract value — never ignored, never random).
    const ordered = sortQualified(qualified, qual.ordering);
    const list: GskQualifiedParticipant[] = ordered.map((q, index) => ({ ...q, qualificationRank: index + 1 }));

    return { tournamentId, stageId: Number(stage.id), qualified: list, totalQualified: list.length };
  }
}

function firstMemberUserId(memberUserIds: unknown): number | null {
  const arr = typeof memberUserIds === 'string' ? safeParseJsonArray(memberUserIds) : memberUserIds;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = Number(arr[0]);
  return Number.isSafeInteger(first) && first > 0 ? first : null;
}

function safeParseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Numeric comparator over entry-embedded stats (points DESC, game difference DESC). */
function compareStandingRowsNum(a: { points: number; gamesDiff: number }, b: { points: number; gamesDiff: number }): number {
  return b.points - a.points || b.gamesDiff - a.gamesDiff;
}

function sortQualified(
  entries: Array<GskQualifiedParticipant & { points: number; gamesDiff: number }>,
  ordering: 'seed' | 'points' | 'rank',
): Array<GskQualifiedParticipant & { points: number; gamesDiff: number }> {
  const stable = (a: GskQualifiedParticipant, b: GskQualifiedParticipant) => compareGroupIdentity(a, b);
  if (ordering === 'points') {
    return [...entries].sort((a, b) => compareStandingRowsNum(a, b) || stable(a, b));
  }
  if (ordering === 'seed') {
    return [...entries].sort((a, b) => {
      const sa = a.seed ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seed ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || stable(a, b);
    });
  }
  // 'rank' — by source group, group_position before best_third, then groupRank.
  const typeOrder: Record<GskQualificationType, number> = { group_position: 0, best_third: 1 };
  return [...entries].sort(
    (a, b) => a.groupId - b.groupId || typeOrder[a.qualificationType] - typeOrder[b.qualificationType] || a.groupRank - b.groupRank || stable(a, b),
  );
}

export const qualificationService = new QualificationService();