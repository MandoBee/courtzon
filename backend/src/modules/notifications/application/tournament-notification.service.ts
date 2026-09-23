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

  async handle(ctx: HandleContext): Promise<void> {
    try {
      switch (ctx.eventName) {
        case 'tournament:withdrawal-resolved':
          await this.handleWithdrawalResolved(ctx);
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
        default:
          log.warn({ eventName: ctx.eventName }, 'tournament-notification: unhandled event');
      }
    } catch (err) {
      log.error({ err, eventName: ctx.eventName }, 'tournament notification recipient resolution failed');
    }
  }
}

export const tournamentNotificationService = new TournamentNotificationService();