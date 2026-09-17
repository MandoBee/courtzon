import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { matchRepository } from '../../infrastructure/repositories/match.repository.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { matchmakingService } from './matchmaking.service.js';
import { invitationService } from './invitation.service.js';
import { joinRequestService } from './join-request.service.js';
import { participantService } from './participant.service.js';
import { waitingListService } from './waiting-list.service.js';
import { sessionService } from './session.service.js';
import { Match } from '../../domain/match.entity.js';
import { Participant } from '../../domain/participant.entity.js';
import { assignNextParticipantSide } from '../../domain/participant-side.js';
import type { MatchFormatSnapshot, MatchFormatType } from '../../domain/match.types.js';
import { matchResultRepository } from '../../../match-result/infrastructure/match-result.repository.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('match');

export class MatchService {
  async createFromBooking(
    bookingId: number,
    bookingType: string,
    explicitFormatId?: number
  ): Promise<Match | null> {
    log.info({ bookingId, bookingType }, 'createFromBooking called');

    if (bookingType !== 'public_match') {
      log.info({ bookingId, bookingType }, 'Not a public_match — skipping');
      return null;
    }

    const pool = getPool();

    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM matches WHERE booking_id = ?', [bookingId]
    );
    if (existing.length) {
      log.info({ bookingId, matchId: (existing[0] as any).id }, 'Match already exists for booking — skipping');
      return null;
    }

    const [rows] = await pool.execute<RowData>(
      `SELECT b.id, b.user_id, b.resource_id, r.sport_id,
              b.booking_date, b.start_time, b.end_time
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       WHERE b.id = ?`, [bookingId]
    );
    if (!rows.length) {
      log.warn({ bookingId }, 'Booking not found in database for match creation');
      return null;
    }
    log.info({ bookingId, userId: (rows[0] as any).user_id }, 'Booking found — proceeding to create match');

    const bk = rows[0] as any;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const resolvedFormat = await this.resolveMatchFormat(bk.sport_id, explicitFormatId);
      const formatId = resolvedFormat?.formatId ?? null;
      const formatSnapshot = resolvedFormat ? this.buildFormatSnapshot(resolvedFormat) : null;

      // Group 4 — freeze the authoritative rule set at Match creation so a
      // later rule-version change never reinterprets this Match's scoring.
      // Falls back to null (legacy) when no format/rule set is configured.
      let ruleSetId: number | null = null;
      let ruleSnapshot: Record<string, unknown> | null = null;
      if (formatId != null) {
        const ruleSet = await matchResultRepository.findActiveRuleSetForFormat(formatId);
        if (ruleSet) {
          ruleSetId = ruleSet.ruleSetId;
          ruleSnapshot = (typeof ruleSet.rules === 'string' ? JSON.parse(ruleSet.rules) : ruleSet.rules) as Record<string, unknown>;
        }
      }

      // Authoritative host side assignment (Group 2): the creator/host always
      // opens on 'home' (teamIndex 0) when the Match has a format. Format-less
      // matches keep a NULL side (legacy fallback preserved).
      const hostSide = assignNextParticipantSide(formatSnapshot, []);

      const [matchResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO matches (type, status, booking_id, sport_id, format_id, format_snapshot, rule_set_id, rule_snapshot)
         VALUES ('public', 'open', ?, ?, ?, ?, ?, ?)`,
        [bookingId, bk.sport_id, formatId, formatSnapshot ? JSON.stringify(formatSnapshot) : null, ruleSetId, ruleSnapshot ? JSON.stringify(ruleSnapshot) : null]
      );
      const matchId = matchResult.insertId;

      const [mmRows] = await conn.execute<RowData>(
        `SELECT min_age, max_age, target_gender, target_level_id,
                max_players, deadline, auto_apply
         FROM booking_matchmaking_requests WHERE booking_id = ?`, [bookingId]
      );
      const mm = (mmRows as any[])[0] || {};
      // max_players on the booking request is the number of ADDITIONAL players
      // to accept (EXCLUDING the creator/host). public_match_details.max_players
      // is compared against participantCount (which INCLUDES the host), so we
      // persist TOTAL = additional + 1 (host). E.g. request 3 => 4 total.
      const additionalPlayers = Number(mm.max_players) > 0 ? Number(mm.max_players) : 2;
      const totalMaxPlayers = additionalPlayers + 1;

      await conn.execute(
        `INSERT INTO public_match_details
         (match_id, creator_id, visibility, auto_accept, max_players,
          min_age, max_age, target_gender, target_level_id, deadline)
         VALUES (?, ?, 'public', ?, ?, ?, ?, ?, ?, ?)`,
        [matchId, bk.user_id, mm.auto_apply || 0, totalMaxPlayers,
         mm.min_age || null, mm.max_age || null,
         mm.target_gender || 'any', mm.target_level_id || null,
         mm.deadline || null]
      );

      await conn.execute(
        `INSERT INTO match_participants (match_id, user_id, role, side, team_index, joined_at)
         VALUES (?, ?, 'host', ?, ?, NOW())`,
        [matchId, bk.user_id, hostSide?.side ?? null, hostSide?.teamIndex ?? null]
      );

      await conn.commit();

      const match = await matchRepository.findById(matchId);
      if (!match) {
        log.error({ matchId }, 'Failed to load created match');
        return null;
      }

      matchEventPublisher.publish({
        type: 'match:created',
        payload: {
          matchId, type: 'public', sportId: bk.sport_id,
          creatorId: bk.user_id, timestamp: new Date().toISOString(),
          formatId: formatId ?? null,
        },
      });

      const { MatchCriteria } = await import('../../domain/match-criteria.vo.js');
      const criteria = new MatchCriteria({
        minAge: mm.min_age || null, maxAge: mm.max_age || null,
        targetGender: mm.target_gender || 'any', targetLevelId: mm.target_level_id || null,
      });

      matchmakingService.sendInvitations(matchId, bk.sport_id, criteria, bk.user_id)
        .catch((err) => log.error({ err, matchId }, 'Matchmaking failed'));

      return match;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Resolve the authoritative Sport Format for a Match (Group 1).
   *
   * - No explicit format → the sport's single default/active format
   *   (`sport_formats` is the source of truth; no sport-name hardcoding).
   * - Explicit format_id (future Match-creation flow) → validated: exists,
   *   active, belongs to the Match sport, format_type valid.
   *
   * Falls back to `null` when the sport has no active format, preserving the
   * legacy format-less Match behaviour (never silently guesses).
   */
  private async resolveMatchFormat(sportId: number, explicitFormatId?: number): Promise<{
    formatId: number; formatType: MatchFormatType; playersPerSide: number | null; name: string;
  } | null> {
    if (explicitFormatId != null) {
      const fmt = await matchResultRepository.findFormatById(explicitFormatId);
      if (!fmt) {
        throw new AppError('Match format not found', 404, 'MATCH_FORMAT_NOT_FOUND');
      }
      if (!fmt.isActive) {
        throw new AppError('Match format is not active', 400, 'MATCH_FORMAT_INACTIVE');
      }
      if (fmt.sportId !== sportId) {
        throw new AppError('Match format does not belong to the Match sport', 400, 'MATCH_FORMAT_SPORT_MISMATCH');
      }
      return { formatId: fmt.formatId, formatType: fmt.formatType, playersPerSide: fmt.playersPerSide, name: fmt.name };
    }
    const def = await matchResultRepository.resolveDefaultFormatForSport(sportId);
    if (!def) {
      log.warn({ sportId }, 'No active sport format configured for sport — Match created without a format');
      return null;
    }
    return def;
  }

  private buildFormatSnapshot(fmt: {
    formatId: number; formatType: MatchFormatType; playersPerSide: number | null; name: string;
  }): MatchFormatSnapshot {
    return {
      formatId: fmt.formatId,
      formatType: fmt.formatType,
      playersPerSide: fmt.playersPerSide,
      name: fmt.name,
    };
  }

  async cancelMatch(matchId: number, reason?: string): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const match = await matchRepository.findById(matchId, conn);
      if (!match) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');

      match.transition('cancelled');

      await conn.execute(
        "UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = ?",
        [matchId]
      );

      await invitationService.expireByMatchId(matchId, conn);
      await joinRequestService.autoRejectPendingByMatchId(matchId, conn);

      await conn.execute(
        'DELETE FROM match_participants WHERE match_id = ?', [matchId]
      );
      await conn.execute(
        'DELETE FROM waiting_list WHERE match_id = ?', [matchId]
      );

      await conn.commit();

      matchEventPublisher.publish({
        type: 'match:cancelled',
        payload: { matchId, reason, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async closeMatch(matchId: number): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const match = await matchRepository.findById(matchId, conn);
      if (!match) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');

      match.transition('closed');

      await conn.execute(
        "UPDATE matches SET status = 'closed', updated_at = NOW() WHERE id = ?",
        [matchId]
      );

      await invitationService.expireByMatchId(matchId, conn);

      await conn.commit();

      matchEventPublisher.publish({
        type: 'match:status_changed',
        payload: {
          matchId, fromStatus: match.status,
          toStatus: 'closed', timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Start a match — delegates to the existing `sessionService.start`, which
   * requires the match to be `closed`, creates the `match_sessions` row and
   * emits the canonical `session:started` event. This is the single lifecycle
   * entry point exposed to the API layer (no parallel mechanism).
   */
  async startMatch(matchId: number): Promise<void> {
    await sessionService.start(matchId);
  }

  /**
   * Complete a match — delegates to the existing `sessionService.complete`,
   * which requires an in-progress session, records `ended_at` (the source of
   * `played_at` for result processing) and emits `session:completed`. The
   * scheduled-end auto path is handled separately by `autoCompleteScheduledMatches`.
   */
  async completeMatch(matchId: number): Promise<void> {
    await sessionService.complete(matchId);
  }

  /**
   * Automatic start of matches whose scheduled start (bookings.start_at_utc)
   * has arrived and whose deadline was already closed (status = 'closed'). The
   * match must have ≥ 2 participants and no existing session to be eligible.
   *
   * This is the auto-start complement of `autoCompleteScheduledMatches`:
   * closed → in_progress → (auto-complete later) → completed. Emitting
   * `match:updated` alongside `session:started` keeps the frontend cache
   * invalidated via the SocketPublisher's existing `match.updated` listener.
   */
  async autoStartScheduledMatches(): Promise<number> {
    const candidates = await matchRepository.findClosedMatchesPastStart();

    let started = 0;
    for (const row of candidates) {
      try {
        await sessionService.start(row.id);
        // sessionService.start emits session:started, but the frontend
        // invalidate map listens on match.updated — emit both so the
        // MatchListPage + nav counts refresh live.
        matchEventPublisher.publish({
          type: 'match:updated',
          payload: {
            matchId: row.id,
            timestamp: new Date().toISOString(),
          },
        });
        started++;
      } catch (err: any) {
        // SESSION_EXISTS / MATCH_NOT_CLOSED are expected when concurrent
        // workers or manual starts race; only log unexpected errors.
        if (!err?.errorCode?.includes('SESSION_EXISTS') && !err?.errorCode?.includes('MATCH_NOT_CLOSED')) {
          log.error({ err, matchId: row.id }, 'auto-start scheduled match failed');
        }
      }
    }
    return started;
  }

  /**
   * Automatic completion of matches whose authoritative scheduled end
   * (bookings.end_at_utc) has passed. This is the reliable "match has ended"
   * establishment that makes result processing possible even when nobody
   * triggers the manual complete action.
   *
   * Behaviour:
   *  - `in_progress` matches get their session ended at `end_at_utc`;
   *  - `closed` matches that were never started get a completed session whose
   *    window is the scheduled start→end (played_at = end_at_utc);
   *  - match status reaches `completed`;
   *  - the existing `match:status_changed` / `match:completed` events fire via
   *    the shared EventBus (notification engine re-emits `match:updated`), so
   *    no new realtime mechanism is introduced.
   *
   * Matches with <= 1 participant are intentionally skipped so the existing
   * `deadlineService.voidEmptyMatches()` can still void them later.
   */
  async autoCompleteScheduledMatches(): Promise<number> {
    const candidates = await matchRepository.findScheduledMatchesPastEnd();

    let completed = 0;
    for (const row of candidates) {
      try {
        const session = await matchRepository.findActiveSessionForMatch(row.id);
        const startedAt = row.startAtUtc ?? row.endAtUtc;
        const fromStatus: string = row.status;

        if (session && session.status === 'in_progress') {
          await matchRepository.completeMatchSessionAtScheduledEnd(row.id, session.id, startedAt, row.endAtUtc);
        } else if (!session) {
          await matchRepository.createCompletedSessionForMatch(row.id, startedAt, row.endAtUtc);
        } else {
          continue;
        }

        await matchRepository.markMatchCompleted(row.id);

        // Emit match:updated alongside the domain events so the SocketPublisher
        // (subscribed to match:updated) tells the frontend to refresh lists —
        // auto-complete runs headless in a worker, players must still see the
        // match move to History/result-entry without a manual refresh.
        matchEventPublisher.publish({
          type: 'match:updated',
          payload: {
            matchId: row.id,
            timestamp: new Date().toISOString(),
          },
        });
        matchEventPublisher.publish({
          type: 'match:status_changed',
          payload: {
            matchId: row.id, fromStatus,
            toStatus: 'completed', timestamp: new Date().toISOString(),
          },
        });
        matchEventPublisher.publish({
          type: 'match:completed',
          payload: { matchId: row.id, timestamp: new Date().toISOString() },
        });
        completed++;
      } catch (err) {
        log.error({ err, matchId: row.id }, 'auto-complete scheduled match failed');
      }
    }
    return completed;
  }
}

export const matchService = new MatchService();
