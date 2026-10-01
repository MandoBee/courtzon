import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { dispatchToUser } from './dispatcher.service.js';
import { renderRecipientNotice } from './template.service.js';
import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';
import { participantMemberRepository } from '../../tournaments/infrastructure/repositories/participant-member.repository.js';
import { participantDrawRepository } from '../../tournaments/infrastructure/repositories/participant-draw.repository.js';
import { tournamentRepository } from '../../tournaments/infrastructure/repositories/tournament.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

type RowData = RowDataPacket[];

const log = createModuleLogger('tournament-notification');

const TOURNAMENT_ADMIN_PERMISSION = 'tournament.manage';

const a = (route: string) => ({ route });

interface HandleContext {
  eventName: string;
  categorySlug: string;
  data: Record<string, any>;
}

interface RecipientDispatchContext extends HandleContext {
  organisationId?: number | null;
  relatedEntityType: string;
  relatedEntityId: string;
  route: string;
  locale?: string;
}

/**
 * G9-D5-B — Tournament notification recipient resolution.
 *
 * Resolves the CORRECT audience for each tournament lifecycle event from the
 * authoritative tournament data (tournament_participants,
 * tournament_participant_members, tournament_matches, referees) and dispatches
 * through the existing notification dispatcher with notification-level
 * idempotency (hasExisting). Realtime/socket delivery is untouched.
 *
 * Audience rules (locked):
 *  - Withdrawn participant receives a confirmation, even when nothing resolved.
 *  - An advancing opponent receives ONE combined "you advance" notification.
 *  - Pair/team recipients are the ACTIVE normalized roster members.
 *  - Referees receive only directly match-relevant notifications.
 *  - Waiting-list users are never notified for generic withdrawals.
 *  - Org staff / admins receive material lifecycle events (tenant-scoped).
 */
class TournamentNotificationService {
  // ── Roster resolution ──

  /** Active members of a tournament participant (individual/pair/team). */
  private async activeMemberUserIds(participantId: number): Promise<number[]> {
    const members = await participantMemberRepository.listMembersByParticipant(participantId);
    return members
      .filter((m) => m.status === 'active')
      .map((m) => Number(m.user_id));
  }

  /** Referee user id from the authoritative tournament match referee relation. */
  private async refereeUserIds(refereeId: number): Promise<number[]> {
    if (!refereeId) return [];
    const [rows] = await getPool().query<RowData>(
      'SELECT user_id FROM referees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [refereeId],
    );
    return rows.length ? [Number((rows[0] as any).user_id)] : [];
  }

  // ── Tenant / permission resolution (existing infrastructure, dedup-aware) ──

  /** Organisation staff user ids (user_organisations) — tenant-scoped. */
  private async orgStaffUserIds(organisationId: number): Promise<number[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_organisations uo ON u.id = uo.user_id
       WHERE uo.organisation_id = ? AND u.account_status = 'active' AND u.deleted_at IS NULL`,
      [organisationId],
    );
    return rows.map((r) => Number((r as any).id));
  }

  /** Users holding a permission key (role_permissions → permissions). */
  private async permissionUserIds(permissionKey: string): Promise<number[]> {
    const [rows] = await getPool().query<RowData>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE p.permission_key = ? AND u.account_status = 'active' AND u.deleted_at IS NULL`,
      [permissionKey],
    );
    return rows.map((r) => Number((r as any).id));
  }

  // ── Withdrawal advancement detection ──

  /**
   * Bracket slots resolved BY a withdrawal: the withdrawn participant is one
   * side, the slot completed with a winner, and no ACTIVE shared Match exists
   * (either no shared match was ever materialised or it was cancelled). This
   * excludes result-driven completions (which carry an active shared Match).
   */
  private async findWithdrawalAdvancedSlots(
    tournamentId: number,
    withdrawnParticipantId: number,
  ): Promise<Array<{ id: number; participant1_id: number | null; participant2_id: number | null }>> {
    const [rows] = await getPool().query<RowData>(
      `SELECT tm.id, tm.participant1_id, tm.participant2_id
       FROM tournament_matches tm
       LEFT JOIN matches m ON m.id = tm.match_id
       WHERE tm.tournament_id = ?
         AND (tm.participant1_id = ? OR tm.participant2_id = ?)
         AND tm.status = 'completed'
         AND tm.progression_state = 'completed'
         AND tm.winner_id IS NOT NULL
         AND (tm.match_id IS NULL OR m.status = 'cancelled')`,
      [tournamentId, withdrawnParticipantId, withdrawnParticipantId],
    );
    return rows as Array<{ id: number; participant1_id: number | null; participant2_id: number | null }>;
  }

  // ── Dedup-aware dispatch ──

  private async dispatchToRecipients(userIds: number[], role: string, ctx: RecipientDispatchContext): Promise<void> {
    const unique = Array.from(new Set(userIds));
    for (const userId of unique) {
      if (await notificationRepository.hasExisting(userId, ctx.eventName, ctx.relatedEntityType, ctx.relatedEntityId)) {
        continue;
      }
      const notice = renderRecipientNotice(ctx.eventName, role, ctx.locale ?? 'en', ctx.data);
      await dispatchToUser({
        userId,
        eventName: ctx.eventName,
        categorySlug: ctx.categorySlug,
        data: ctx.data,
        organisationId: ctx.organisationId ?? undefined,
        relatedEntityType: ctx.relatedEntityType,
        relatedEntityId: ctx.relatedEntityId,
        action: a(ctx.route),
        renderedTitle: notice?.title,
        renderedBody: notice?.body,
      });
    }
  }

  private async dispatchOrgStaffAndAdmins(ctx: RecipientDispatchContext): Promise<void> {
    if (ctx.organisationId != null) {
      const staff = await this.orgStaffUserIds(ctx.organisationId);
      if (staff.length) {
        await this.dispatchToRecipients(staff, 'orgStaff', ctx);
      }
    }
    const admins = await this.permissionUserIds(TOURNAMENT_ADMIN_PERMISSION);
    if (admins.length) {
      await this.dispatchToRecipients(admins, 'admin', ctx);
    }
  }

  // ── Event handlers ──

  private async handleWithdrawalResolved(ctx: HandleContext): Promise<void> {
    const { tournamentId, withdrawnParticipantId, organisationId } = ctx.data;
    // G9-D5-E — semantic key is the WITHDRAWN PARTICIPANT (not the tournament).
    // Two distinct withdrawals in the same tournament are separate semantic
    // events: org staff / admins / an advancing opponent must not collapse two
    // withdrawals into one notification. Within a single withdrawal, every
    // recipient pass shares this key so a user reached through multiple paths
    // (participant + org staff + admin) still receives exactly one notification.
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId: organisationId ?? null,
      relatedEntityType: 'tournament_participant',
      relatedEntityId: String(withdrawnParticipantId),
      route: `/tournaments/${tournamentId}`,
    };

    // 1) Withdrawn participant confirmation (always — even when nothing resolved).
    const withdrawnUserIds = await this.activeMemberUserIds(Number(withdrawnParticipantId));
    if (withdrawnUserIds.length) {
      await this.dispatchToRecipients(withdrawnUserIds, 'withdrawn', base);
    }

    // 2) Advancing opponent(s) — ONE combined notification per opponent.
    const advancedSlots = await this.findWithdrawalAdvancedSlots(Number(tournamentId), Number(withdrawnParticipantId));
    const opponentUserIds: number[] = [];
    for (const slot of advancedSlots) {
      const opponentId = Number(slot.participant1_id) === Number(withdrawnParticipantId)
        ? Number(slot.participant2_id)
        : Number(slot.participant1_id);
      if (!opponentId || opponentId === Number(withdrawnParticipantId)) continue;
      const roster = await this.activeMemberUserIds(opponentId);
      opponentUserIds.push(...roster);
    }
    if (opponentUserIds.length) {
      await this.dispatchToRecipients(opponentUserIds, 'advancing', base);
    }

    // 3) Material withdrawal → org staff + admins.
    await this.dispatchOrgStaffAndAdmins(base);
  }

  private async handleParticipantReplaced(ctx: HandleContext): Promise<void> {
    const { tournamentId, withdrawnParticipantId, replacementParticipantId } = ctx.data;
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament_participant',
      relatedEntityId: String(withdrawnParticipantId),
      route: `/tournaments/${tournamentId}`,
    };

    const outgoingUserIds = await this.activeMemberUserIds(Number(withdrawnParticipantId));
    if (outgoingUserIds.length) {
      await this.dispatchToRecipients(outgoingUserIds, 'outgoing', base);
    }
    const replacementUserIds = await this.activeMemberUserIds(Number(replacementParticipantId));
    if (replacementUserIds.length) {
      await this.dispatchToRecipients(replacementUserIds, 'replacement', base);
    }

    await this.dispatchOrgStaffAndAdmins(base);
  }

  private async handleStageCompleted(ctx: HandleContext): Promise<void> {
    const { tournamentId, stageId, organisationId } = ctx.data;
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId: organisationId ?? null,
      relatedEntityType: 'tournament_stage',
      relatedEntityId: String(stageId),
      route: `/tournaments/${tournamentId}`,
    };

    // Active participants of the completed stage (never historical/waitlisted).
    const matches = await tournamentRepository.findMatches(Number(tournamentId));
    const participantIds = new Set<number>();
    for (const m of matches) {
      if (Number(m.stage_id) !== Number(stageId)) continue;
      if (m.participant1_id != null) participantIds.add(Number(m.participant1_id));
      if (m.participant2_id != null) participantIds.add(Number(m.participant2_id));
    }
    const participantUserIds: number[] = [];
    for (const participantId of participantIds) {
      const participant = await participantDrawRepository.findParticipantById(participantId);
      if (!participant || participant.status !== 'active') continue;
      const roster = await this.activeMemberUserIds(participantId);
      participantUserIds.push(...roster);
    }
    if (participantUserIds.length) {
      await this.dispatchToRecipients(participantUserIds, 'participant', base);
    }

    await this.dispatchOrgStaffAndAdmins(base);
  }

  private async handleMatchCreated(ctx: HandleContext): Promise<void> {
    const { tournamentId, tournamentMatchId, matchId, organisationId } = ctx.data;
    const slot = tournamentMatchId != null
      ? await tournamentRepository.findMatchById(Number(tournamentMatchId))
      : matchId != null ? await tournamentRepository.findMatchBySharedMatchId(Number(matchId)) : null;
    if (!slot) {
      log.warn({ tournamentId, tournamentMatchId, matchId }, 'match-created: slot not found — skipped');
      return;
    }

    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId: organisationId ?? null,
      relatedEntityType: 'tournament_match',
      relatedEntityId: String(slot.id),
      route: `/tournaments/${tournamentId}`,
    };

    for (const participantId of [slot.participant1_id, slot.participant2_id]) {
      if (participantId == null) continue;
      const roster = await this.activeMemberUserIds(Number(participantId));
      if (roster.length) {
        await this.dispatchToRecipients(roster, 'participant', base);
      }
    }

    if (slot.referee_id != null) {
      const refereeUserIds = await this.refereeUserIds(Number(slot.referee_id));
      if (refereeUserIds.length) {
        await this.dispatchToRecipients(refereeUserIds, 'referee', base);
      }
    }

    await this.dispatchOrgStaffAndAdmins(base);
  }

  private async handleMatchProgressed(ctx: HandleContext): Promise<void> {
    const { tournamentId, fromSlotId, resultId, organisationId } = ctx.data;
    // Lone-slot (non-result) progressions are withdrawal/by-product resolutions:
    // the withdrawal-resolved handler owns the "you advance" notification, so a
    // second participant notification is never sent for the same transition.
    if (resultId == null) return;

    const slot = fromSlotId != null ? await tournamentRepository.findMatchById(Number(fromSlotId)) : null;
    if (!slot) {
      log.warn({ tournamentId, fromSlotId }, 'match-progressed: slot not found — skipped');
      return;
    }

    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId: organisationId ?? null,
      relatedEntityType: 'tournament_match',
      relatedEntityId: String(slot.id),
      route: `/tournaments/${tournamentId}`,
    };

    for (const participantId of [slot.participant1_id, slot.participant2_id]) {
      if (participantId == null) continue;
      const roster = await this.activeMemberUserIds(Number(participantId));
      if (roster.length) {
        await this.dispatchToRecipients(roster, 'participant', base);
      }
    }

    if (slot.referee_id != null) {
      const refereeUserIds = await this.refereeUserIds(Number(slot.referee_id));
      if (refereeUserIds.length) {
        await this.dispatchToRecipients(refereeUserIds, 'referee', base);
      }
    }
  }

  private async handleRegistrationRefunded(ctx: HandleContext): Promise<void> {
    const { tournamentId, registrationId, userId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'registration-refunded: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament_registration',
      relatedEntityId: String(registrationId ?? tournamentId),
      route: `/tournaments/${tournamentId}`,
    };
    // 1) The cancelled player receives the refund confirmation.
    if (userId != null) {
      await this.dispatchToRecipients([Number(userId)], 'player', base);
    }
    // 2) Organisation staff + admins receive the refund notice.
    await this.dispatchOrgStaffAndAdmins(base);
  }

  /**
   * G11.10 D1 — Round-robin standings finalisation. The ranked standings are
   * now binding (prize obligation). Audience is ORG STAFF + ADMINS ONLY — RR
   * participants are intentionally NEVER notified here (their course is
   * surfaced through tournament.completed / results).
   */
  private async handleStandingsFinalized(ctx: HandleContext): Promise<void> {
    const { tournamentId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'standings-finalized: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    await this.dispatchOrgStaffAndAdmins({
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    });
  }

  /**
   * G11.10 D2 — A player requested a refund for their registration. Org staff
   * review requests, so the audience is ORG STAFF + ADMINS ONLY (tenant-scoped,
   * dedup-aware). Unrelated players are never notified.
   */
  private async handleRefundRequested(ctx: HandleContext): Promise<void> {
    const { tournamentId, registrationId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'refund-requested: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    await this.dispatchOrgStaffAndAdmins({
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament_registration',
      relatedEntityId: String(registrationId ?? tournamentId),
      route: `/tournaments/${tournamentId}`,
    });
  }

  /**
   * G11.10 D4 — Registration window closed. The relevant players (active
   * registered participants' rosters) plus org staff + admins are notified.
   * Related entity is the tournament (one notification per tournament).
   */
  private async handleRegistrationClosed(ctx: HandleContext): Promise<void> {
    const { tournamentId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'registration-closed: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    };

    // 1) Active registered participants (individual/pair/team rosters).
    const participants = await participantDrawRepository.listParticipantsByTournament(Number(tournamentId));
    const playerUserIds: number[] = [];
    for (const p of participants) {
      if (String(p.status) !== 'active') continue;
      const roster = await this.activeMemberUserIds(Number(p.id));
      playerUserIds.push(...roster);
    }
    if (playerUserIds.length) {
      await this.dispatchToRecipients(playerUserIds, 'player', base);
    }

    // 2) Org staff + admins.
    await this.dispatchOrgStaffAndAdmins(base);
  }

  /**
   * G11.11 — Tournament CANCELLED. Audience: active participants (rosters) +
   * org staff + admins. The cancelled tournament's registered players must
   * never be left silently stranded.
   */
  private async handleCancelled(ctx: HandleContext): Promise<void> {
    const { tournamentId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'cancelled: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    };
    const playerUserIds = await this.activeParticipantRosterUserIds(Number(tournamentId));
    if (playerUserIds.length) {
      await this.dispatchToRecipients(playerUserIds, 'player', base);
    }
    await this.dispatchOrgStaffAndAdmins(base);
  }

  /**
   * G11.11 X1 — Tournament ARCHIVED. Administrative archival: org staff +
   * admins ONLY — players are intentionally never notified.
   */
  private async handleArchived(ctx: HandleContext): Promise<void> {
    const { tournamentId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'archived: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    await this.dispatchOrgStaffAndAdmins({
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    });
  }

  /**
   * G11.14 — Tournament STARTED. Audience mirrors the completed-event model:
   * active participants (rosters) + org staff + admins (tenant-scoped, deduped).
   */
  private async handleStarted(ctx: HandleContext): Promise<void> {
    const { tournamentId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'started: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    };
    const playerUserIds = await this.activeParticipantRosterUserIds(Number(tournamentId));
    if (playerUserIds.length) {
      await this.dispatchToRecipients(playerUserIds, 'player', base);
    }
    await this.dispatchOrgStaffAndAdmins(base);
  }

  /**
   * G11.11 X2 — Operator-driven bracket/knockout completion (no winner carried).
   * Audience: active participants + org staff + admins. When a winner IS present
   * the engine dispatched it first with winner semantics; this service path uses
   * the same (user, tournament:completed, tournament) dedup key so the winner is
   * never notified twice. Re-runs are no-ops thanks to hasExisting().
   */
  private async handleCompleted(ctx: HandleContext): Promise<void> {
    const { tournamentId, userId } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'completed: missing tournamentId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const base: RecipientDispatchContext = {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament',
      relatedEntityId: String(tournamentId),
      route: `/tournaments/${tournamentId}`,
    };
    // Defensive: if a winner is carried, ensure the winner notice uses the same
    // dedup key — the participant pass below skips them via hasExisting().
    if (userId != null) {
      await this.dispatchToRecipients([Number(userId)], 'winner', base);
    }
    const playerUserIds = await this.activeParticipantRosterUserIds(Number(tournamentId));
    if (playerUserIds.length) {
      await this.dispatchToRecipients(playerUserIds, 'participant', base);
    }
    await this.dispatchOrgStaffAndAdmins(base);
  }

  /**
   * G11.11 X3 — refund-request verdict transparency. Only status 'rejected' is
   * player-facing here: approval is executed immediately and the existing
   * G11.8 registration-refunded flow already notifies the player; never send a
   * duplicate.
   */
  private async handleRefundRequestUpdated(ctx: HandleContext): Promise<void> {
    const { tournamentId, registrationId, status } = ctx.data;
    if (tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'refund-request-updated: missing tournamentId — skipped');
      return;
    }
    if (status !== 'rejected') return; // executed/approved → covered by G11.8 flow.
    const userId = ctx.data.userId != null ? Number(ctx.data.userId) : null;
    if (userId == null) {
      log.warn({ eventName: ctx.eventName }, 'refund-request-updated rejected without userId — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    await this.dispatchToRecipients([userId], 'player', {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament_registration',
      relatedEntityId: String(registrationId ?? tournamentId),
      route: `/tournaments/${tournamentId}`,
    });
  }

  /**
   * G11.11 X5 — a participant was DISQUALIFIED. Only the affected participant's
   * active roster members receive the player-facing notice; other tournament
   * participants are never notified about another participant's disqualification.
   */
  private async handleParticipantDisqualified(ctx: HandleContext): Promise<void> {
    const { tournamentId, participantId } = ctx.data;
    if (participantId == null || tournamentId == null) {
      log.warn({ eventName: ctx.eventName }, 'participant disqualified: missing ids — skipped');
      return;
    }
    const organisationId = ctx.data.organisationId ?? await tournamentRepository.getOrganisationId(Number(tournamentId));
    const roster = await this.activeMemberUserIds(Number(participantId));
    if (!roster.length) return;
    await this.dispatchToRecipients(roster, 'disqualified', {
      ...ctx,
      organisationId,
      relatedEntityType: 'tournament_participant',
      relatedEntityId: String(participantId),
      route: `/tournaments/${tournamentId}`,
    });
  }

  /** Active roster user ids across every ACTIVE participant of a tournament. */
  private async activeParticipantRosterUserIds(tournamentId: number): Promise<number[]> {
    const participants = await participantDrawRepository.listParticipantsByTournament(tournamentId);
    const userActorIds: number[] = [];
    for (const p of participants) {
      if (String(p.status) !== 'active') continue;
      const roster = await this.activeMemberUserIds(Number(p.id));
      userActorIds.push(...roster);
    }
    return userActorIds;
  }

  async handle(ctx: HandleContext): Promise<void> {
    try {
      switch (ctx.eventName) {
        case 'tournament:withdrawal-resolved':
          await this.handleWithdrawalResolved(ctx);
          break;
        case 'tournament:registration-refunded':
          await this.handleRegistrationRefunded(ctx);
          break;
        case 'tournament:participant-replaced':
          await this.handleParticipantReplaced(ctx);
          break;
        case 'tournament:stage-completed':
          await this.handleStageCompleted(ctx);
          break;
        case 'tournament:match-created':
          await this.handleMatchCreated(ctx);
          break;
        case 'tournament:match-progressed':
          await this.handleMatchProgressed(ctx);
          break;
        case 'tournament:standings-finalized':
          await this.handleStandingsFinalized(ctx);
          break;
        case 'tournament:refund-requested':
          await this.handleRefundRequested(ctx);
          break;
        case 'tournament:registration-closed':
          await this.handleRegistrationClosed(ctx);
          break;
        case 'tournament:cancelled':
          await this.handleCancelled(ctx);
          break;
        case 'tournament:archived':
          await this.handleArchived(ctx);
          break;
        case 'tournament:completed':
          await this.handleCompleted(ctx);
          break;
        case 'tournament:started':
          await this.handleStarted(ctx);
          break;
        case 'tournament:refund-request-updated':
          await this.handleRefundRequestUpdated(ctx);
          break;
        case 'tournament:participant-updated':
          await this.handleParticipantDisqualified(ctx);
          break;
        default:
          log.warn({ eventName: ctx.eventName }, 'tournament-notification: unhandled event');
      }
    } catch (err) {
      log.error({ err, eventName: ctx.eventName }, 'tournament notification recipient resolution failed');
    }
  }
}

export const tournamentNotificationService = new TournamentNotificationService();