import { getPool } from '../../../../database/mysql.js';
import { runProvidedTransaction } from '../../../../database/database.transaction.js';
import type mysql from 'mysql2/promise';
import { matchRepository } from '../../infrastructure/repositories/match.repository.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { JoinRequest } from '../../domain/join-request.entity.js';
import { Participant } from '../../domain/participant.entity.js';
import { assignNextParticipantSide, canOccupySide } from '../../domain/participant-side.js';
import { eligibilityService } from './eligibility.service.js';
import { invitationService } from './invitation.service.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { MatchCriteria } from '../../domain/match-criteria.vo.js';
import type { ParticipantSide } from '../../domain/match.types.js';

type RowData = mysql.RowDataPacket[];

export class JoinRequestService {
  async submit(matchId: number, userId: number, requestedSide?: ParticipantSide): Promise<{ status: string; requestId?: number }> {
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

    // Group 3 — validate a requested side against the Match's frozen format
    // snapshot + current occupancy. Revalidated again at approval time.
    if (requestedSide != null) {
      const occupancy = match.participants.map((p) => ({ side: p.side, userId: p.userId })).filter((o) => o.side !== null) as Array<{ side: ParticipantSide; userId: number }>;
      const check = canOccupySide(match.formatSnapshot, occupancy, requestedSide);
      if (!check.ok) {
        throw new AppError('This side is already full', 409, 'SIDE_FULL');
      }
    }

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      // Group 6 — ALS transaction context: join-request/participant events are
      // emitted (and flushed) only after the transaction commits — never before,
      // so a rollback can never deliver a phantom applicant/participant event.
      return await runProvidedTransaction(conn, async () => {
        const [details] = await conn.execute<RowData>(
          'SELECT auto_accept, max_players, creator_id FROM public_match_details WHERE match_id = ?', [matchId]
        );
        const detail = (details as any[])[0];
        if (!detail) throw new AppError('Match details not found', 404, 'MATCH_DETAILS_NOT_FOUND');

        const autoAccept = detail.auto_accept === 1;
        const capacityOk = match.participantCount < detail.max_players;

        const [result] = await conn.execute<mysql.ResultSetHeader>(
          `INSERT INTO join_requests (match_id, user_id, status, requested_side, submitted_at)
           VALUES (?, ?, 'submitted', ?, NOW())`,
          [matchId, userId, requestedSide ?? null]
        );
        const requestId = result.insertId;

        await matchEventPublisher.publish({
          type: 'join_request:submitted',
          payload: { matchId, userId, creatorId: detail.creator_id, requestedSide: requestedSide ?? null, timestamp: new Date().toISOString() },
        }, { executor: conn });

        if (autoAccept && capacityOk) {
          await this.approve(requestId, userId, conn);
          return { status: 'approved', requestId };
        }

        if (!capacityOk) {
          await conn.execute(
            `INSERT IGNORE INTO waiting_list (match_id, user_id, position)
             VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM waiting_list w2 WHERE w2.match_id = ?))`,
            [matchId, userId, matchId]
          );

          await matchEventPublisher.publish({
            type: 'waiting_list:entry_added',
            payload: { matchId, userId, position: 0, timestamp: new Date().toISOString() },
          }, { executor: conn });

          return { status: 'waitlisted' };
        }

        return { status: 'submitted', requestId };
      });
    } finally {
      conn.release();
    }
  }

  async approve(requestId: number, responderId: number, conn?: mysql.PoolConnection): Promise<void> {
    const pool = conn ?? getPool();

    const [rows] = await pool.execute<RowData>(
      'SELECT match_id, user_id, status, requested_side FROM join_requests WHERE id = ?', [requestId]
    );
    if (!rows.length) throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    const req = rows[0] as any;
    if (req.status !== 'submitted') throw new AppError('Request is not pending', 400, 'REQUEST_NOT_PENDING');

    // Authoritative side assignment (Group 2 + 3): load the Match (with its frozen
    // format snapshot + participants) so the joiner is placed on the correct
    // side per the Match's own format — never by insertion order. A requested
    // side (Group 3) is honored only if it is still valid + has capacity at
    // approval time; otherwise the domain default assignment applies.
    const match = await matchRepository.findById(req.match_id);
    if (!match) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');

    const occupancy = match.participants
      .map((p) => ({ side: p.side, userId: p.userId }))
      .filter((o) => o.side !== null) as Array<{ side: ParticipantSide; userId: number }>;
    const requestedSide = (req.requested_side as ParticipantSide | null) ?? null;

    let joinerSide = null;
    if (requestedSide != null) {
      const check = canOccupySide(match.formatSnapshot, occupancy, requestedSide);
      if (check.ok) {
        joinerSide = { side: requestedSide, teamIndex: requestedSide === 'away' ? 1 : 0 };
      }
    }
    if (!joinerSide) {
      joinerSide = assignNextParticipantSide(
        match.formatSnapshot,
        match.participants.map((p) => ({ side: p.side })),
      );
    }

    // Capacity guard: never let a participant exceed the match's total capacity.
    // public_match_details.max_players is the TOTAL including the host, so the
    // existing participant count (host + joiners) must stay strictly below it.
    const [detailRows] = await pool.execute<RowData>(
      'SELECT max_players FROM public_match_details WHERE match_id = ?', [req.match_id]
    );
    const detail = (detailRows as any[])[0];
    if (detail) {
      const [countRows] = await pool.execute<RowData>(
        'SELECT COUNT(*) as cnt FROM match_participants WHERE match_id = ?', [req.match_id]
      );
      const count = Number((countRows[0] as any).cnt);
      if (count >= Number(detail.max_players)) {
        throw new AppError('This match has reached its player capacity', 409, 'MATCH_FULL');
      }
    }

    await pool.execute(
      "UPDATE join_requests SET status = 'approved', responded_at = NOW(), responder_id = ? WHERE id = ?",
      [responderId, requestId]
    );

    await pool.execute(
      `INSERT INTO match_participants (match_id, user_id, role, side, team_index, joined_at)
       VALUES (?, ?, 'joiner', ?, ?, NOW())`,
      [req.match_id, req.user_id, joinerSide?.side ?? null, joinerSide?.teamIndex ?? null]
    );

    // The player is now a participant — any standing match invitation is no
    // longer actionable. Resolve it atomically (same executor) so the K1 badge
    // never counts an invitation the player already acted on by joining.
    await invitationService.expireByMatch(req.match_id, req.user_id, pool);

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

    await matchEventPublisher.publish({
      type: 'join_request:approved',
      payload: { matchId: req.match_id, userId: req.user_id, timestamp: new Date().toISOString() },
    }, { executor: pool });

    await matchEventPublisher.publish({
      type: 'participant:added',
      payload: { matchId: req.match_id, userId: req.user_id, role: 'joiner', timestamp: new Date().toISOString() },
    }, { executor: pool });

    // Realtime: broadcast match:updated (subscribed by SocketPublisher) so the
    // approved player's Applied→Joined tab, the match detail and nav badge all
    // refresh without a manual reload.
    await matchEventPublisher.publish({
      type: 'match:updated',
      payload: { matchId: req.match_id, timestamp: new Date().toISOString() },
    }, { executor: pool });
  }

  /**
   * Group 3 — a participant changes their OWN side while the Match is still
   * editable (open/full). Authoritative validation against the Match's frozen
   * format snapshot + current occupancy + lifecycle. Terminal/locked Matches
   * never allow side changes. Atomic update + realtime broadcast via the
   * existing match:updated event.
   */
  async changeSide(matchId: number, userId: number, side: ParticipantSide): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      // Group 6 — ALS transaction context: match:updated only after commit.
      await runProvidedTransaction(conn, async () => {
        const match = await matchRepository.findById(matchId, conn);
        if (!match) throw new AppError('Match not found', 404, 'MATCH_NOT_FOUND');

        if (match.status !== 'open' && match.status !== 'full') {
          throw new AppError('This match is no longer accepting participant changes', 400, 'MATCH_NOT_EDITABLE');
        }

        const mine = match.participants.find((p) => p.userId === userId);
        if (!mine) throw new AppError('You are not a participant of this match', 403, 'NOT_PARTICIPANT');

        // Occupancy EXCLUDES the actor (they are moving, not adding).
        const occupancy = match.participants
          .filter((p) => p.userId !== userId && p.side !== null)
          .map((p) => ({ side: p.side as ParticipantSide, userId: p.userId }));
        const check = canOccupySide(match.formatSnapshot, occupancy, side);
        if (!check.ok) {
          throw new AppError('This side is already full', 409, 'SIDE_FULL');
        }

        await conn.execute(
          'UPDATE match_participants SET side = ?, team_index = ?, joined_at = joined_at WHERE match_id = ? AND user_id = ?',
          [side, side === 'away' ? 1 : 0, matchId, userId]
        );

        await matchEventPublisher.publish({
          type: 'match:updated',
          payload: { matchId, userId, timestamp: new Date().toISOString() },
        }, { executor: conn });
      });
    } finally {
      conn.release();
    }
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

    await matchEventPublisher.publish({
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

    await matchEventPublisher.publish({
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
      await matchEventPublisher.publish({
        type: 'join_request:auto_rejected',
        payload: { matchId, userId: req.user_id, timestamp: new Date().toISOString() },
      });
    }
  }
}

export const joinRequestService = new JoinRequestService();
