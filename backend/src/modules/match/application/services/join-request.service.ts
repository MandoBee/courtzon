import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { matchRepository } from '../../infrastructure/repositories/match.repository.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { JoinRequest } from '../../domain/join-request.entity.js';
import { Participant } from '../../domain/participant.entity.js';
import { eligibilityService } from './eligibility.service.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { MatchCriteria } from '../../domain/match-criteria.vo.js';

type RowData = mysql.RowDataPacket[];

export class JoinRequestService {
  async submit(matchId: number, userId: number): Promise<{ status: string; requestId?: number }> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');

    if (match.status !== 'open' && match.status !== 'full') {
      throw new AppError('Match is not accepting applications', 400, 'MATCH_NOT_OPEN');
    }

    const isHost = match.participants.some((p) => p.userId === userId && p.role === 'host');
    if (isHost) throw new AppError('You cannot join your own match', 400, 'CANNOT_JOIN_OWN');

    const existingRequest = match.joinRequests.find(
      (r) => r.userId === userId && r.status === 'submitted'
    );
    if (existingRequest) {
      throw new AppError('You already have a pending request', 409, 'DUPLICATE_REQUEST');
    }

    const existingParticipant = match.participants.some((p) => p.userId === userId);
    if (existingParticipant) {
      throw new AppError('You are already a participant', 409, 'ALREADY_PARTICIPANT');
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      const [details] = await conn.execute<RowData>(
        'SELECT auto_accept, max_players FROM public_match_details WHERE match_id = ?', [matchId]
      );
      const detail = (details as any[])[0];
      if (!detail) throw new AppError('Match details not found', 404, 'MATCH_DETAILS_NOT_FOUND');

      const autoAccept = detail.auto_accept === 1;
      const capacityOk = match.participantCount < detail.max_players;

      const [result] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO join_requests (match_id, user_id, status, submitted_at)
         VALUES (?, ?, 'submitted', NOW())`,
        [matchId, userId]
      );
      const requestId = result.insertId;

      matchEventPublisher.publish({
        type: 'join_request:submitted',
        payload: { matchId, userId, timestamp: new Date().toISOString() },
      });

      if (autoAccept && capacityOk) {
        await this.approve(requestId, userId, conn);
        await conn.commit();
        return { status: 'approved', requestId };
      }

      if (!capacityOk) {
        await conn.execute(
          `INSERT IGNORE INTO waiting_list (match_id, user_id, position)
           VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM waiting_list w2 WHERE w2.match_id = ?))`,
          [matchId, userId, matchId]
        );
        await conn.commit();

        matchEventPublisher.publish({
          type: 'waiting_list:entry_added',
          payload: { matchId, userId, position: 0, timestamp: new Date().toISOString() },
        });

        return { status: 'waitlisted' };
      }

      await conn.commit();
      return { status: 'submitted', requestId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async approve(requestId: number, responderId: number, conn?: mysql.PoolConnection): Promise<void> {
    const pool = conn ?? getPool();

    const [rows] = await pool.execute<RowData>(
      'SELECT match_id, user_id, status FROM join_requests WHERE id = ?', [requestId]
    );
    if (!rows.length) throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    const req = rows[0] as any;
    if (req.status !== 'submitted') throw new AppError('Request is not pending', 400, 'REQUEST_NOT_PENDING');

    await pool.execute(
      "UPDATE join_requests SET status = 'approved', responded_at = NOW(), responder_id = ? WHERE id = ?",
      [responderId, requestId]
    );

    await pool.execute(
      `INSERT INTO match_participants (match_id, user_id, role, joined_at)
       VALUES (?, ?, 'joiner', NOW())`,
      [req.match_id, req.user_id]
    );

    const [detailRows] = await pool.execute<RowData>(
      'SELECT max_players FROM public_match_details WHERE match_id = ?', [req.match_id]
    );
    const detail = (detailRows as any[])[0];
    if (detail) {
      const [countRows] = await pool.execute<RowData>(
        'SELECT COUNT(*) as cnt FROM match_participants WHERE match_id = ?', [req.match_id]
      );
      const count = Number((countRows[0] as any).cnt);
      if (count >= detail.max_players) {
        await pool.execute(
          "UPDATE matches SET status = 'full' WHERE id = ? AND status = 'open'",
          [req.match_id]
        );
      }
    }

    matchEventPublisher.publish({
      type: 'join_request:approved',
      payload: { matchId: req.match_id, userId: req.user_id, timestamp: new Date().toISOString() },
    });

    matchEventPublisher.publish({
      type: 'participant:added',
      payload: { matchId: req.match_id, userId: req.user_id, role: 'joiner', timestamp: new Date().toISOString() },
    });
  }

  async reject(requestId: number, responderId: number, reason?: string): Promise<void> {
    const pool = getPool();

    const [rows] = await pool.execute<RowData>(
      'SELECT match_id, user_id, status FROM join_requests WHERE id = ?', [requestId]
    );
    if (!rows.length) throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    const req = rows[0] as any;
    if (req.status !== 'submitted') throw new AppError('Request is not pending', 400, 'REQUEST_NOT_PENDING');

    await pool.execute(
      'UPDATE join_requests SET status = \'rejected\', responded_at = NOW(), responder_id = ?, rejection_reason = ? WHERE id = ?',
      [responderId, reason || null, requestId]
    );

    matchEventPublisher.publish({
      type: 'join_request:rejected',
      payload: { matchId: req.match_id, userId: req.user_id, reason, timestamp: new Date().toISOString() },
    });
  }

  async withdraw(requestId: number, userId: number): Promise<void> {
    const pool = getPool();

    const [rows] = await pool.execute<RowData>(
      'SELECT match_id, user_id, status FROM join_requests WHERE id = ?', [requestId]
    );
    if (!rows.length) throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    const req = rows[0] as any;
    if (req.user_id !== userId) throw new AppError('Not your request', 403, 'NOT_OWNER');
    if (req.status !== 'submitted') throw new AppError('Request cannot be withdrawn', 400, 'CANNOT_WITHDRAW');

    await pool.execute(
      "UPDATE join_requests SET status = 'withdrawn', responded_at = NOW() WHERE id = ?",
      [requestId]
    );

    matchEventPublisher.publish({
      type: 'join_request:withdrawn',
      payload: { matchId: req.match_id, userId, timestamp: new Date().toISOString() },
    });
  }

  async autoRejectPendingByMatchId(matchId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = conn ?? getPool();

    const [pending] = await db.execute<RowData>(
      "SELECT id, user_id FROM join_requests WHERE match_id = ? AND status = 'submitted'", [matchId]
    );
    for (const req of pending as any[]) {
      await db.execute(
        "UPDATE join_requests SET status = 'auto_rejected', responded_at = NOW() WHERE id = ?",
        [req.id]
      );
      matchEventPublisher.publish({
        type: 'join_request:auto_rejected',
        payload: { matchId, userId: req.user_id, timestamp: new Date().toISOString() },
      });
    }
  }
}

export const joinRequestService = new JoinRequestService();
