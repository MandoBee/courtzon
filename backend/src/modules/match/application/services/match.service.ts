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
import { AppError } from '../../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('match');

export class MatchService {
  async createFromBooking(
    bookingId: number,
    bookingType: string
  ): Promise<Match | null> {
    if (bookingType !== 'public_match') return null;

    const pool = getPool();

    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM matches WHERE booking_id = ?', [bookingId]
    );
    if (existing.length) {
      log.info({ bookingId, matchId: (existing[0] as any).id }, 'Match already exists for booking');
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
      log.warn({ bookingId }, 'Booking not found for match creation');
      return null;
    }

    const bk = rows[0] as any;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [matchResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO matches (type, status, booking_id, sport_id)
         VALUES ('public', 'open', ?, ?)`,
        [bookingId, bk.sport_id]
      );
      const matchId = matchResult.insertId;

      const [mmRows] = await conn.execute<RowData>(
        `SELECT min_age, max_age, target_gender, target_level_id,
                max_players, deadline, auto_apply
         FROM booking_matchmaking_requests WHERE booking_id = ?`, [bookingId]
      );
      const mm = (mmRows as any[])[0] || {};

      await conn.execute(
        `INSERT INTO public_match_details
         (match_id, creator_id, visibility, auto_accept, max_players,
          min_age, max_age, target_gender, target_level_id, deadline)
         VALUES (?, ?, 'public', ?, ?, ?, ?, ?, ?, ?)`,
        [matchId, bk.user_id, mm.auto_apply || 0, mm.max_players || 2,
         mm.min_age || null, mm.max_age || null,
         mm.target_gender || 'any', mm.target_level_id || null,
         mm.deadline || null]
      );

      await conn.execute(
        `INSERT INTO match_participants (match_id, user_id, role, joined_at)
         VALUES (?, ?, 'host', NOW())`,
        [matchId, bk.user_id]
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
}

export const matchService = new MatchService();
