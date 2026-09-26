import { getPool } from '../../../database/mysql.js';
import type { PoolConnection } from 'mysql2/promise';
import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { matchResultRepository } from '../infrastructure/match-result.repository.js';
import type { MatchContext } from '../infrastructure/match-result.repository.js';
import { ratingService } from './rating/rating.service.js';
import { validateAndComputeFinal, RulesValidationError, outcomeCountsForRating } from './rules/rules-engine.js';
import type { MatchResultParticipant, MatchParticipantSlot, ParticipantSlot, MatchResultRecord, RawMatchResultPayload } from '../domain/match-result.types.js';
import type { MatchFormatSnapshot } from '../../match/domain/match.types.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { SUBMISSION_WINDOW_HOURS, AUTO_APPROVAL_WINDOW_HOURS, ELIGIBLE_MATCH_STATUSES } from './result-window.js';

export { SUBMISSION_WINDOW_HOURS, AUTO_APPROVAL_WINDOW_HOURS, ELIGIBLE_MATCH_STATUSES };

const log = createModuleLogger('match-result');

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

/**
 * Tenancy fields are read OUTSIDE the socket layer (source-side, Group 5) so
 * SocketPublisher can route result events to the owning org/branch rooms
 * without exposing participant lists or doing database work at publication time.
 */
function scopeResultPayload(
  base: Record<string, unknown>,
  context: Pick<MatchContext, 'organisationId' | 'branchId' | 'creatorId' | 'visibility'> | null | undefined,
): Record<string, unknown> {
  if (!context) return base;
  return {
    ...base,
    organisationId: context.organisationId,
    branchId: context.branchId,
    creatorId: context.creatorId,
    visibility: context.visibility,
  };
}

export interface SubmitResultOptions {
  /**
   * Operator submission (T-B). Authorised admins/org staff record a result on
   * behalf of the match without being a participant. The ROUTE guard enforces
   * `matches.result.manage` / `tournament.result.manage` /
   * `org.tournaments.result.manage` BEFORE the service is called — this flag
   * only relaxes the participant identity check; every other validation (rules
   * engine, frozen snapshots, window, state machine) is unchanged.
   */
  actorIsOperator?: boolean;
}

export class MatchResultService {
  /** Part G.411 — server always derives the winner from the score using the rules engine. */
  async submitMatchResult(matchId: number, actorId: number, payload: RawMatchResultPayload, ip?: string, opts?: SubmitResultOptions): Promise<MatchResultRecord> {
    const matchIdResolved = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdResolved) throw new NotFoundError('match not found');
    const matchIdActual = matchIdResolved;

    const context = await matchResultRepository.getMatchContext(matchIdActual);
    if (!context) throw new NotFoundError('match context not found');

    const isParticipant = context.participantUserIds.includes(actorId);
    if (!isParticipant && !opts?.actorIsOperator) throw new ForbiddenError('Only match participants can submit a result');

    if (!ELIGIBLE_MATCH_STATUSES.includes(context.status)) {
      throw new RulesValidationError(`Results can only be submitted for matches that have started (status: ${context.status})`);
    }
    if (!context.playedAt) {
      throw new RulesValidationError('This match has no recorded play time yet — start the match session before submitting a result');
    }

    // Part G.xxx — results may NEVER be submitted before the authoritative
    // scheduled match end (bookings.end_at_utc). This is the explicit guard the
    // frontend lifecycle depends on: the result form is only actionable after
    // the scheduled end. Uses server time (UTC) against the authoritative UTC
    // column — never browser/device time. Legacy bookings without end_at_utc
    // fall through to the existing eligibility rules.
    if (context.endAtUtc) {
      const endMs = new Date(context.endAtUtc).getTime();
      if (Date.now() < endMs) {
        throw new RulesValidationError('The match has not ended yet — results can only be submitted after the scheduled match end');
      }
    }

    const now = new Date().toISOString();
    const windowEnd = addHours(context.playedAt, SUBMISSION_WINDOW_HOURS);
    if (now > windowEnd) {
      throw new RulesValidationError('The result submission window (3 days after play) has closed');
    }

    // Group 4 — use the Match's frozen rule snapshot when present (historical
    // correctness). Fall back to resolving the active rule set only for legacy
    // matches created before rule freezing existed.
    let format;
    if (context.ruleSnapshot) {
      format = { formatId: context.formatId ?? 0, ruleSetId: context.ruleSetId ?? 0, version: 0, rules: context.ruleSnapshot, standingsRules: null };
    } else {
      format = context.formatId
        ? await matchResultRepository.findActiveRuleSetForFormat(context.formatId)
        : await matchResultRepository.findActiveRuleSet(context.sportId);
    }
    if (!format) {
      throw new RulesValidationError(`No active sport format is configured for sport ${context.sportId}`);
    }

    let validated;
    try {
      validated = validateAndComputeFinal(payload, format.rules);
    } catch (err) {
      if (err instanceof RulesValidationError) throw err;
      throw new RulesValidationError('Invalid result payload');
    }

    const sides = this.buildParticipantSlots(context.participantSlots, actorId);
    if (sides.length < 2) {
      throw new RulesValidationError('Not enough participants to record a result');
    }
    this.validateSideCardinality(sides, context.formatSnapshot);

    const existing = await matchResultRepository.findByMatchId(matchIdActual);
    if (existing && existing.submissionStatus !== 'withdrawn') {
      throw new RulesValidationError(`A result already exists for this match (${existing.submissionStatus})`);
    }

    const submissionStatus = 'pending_confirmation';
    const outcome = validated.outcome === 'completed' ? 'completed' : validated.outcome === 'abandoned' ? 'no_result' : validated.outcome;
    const participantRows = sides.map((s) => ({
      userId: s.userId,
      teamIndex: s.teamIndex,
      side: s.side,
      outcome: validated.finalResult.sideOutcomes[s.side],
      matchEvidence: validated.finalResult.sideEvidence[s.side],
      evidenceCounted: outcomeCountsForRating(validated.outcome),
    }));

    let resultId: number;
    if (existing) {
      // Part C3 — a withdrawn result row is reused for a fresh submission while
      // the submission window remains valid (UNIQUE match_id preserved).
      await matchResultRepository.updateResult(existing.id, {
        rulesSnapshot: format.rules as unknown as Record<string, unknown>,
        rawResult: payload,
        finalResult: validated.finalResult,
        outcome,
        submissionStatus,
        tournamentId: context.tournamentId ?? null,
        matchType: context.tournamentId ? 'tournament' : 'public',
        submittedBy: actorId,
        submittedAt: now,
        acceptedBy: null,
        acceptedAt: null,
        autoApproved: false,
        disputedBy: null,
        disputedAt: null,
        disputeReason: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
        submissionDeadlineAt: addHours(context.playedAt, SUBMISSION_WINDOW_HOURS),
        autoApprovalDeadlineAt: addHours(now, AUTO_APPROVAL_WINDOW_HOURS),
        evidenceCounted: false,
        ratingAppliedAt: null,
      });
      resultId = existing.id;
    } else {
      resultId = await matchResultRepository.insert({
        matchId: matchIdActual,
        sportId: context.sportId,
        formatId: format.formatId,
        ruleSetId: format.ruleSetId,
        rulesSnapshot: format.rules,
        matchType: context.tournamentId ? 'tournament' : 'public',
        tournamentId: context.tournamentId ?? null,
        playedAt: context.playedAt,
        branchId: context.branchId,
        resourceId: context.resourceId,
        timezone: context.timezone,
        participantPayload: sides,
        rawResult: payload,
        finalResult: validated.finalResult,
        outcome,
        submissionStatus,
        submittedBy: actorId,
        submittedAt: now,
        submissionDeadlineAt: addHours(context.playedAt, SUBMISSION_WINDOW_HOURS),
        autoApprovalDeadlineAt: addHours(now, AUTO_APPROVAL_WINDOW_HOURS),
      });
    }

    await matchResultRepository.replaceParticipants(resultId, matchIdActual, participantRows);

    await recordAudit({
      actorId,
      action: 'match.result.submitted',
      entityType: 'match_result_records',
      entityId: resultId,
      afterState: validated.finalResult as unknown as Record<string, unknown>,
      ipAddress: ip,
    });

    const opponentIds = context.participantUserIds.filter((u) => u !== actorId);
    await eventBusV2.emit(
      'match:result-submitted',
      { matchId: matchIdActual, resultId, submittedById: actorId, opponentUserIds: opponentIds, allUserIds: context.participantUserIds },
      { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1, actorId },
    );
    await eventBusV2.emit('match:updated', { matchId: matchIdActual }, { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1 });

    const record = await matchResultRepository.findById(resultId);
    if (!record) throw new NotFoundError('result not found after insert');
    return record;
  }

  /** Part C3 — the submitting player withdraws an unapproved, undisputed result while the window is open. */
  async withdrawResult(matchId: number, actorId: number, ip?: string): Promise<MatchResultRecord> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) throw new NotFoundError('match not found');

    const record = await matchResultRepository.findByMatchId(matchIdActual);
    if (!record) throw new NotFoundError('no result to withdraw');

    if (record.submittedBy !== actorId) throw new ForbiddenError('Only the submitter can withdraw a result');
    if (record.submissionStatus !== 'pending_confirmation') {
      throw new RulesValidationError(`A ${record.submissionStatus} result cannot be withdrawn`);
    }
    if (new Date().toISOString() > addHours(record.playedAt, SUBMISSION_WINDOW_HOURS)) {
      throw new RulesValidationError('The result submission window (3 days after play) has closed');
    }

    await matchResultRepository.updateResult(record.id, { submission_status: 'withdrawn' });

    await recordAudit({ actorId, action: 'match.result.withdrawn', entityType: 'match_result_records', entityId: record.id, ipAddress: ip });

    await eventBusV2.emit(
      'match:result-withdrawn',
      { matchId: matchIdActual, resultId: record.id, submittedById: actorId, allUserIds: record.participantPayload.map((p) => p.userId) },
      { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1, actorId },
    );
    await eventBusV2.emit('match:updated', { matchId: matchIdActual }, { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  /** Part E.81 — local cell only: unapproved / undisputed results may be replaced while the window is open. */
  async replaceResult(matchId: number, actorId: number, payload: RawMatchResultPayload, ip?: string): Promise<MatchResultRecord> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) throw new NotFoundError('match not found');

    const record = await matchResultRepository.findByMatchId(matchIdActual);
    if (!record) throw new NotFoundError('no result to replace');

    if (record.submittedBy !== actorId) throw new ForbiddenError('Only the submitter can replace a result');
    if (record.submissionStatus !== 'pending_confirmation') {
      throw new RulesValidationError(`A ${record.submissionStatus} result cannot be replaced`);
    }
    if (await this.isApprovedOrDisputed(record)) {
      throw new RulesValidationError('This result can no longer be replaced');
    }

    const context = await matchResultRepository.getMatchContext(matchIdActual);
    if (!context) throw new NotFoundError('match context not found');

    if (new Date().toISOString() > addHours(record.playedAt, SUBMISSION_WINDOW_HOURS)) {
      throw new RulesValidationError('The result submission window (3 days after play) has closed');
    }

    const format = context.ruleSnapshot
      ? { formatId: context.formatId ?? 0, ruleSetId: context.ruleSetId ?? 0, version: 0, rules: context.ruleSnapshot, standingsRules: null }
      : context.formatId
        ? await matchResultRepository.findActiveRuleSetForFormat(context.formatId)
        : await matchResultRepository.findActiveRuleSet(context.sportId);
    if (!format) throw new RulesValidationError('No active sport format is configured');

    let validated;
    try {
      validated = validateAndComputeFinal(payload, format.rules);
    } catch (err) {
      if (err instanceof RulesValidationError) throw err;
      throw new RulesValidationError('Invalid result payload');
    }

    const now = new Date().toISOString();
    await matchResultRepository.updateResult(record.id, {
      rulesSnapshot: format.rules as unknown as Record<string, unknown>,
      raw_result: payload,
      finalResult: validated.finalResult,
      outcome: validated.outcome === 'abandoned' ? 'no_result' : validated.outcome,
      submission_status: 'pending_confirmation',
      submitted_at: now,
      auto_approval_deadline_at: addHours(now, AUTO_APPROVAL_WINDOW_HOURS),
    });

    const sides = this.buildParticipantSlots(context.participantSlots, actorId);
    this.validateSideCardinality(sides, context.formatSnapshot);
    await matchResultRepository.replaceParticipants(record.id, matchIdActual, sides.map((s) => ({
      userId: s.userId,
      teamIndex: s.teamIndex,
      side: s.side,
      outcome: validated.finalResult.sideOutcomes[s.side],
      matchEvidence: validated.finalResult.sideEvidence[s.side],
      evidenceCounted: outcomeCountsForRating(validated.outcome),
    })));

    await recordAudit({ actorId, action: 'match.result.replaced', entityType: 'match_result_records', entityId: record.id, ipAddress: ip });

    await eventBusV2.emit('match:result-submitted', scopeResultPayload({ matchId: matchIdActual, resultId: record.id, submittedById: actorId, opponentUserIds: context.participantUserIds.filter((u) => u !== actorId), allUserIds: context.participantUserIds }, context), { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1, actorId });
    await eventBusV2.emit('match:updated', { matchId: matchIdActual }, { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  private async isApprovedOrDisputed(record: MatchResultRecord): Promise<boolean> {
    return record.submissionStatus === 'approved' || record.submissionStatus === 'disputed';
  }

  /** Part E.60 — referee omitted result; opponent confirms with no revision. */
  async acceptResult(matchId: number, actorId: number, ip?: string): Promise<MatchResultRecord> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) throw new NotFoundError('match not found');

    const record = await matchResultRepository.findByMatchId(matchIdActual);
    if (!record) throw new NotFoundError('no result to accept');

    if (record.submissionStatus !== 'pending_confirmation') {
      throw new RulesValidationError(`A ${record.submissionStatus} result cannot be accepted`);
    }
    const context = await matchResultRepository.getMatchContext(matchIdActual);
    if (!context) throw new NotFoundError('match context not found');
    if (record.submittedBy === actorId) throw new RulesValidationError('The submitter cannot accept their own result');
    if (!context.participantUserIds.includes(actorId)) throw new ForbiddenError('Only match participants can accept a result');

    const now = new Date().toISOString();
    const accepted = await matchResultRepository.approvePending(record.id, {
      submission_status: 'approved',
      accepted_by: actorId,
      accepted_at: now,
      auto_approved: false,
    });
    if (!accepted) {
      throw new RulesValidationError('This result is no longer pending confirmation');
    }

    await recordAudit({ actorId, action: 'match.result.accepted', entityType: 'match_result_records', entityId: record.id, ipAddress: ip });

    await this.applyRatingForRecord(record.id, matchIdActual);

    await eventBusV2.emit('match:result-approved', scopeResultPayload({ matchId: matchIdActual, resultId: record.id, approvedBy: actorId, allUserIds: context.participantUserIds }, context), { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1, actorId });
    await eventBusV2.emit('match:updated', { matchId: matchIdActual }, { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  /** Part E.120 — opponent disputes: remains disputed indefinitely until Super Admin resolves (E.80). */
  async disputeResult(matchId: number, actorId: number, reason: string, ip?: string): Promise<MatchResultRecord> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) throw new NotFoundError('match not found');

    const record = await matchResultRepository.findByMatchId(matchIdActual);
    if (!record) throw new NotFoundError('no result to dispute');

    if (record.submissionStatus !== 'pending_confirmation') {
      throw new RulesValidationError(`A ${record.submissionStatus} result cannot be disputed`);
    }
    const context = await matchResultRepository.getMatchContext(matchIdActual);
    if (!context) throw new NotFoundError('match context not found');
    if (record.submittedBy === actorId) throw new RulesValidationError('The submitter cannot dispute their own result');
    if (!context.participantUserIds.includes(actorId)) throw new ForbiddenError('Only match participants can dispute a result');
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 10) throw new RulesValidationError('A dispute reason of at least 10 characters is required');

    const now = new Date().toISOString();
    await matchResultRepository.updateResult(record.id, {
      submission_status: 'disputed',
      disputed_by: actorId,
      disputed_at: now,
      dispute_reason: cleanReason,
    });

    await recordAudit({ actorId, action: 'match.result.disputed', entityType: 'match_result_records', entityId: record.id, afterState: { disputeReason: cleanReason }, ipAddress: ip });

    await eventBusV2.emit('match:result-disputed', scopeResultPayload({ matchId: matchIdActual, resultId: record.id, disputedBy: actorId, allUserIds: context.participantUserIds }, context), { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1, actorId });
    await eventBusV2.emit('match:updated', { matchId: matchIdActual }, { aggregateType: 'match', aggregateId: String(matchIdActual), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  /** Part E.80 — Super Admin resolves a dispute final and binding (approve displayed score or record no result). */
  async resolveDispute(resultId: number, actorId: number, resolution: { approve: boolean; displayResult?: RawMatchResultPayload; note?: string }, ip?: string): Promise<MatchResultRecord> {
    const record = await matchResultRepository.findById(resultId);
    if (!record) throw new NotFoundError('result not found');
    if (record.submissionStatus !== 'disputed') {
      throw new RulesValidationError(`Only disputed results can be resolved (current: ${record.submissionStatus})`);
    }

    const now = new Date().toISOString();
    const beforeState = { submission_status: record.submissionStatus, raw_result: record.rawResult };

    if (resolution.approve && resolution.displayResult && record.outcome !== 'no_result') {
      // Group 4 — validate against the record's FROZEN rules snapshot, never
      // the current active rule set (a rule-version change must not reinterpret
      // an existing result). Fall back to current resolution only for legacy
      // records created before snapshots existed.
      const rules = record.rulesSnapshot ?? (await matchResultRepository.findActiveRuleSet(record.sportId))?.rules;
      if (!rules) throw new RulesValidationError('No sport format rules are configured');
      let validated;
      try {
        validated = validateAndComputeFinal(resolution.displayResult, rules);
      } catch (err) {
        if (err instanceof RulesValidationError) throw err;
        throw new RulesValidationError('Invalid display result');
      }
      await matchResultRepository.updateResult(record.id, {
        submission_status: 'approved',
        raw_result: resolution.displayResult,
        finalResult: validated.finalResult,
        outcome: validated.outcome === 'abandoned' ? 'no_result' : validated.outcome,
        accepted_by: actorId,
        accepted_at: now,
        resolved_by: actorId,
        resolved_at: now,
        resolution_note: resolution.note ?? null,
        evidence_counted: false,
      });
      const context = await matchResultRepository.getMatchContext(record.matchId);
      const sides = this.buildParticipantSlots(
        context?.participantSlots && context.participantSlots.length ? context.participantSlots : record.participantPayload,
        actorId,
      );
      this.validateSideCardinality(sides, context?.formatSnapshot ?? null);
      await matchResultRepository.replaceParticipants(record.id, record.matchId, sides.map((s) => ({
        userId: s.userId,
        teamIndex: s.teamIndex,
        side: s.side,
        outcome: validated.finalResult.sideOutcomes[s.side],
        matchEvidence: validated.finalResult.sideEvidence[s.side],
        evidenceCounted: outcomeCountsForRating(validated.outcome),
      })));
      await this.applyRatingForRecord(record.id, record.matchId);
    } else {
      await matchResultRepository.updateResult(record.id, {
        submission_status: 'approved',
        outcome: 'no_result',
        finalResult: null,
        resolved_by: actorId,
        resolved_at: now,
        resolution_note: resolution.note ?? null,
        evidence_counted: false,
      });
      await matchResultRepository.replaceParticipants(record.id, record.matchId, record.participantPayload.map((s) => ({
        userId: s.userId,
        teamIndex: s.teamIndex,
        side: s.side,
        outcome: 'draw',
        matchEvidence: 50,
        evidenceCounted: false,
      })));
    }

    await recordAudit({ actorId, action: 'match.result.resolved', entityType: 'match_result_records', entityId: record.id, beforeState: beforeState as unknown as Record<string, unknown>, afterState: { resolution: resolution.approve ? 'approved' : 'no_result', note: resolution.note ?? null }, ipAddress: ip });

    const resolutionScope = await matchResultRepository.getMatchContext(record.matchId);

    await eventBusV2.emit('match:result-resolved', scopeResultPayload({ matchId: record.matchId, resultId: record.id, resolution: resolution.approve ? 'approved' : 'no_result', allUserIds: record.participantPayload.map((p) => p.userId) }, resolutionScope), { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1, actorId });
    await eventBusV2.emit('match:updated', { matchId: record.matchId }, { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  /** Admin: correct an approved result (score fix / outcome change). */
  async correctResult(resultId: number, actorId: number, payload: RawMatchResultPayload, ip?: string): Promise<MatchResultRecord> {
    const record = await matchResultRepository.findById(resultId);
    if (!record) throw new NotFoundError('result not found');
    if (record.submissionStatus !== 'approved') {
      throw new RulesValidationError('Only approved results can be corrected');
    }

    // Group 4 — validate against the record's FROZEN rules snapshot, never the
    // current active rule set (a correction must keep the original scoring
    // rules, not today's configuration). Fall back only for legacy records.
    const rules = record.rulesSnapshot ?? (await matchResultRepository.findActiveRuleSet(record.sportId))?.rules;
    if (!rules) throw new RulesValidationError('No sport format rules are configured');
    let validated;
    try {
      validated = validateAndComputeFinal(payload, rules);
    } catch (err) {
      if (err instanceof RulesValidationError) throw err;
      throw new RulesValidationError('Invalid result payload');
    }

    // Part C9 — the audit must preserve the pre-correction state.
    const beforeState = {
      raw_result: record.rawResult,
      final_result: record.finalResult,
      outcome: record.outcome,
      submission_status: record.submissionStatus,
    };
    const oldParticipants = await matchResultRepository.getParticipants(record.id);

    // The corrected participant rows are derived ONCE and reused both as the
    // persisted write and as the winner input for the knockout reconciliation —
    // so the bracket can only ever be reseated from the row set that is actually
    // committed.
    const correctedRows = record.participantPayload.map((s) => ({
      userId: s.userId,
      teamIndex: s.teamIndex,
      side: s.side,
      outcome: validated.finalResult.sideOutcomes[s.side],
      matchEvidence: validated.finalResult.sideEvidence[s.side],
      evidenceCounted: outcomeCountsForRating(validated.outcome),
    }));

    const resultWrite = async (conn?: PoolConnection) => {
      const updateFields = {
        raw_result: payload,
        finalResult: validated.finalResult,
        outcome: validated.outcome === 'abandoned' ? 'no_result' : validated.outcome,
        resolution_note: 'corrected',
      } as Record<string, unknown>;
      if (conn) {
        await matchResultRepository.updateResult(record.id, updateFields, conn);
        await matchResultRepository.replaceParticipants(record.id, record.matchId, correctedRows, conn);
        return;
      }
      await matchResultRepository.updateResult(record.id, updateFields);
      await matchResultRepository.replaceParticipants(record.id, record.matchId, correctedRows);
    };

    // G8-D-KO-CORRECTION — resolve the match context ONCE. It carries the live
    // tournament provenance (a result row can be a legacy NULL), and it scopes
    // every realtime event emitted below.
    const correctionScope = await matchResultRepository.getMatchContext(record.matchId);
    const tournamentId = correctionScope?.tournamentId ?? record.tournamentId ?? null;

    // G8-D-KO-CORRECTION — a tournament-bound result may be corrected ONLY while
    // the downstream bracket is still safely repairable. The planner is
    // READ-ONLY and throws `TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED` (409) when
    // the downstream match crossed the live-play boundary; the reconciler then
    // commits the corrected result AND the downstream bracket reseat in ONE
    // transaction, so `source = NEW WINNER` can never be committed while
    // `downstream = OLD WINNER`. A result with no tournament provenance has no
    // bracket downstream, so it keeps the historical single-writer path.
    let reconciliation: { case: string; targetSlotId: number | null; cancelledSharedMatchId: number | null; rematerialisedSharedMatchId: number | null } | null = null;
    if (tournamentId != null) {
      const { tournamentService } = await import('../../tournaments/application/tournament.service.js');
      const plan = await tournamentService.planKnockoutResultCorrection({
        resultId: record.id,
        sharedMatchId: record.matchId,
        tournamentId: Number(tournamentId),
        resultParticipants: correctedRows.map((r) => ({ userId: r.userId, side: r.side, outcome: r.outcome })),
      });
      const outcome = await tournamentService.reconcileKnockoutResultCorrection(plan, async (conn) => {
        await resultWrite(conn);
      });
      reconciliation = {
        case: outcome.case,
        targetSlotId: outcome.reseatedTargetSlotId,
        cancelledSharedMatchId: outcome.cancelledSharedMatchId,
        rematerialisedSharedMatchId: outcome.rematerialisedSharedMatchId,
      };
    } else {
      await resultWrite();
    }

    // Part C1 — re-apply evidence idempotently and recalculate immediately.
    // Rating runs AFTER the correction transaction has committed (it manages its
    // own connection), so a failed/rolled-back correction can never leave rating
    // evidence written for a result that was never corrected.
    const wasCounted = outcomeCountsForRating(record.outcome);
    const nowCounted = outcomeCountsForRating(validated.outcome);
    if (nowCounted) {
      await this.applyRatingForRecord(record.id, record.matchId, { force: true, oldParticipants });
    } else if (wasCounted) {
      // Round 2 (Item 1) — counted → no-result: keep historical evidence stored
      // but mark it inactive so it no longer contributes; recalc each player.
      await this.invalidateResultEvidence(record.id, record.matchId);
    }

    await recordAudit({
      actorId,
      action: 'match.result.corrected',
      entityType: 'match_result_records',
      entityId: record.id,
      beforeState: beforeState as unknown as Record<string, unknown>,
      // G8-D-KO-CORRECTION — the bracket reconciliation outcome rides on the
      // EXISTING audit action. No new audit action and no new provenance table:
      // a correction remains exactly one `match.result.corrected` entry.
      afterState: {
        ...(validated.finalResult as unknown as Record<string, unknown>),
        ...(reconciliation ? { knockout_reconciliation: reconciliation } : {}),
      },
      ipAddress: ip,
    });
    await eventBusV2.emit('match:result-corrected', scopeResultPayload({
      matchId: record.matchId, resultId: record.id, approvedBy: actorId,
      allUserIds: record.participantPayload.map((p) => p.userId),
    }, correctionScope), { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1, actorId });
    await eventBusV2.emit('match:updated', scopeResultPayload({ matchId: record.matchId }, correctionScope), { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1 });

    return (await matchResultRepository.findById(record.id))!;
  }

  /**
   * Round 2 (Item 1) — an approved result corrected to No Result keeps its
   * historical Match Evidence rows (never deleted) but marks them inactive so
   * they stop contributing to Overall Rating. Each participant's rating is
   * recalculated immediately and their stored rating_after reflects the new
   * rating.
   */
  private async invalidateResultEvidence(resultId: number, matchId: number): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        'SELECT * FROM match_result_records WHERE id = ?',
        [resultId],
      ) as any;
      const row = rows[0];
      if (!row) return;

      await ratingService.setMatchEvidenceActive('match_result', resultId, false, new Date().toISOString());

      const [parts] = await conn.execute(
        'SELECT * FROM match_result_participants WHERE result_id = ?',
        [resultId],
      ) as any;
      for (const p of parts) {
        const before = await ratingService.resolveOverallPercent(p.user_id, row.sport_id);
        const after = await ratingService.recalculate(
          p.user_id,
          row.sport_id,
          null,
          'match result corrected to no_result',
          `match_result:${resultId}`,
        );
        await conn.execute(
          `UPDATE match_result_participants
           SET rating_before = ?, rating_after = ?, evidence_counted = 0
           WHERE id = ?`,
          [before, after, p.id],
        );
      }

      await conn.execute(
        `UPDATE match_result_records SET evidence_counted = 0, rating_applied_at = NULL WHERE id = ?`,
        [resultId],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Part B.60-70 / C1 — deterministic, idempotent rating application for an
   * approved result. When `force` is true (correction) the already-applied
   * guard is bypassed so evidence is re-applied idempotently via the existing
   * source/source_ref mechanism (no duplicate evidence rows).
   */
  async applyRatingForRecord(
    resultId: number,
    matchId: number,
    opts: { force?: boolean; oldParticipants?: MatchResultParticipant[] } = {},
  ): Promise<void> {
    const { force = false, oldParticipants = [] } = opts;
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        'SELECT * FROM match_result_records WHERE id = ?',
        [resultId],
      ) as any;
      const row = rows[0];
      if (!row) return;
      if (!force && row.evidence_counted && row.rating_applied_at) {
        await conn.rollback();
        return;
      }

      const [parts] = await conn.execute(
        'SELECT * FROM match_result_participants WHERE result_id = ?',
        [resultId],
      ) as any;

      if (row.outcome !== 'no_result' && parts.length) {
        // Round 2/3 (Item 1) — ensure evidence is active/counting (reactivates a
        // previously invalidated No-Result correction without a new row).
        await ratingService.setMatchEvidenceActive('match_result', row.id, true, new Date().toISOString());
        for (const p of parts) {
          const evidenceValue = Number(p.match_evidence);
          const valuePercent = Number.isFinite(evidenceValue) ? evidenceValue : 50;
          const snapshot = await ratingService.resolveOverallPercentAt(p.user_id, row.sport_id, row.played_at);
          const { before, after } = await ratingService.applyEvidence({
            userId: p.user_id,
            sportId: row.sport_id,
            evidenceType: 'match_evidence',
            valuePercent,
            source: 'match_result',
            sourceRefId: row.id,
            occurredAt: row.played_at,
            changedBy: p.user_id,
            reason: `match result ${row.outcome}`,
          });
          if (force) {
            const old = oldParticipants.find((op) => Number(op.userId) === Number(p.user_id));
            await ratingService.adjustMatchStat(p.user_id, row.sport_id, old?.outcome ?? null, p.outcome);
          } else {
            await ratingService.recordMatchStat(p.user_id, row.sport_id, p.outcome);
          }
          await conn.execute(
            `UPDATE match_result_participants
             SET rating_snapshot_percent = ?, rating_before = ?, rating_after = ?, evidence_counted = 1
             WHERE id = ?`,
            [snapshot, before, after, p.id],
          );
        }
      }

      await conn.execute(
        `UPDATE match_result_records SET evidence_counted = 1, rating_applied_at = NOW() WHERE id = ?`,
        [resultId],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Worker: auto-approve pending results whose auto-approval deadline passed (E.60). */
  async autoApproveDueResults(): Promise<number> {
    const now = new Date().toISOString();
    const due = await matchResultRepository.findAutoApprovable(now);
    let approved = 0;
    for (const record of due) {
      try {
        // Part C8 — concurrency-safe: only succeeds while still pending.
        const ok = await matchResultRepository.approvePending(record.id, {
          submission_status: 'approved',
          accepted_by: null,
          accepted_at: now,
          auto_approved: true,
        });
        if (!ok) continue;
        await recordAudit({ actorId: null, action: 'match.result.auto_approved', entityType: 'match_result_records', entityId: record.id, reason: 'auto-approval deadline reached' });
        await this.applyRatingForRecord(record.id, record.matchId);
        const autoApproveScope = await matchResultRepository.getMatchContext(record.matchId);
        await eventBusV2.emit('match:result-auto-approved', scopeResultPayload({ matchId: record.matchId, resultId: record.id, allUserIds: record.participantPayload.map((p) => p.userId) }, autoApproveScope), { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1 });
        await eventBusV2.emit('match:updated', scopeResultPayload({ matchId: record.matchId }, autoApproveScope), { aggregateType: 'match', aggregateId: String(record.matchId), aggregateVersion: 1 });
        approved += 1;
      } catch (err) {
        log.error({ err, resultId: record.id }, 'auto-approve failed');
      }
    }
    return approved;
  }

  /** Worker: matches that finished 3+ days ago with no result move to 'no_result'. */
  async markExpiredNoResult(): Promise<number> {
    const now = new Date().toISOString();
    const candidates = await matchResultRepository.findExpiredNoResultMatches(now);
    let marked = 0;
    for (const m of candidates) {
      try {
        const existing = await matchResultRepository.findByMatchId(m.matchId);
        if (existing) continue;
        let format;
        if (m.ruleSnapshot) {
          format = { formatId: m.formatId ?? 0, ruleSetId: m.ruleSetId ?? 0, version: 0, rules: m.ruleSnapshot, standingsRules: null };
        } else {
          format = await matchResultRepository.findActiveRuleSet(m.sportId);
        }
        if (!format) continue;
        const sides = this.buildParticipantSlots(m.participantSlots, m.participantSlots[0]?.userId ?? 0);

        const resultId = await matchResultRepository.insert({
          matchId: m.matchId,
          sportId: m.sportId,
          formatId: format.formatId,
          ruleSetId: format.ruleSetId,
          rulesSnapshot: format.rules,
          matchType: 'public',
          playedAt: m.playedAt,
          branchId: m.branchId,
          resourceId: m.resourceId,
          timezone: m.timezone,
          participantPayload: sides,
          rawResult: { outcome: 'abandoned', winner: null, score: null, termination: null },
          outcome: 'no_result',
          submissionStatus: 'no_result',
          submittedBy: null,
          submittedAt: null,
          submissionDeadlineAt: null,
          autoApprovalDeadlineAt: null,
        });
        await matchResultRepository.replaceParticipants(resultId, m.matchId, sides.map((s) => ({
          userId: s.userId,
          teamIndex: s.teamIndex,
          side: s.side,
          outcome: 'draw',
          matchEvidence: 50,
          evidenceCounted: false,
        })));
        await recordAudit({ actorId: null, action: 'match.result.no_result_marked', entityType: 'match_result_records', entityId: resultId, reason: 'submission window expired' });
        const noResultScope = await matchResultRepository.getMatchContext(m.matchId);
        await eventBusV2.emit('match:result-no-result', scopeResultPayload({ matchId: m.matchId, resultId, allUserIds: m.participantUserIds }, noResultScope), { aggregateType: 'match', aggregateId: String(m.matchId), aggregateVersion: 1 });
        marked += 1;
      } catch (err) {
        log.error({ err, matchId: m.matchId }, 'no-result marking failed');
      }
    }
    return marked;
  }

  async getResultForMatch(matchId: number): Promise<MatchResultRecord | null> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) return null;
    return matchResultRepository.findByMatchId(matchIdActual);
  }

  async getResultForMatchWithParticipants(matchId: number): Promise<import('../domain/match-result.types.js').MatchResultDetailView | null> {
    const matchIdActual = await matchResultRepository.resolveMatchId(matchId);
    if (!matchIdActual) return null;
    const record = await matchResultRepository.findByMatchId(matchIdActual);
    if (!record) return null;
    return matchResultRepository.getResultDetailView(record.id);
  }

  async listForUser(userId: number, limit = 20, offset = 0) {
    return matchResultRepository.listForUser(userId, limit, offset);
  }

  async listForAdmin(filters: { status?: string; limit?: number; offset?: number }) {
    return matchResultRepository.listForAdmin(filters);
  }

  async listForOrg(orgId: number, filters: { status?: string; limit?: number; offset?: number }) {
    return matchResultRepository.listForOrg(orgId, filters);
  }

  async getResultOrgId(resultId: number): Promise<number | null> {
    return matchResultRepository.getResultOrgId(resultId);
  }

  /**
   * Build result participant slots from the Match's authoritative side/team
   * assignments (Group 2). When every participant carries an authoritative
   * `side`, those assignments are used verbatim and validated against the
   * Match's frozen format (players_per_side cardinality). Legacy matches
   * without authoritative sides fall back to the historical insertion-order
   * split — isolated and never presented as authoritative.
   */
  private buildParticipantSlots(
    slots: MatchParticipantSlot[],
    _preferFirst: number,
  ): ParticipantSlot[] {
    const authoritative = slots.filter((s) => s.side !== null);
    const complete = authoritative.length > 0 && authoritative.length === slots.length;
    if (!complete) {
      return this.legacyBuildParticipantSlots(slots.map((s) => s.userId));
    }
    return slots.map((s) => ({
      userId: s.userId,
      side: s.side as 'home' | 'away',
      teamIndex: s.teamIndex ?? (s.side === 'away' ? 1 : 0),
    }));
  }

  /** LEGACY fallback ONLY — insertion-order half-split for matches created before authoritative sides existed. */
  private legacyBuildParticipantSlots(userIds: number[]): ParticipantSlot[] {
    const unique = Array.from(new Set(userIds.filter((u) => u != null)));
    const half = Math.ceil(unique.length / 2);
    return unique.map((userId, idx) => ({
      userId,
      side: idx < half ? 'home' : 'away',
      teamIndex: idx < half ? 0 : 1,
    }));
  }

  /** Validate side cardinality against the Match's frozen format snapshot. */
  private validateSideCardinality(slots: ParticipantSlot[], formatSnapshot: MatchFormatSnapshot | null): void {
    if (!formatSnapshot) return;
    const capacity = formatSnapshot.playersPerSide;
    if (capacity == null || capacity <= 0) return;
    const homeCount = slots.filter((s) => s.side === 'home').length;
    const awayCount = slots.filter((s) => s.side === 'away').length;
    if (homeCount > capacity) {
      throw new RulesValidationError(`Home side has ${homeCount} participants, exceeding the ${formatSnapshot.formatType} format capacity of ${capacity}`);
    }
    if (awayCount > capacity) {
      throw new RulesValidationError(`Away side has ${awayCount} participants, exceeding the ${formatSnapshot.formatType} format capacity of ${capacity}`);
    }
  }
}

export const matchResultService = new MatchResultService();