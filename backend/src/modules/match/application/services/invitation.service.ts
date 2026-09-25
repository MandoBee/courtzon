import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { Invitation, type InvitationData } from '../../domain/invitation.entity.js';
import { matchEventPublisher } from '../events/match-event-publisher.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

export class InvitationService {
  async send(
    matchId: number,
    userId: number,
    expiresAt: Date | null,
    conn?: mysql.PoolConnection
  ): Promise<Invitation> {
    const db = conn ?? getPool();

    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO invitations (match_id, user_id, status, sent_at, expires_at)
       VALUES (?, ?, 'sent', NOW(), ?)`,
      [matchId, userId, expiresAt]
    );

    const invitation = new Invitation({
      id: result.insertId,
      matchId,
      userId,
      status: 'sent',
      sentAt: new Date(),
      readAt: null,
      respondedAt: null,
      expiresAt,
    });

    await matchEventPublisher.publish({
      type: 'invitation:sent',
      payload: { matchId, userId, timestamp: new Date().toISOString() },
      }, { executor: db });

    return invitation;
  }

  async decline(invitationId: number): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT match_id, user_id, status FROM invitations WHERE id = ?', [invitationId]
    );
    if (!rows.length) throw new Error('Invitation not found');
    const inv = rows[0] as any;
    if (inv.status !== 'sent' && inv.status !== 'read') {
      throw new Error('Invitation cannot be declined in its current state');
    }

    const invitation = new Invitation({
      id: invitationId, matchId: inv.match_id, userId: inv.user_id,
      status: inv.status, sentAt: new Date(), readAt: null,
      respondedAt: null, expiresAt: null,
    });
    invitation.decline();

    await pool.execute(
      "UPDATE invitations SET status = 'declined', responded_at = NOW() WHERE id = ?",
      [invitationId]
    );

    await matchEventPublisher.publish({
      type: 'invitation:declined',
      payload: { matchId: inv.match_id, userId: inv.user_id, timestamp: new Date().toISOString() },
    });
  }

  async expireByMatchId(matchId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const [result] = await db.execute<mysql.ResultSetHeader>(
      "UPDATE invitations SET status = 'expired', responded_at = NOW() WHERE match_id = ? AND status IN ('sent', 'read')",
      [matchId]
    );
    if (result.affectedRows > 0) {
      const [rows] = await db.execute<RowData>(
        'SELECT user_id FROM invitations WHERE match_id = ? AND status = \'expired\'',
        [matchId]
      );
      for (const row of rows as any[]) {
        await matchEventPublisher.publish({
          type: 'invitation:expired',
          payload: { matchId, userId: row.user_id, timestamp: new Date().toISOString() },
          }, { executor: db });
      }
    }
  }

  /**
   * Resolve a single player's outstanding invitation for a match. Used when the
   * player becomes a participant through a different path (e.g. a join request
   * is approved) — the invitation is no longer actionable, so it is moved to the
   * terminal `expired` state. This runs inside the approving transaction and is
   * idempotent: only `sent`/`read` rows are touched, so double-approve cannot
   * double-expire.
   */
  async expireByMatch(matchId: number, userId: number, executor?: Executor): Promise<void> {
    const db = executor ?? getPool();
    const [result] = await db.execute<mysql.ResultSetHeader>(
      "UPDATE invitations SET status = 'expired', responded_at = NOW() WHERE match_id = ? AND user_id = ? AND status IN ('sent', 'read')",
      [matchId, userId]
    );
    if (result.affectedRows > 0) {
      await matchEventPublisher.publish({
        type: 'invitation:expired',
        payload: { matchId, userId, timestamp: new Date().toISOString() },
        }, { executor: db });
    }
  }
}

export const invitationService = new InvitationService();
