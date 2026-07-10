import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { matchEventPublisher } from '../events/match-event-publisher.js';
import { joinRequestService } from './join-request.service.js';
import { AppError } from '../../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

export class WaitingListService {
  async add(matchId: number, userId: number): Promise<void> {
    const pool = getPool();

    const [existing] = await pool.execute<RowData>(
      'SELECT id FROM waiting_list WHERE match_id = ? AND user_id = ?', [matchId, userId]
    );
    if (existing.length) throw new AppError('Already on waiting list', 409, 'ALREADY_WAITING');

    await pool.execute(
      `INSERT INTO waiting_list (match_id, user_id, position)
       VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM waiting_list w2 WHERE w2.match_id = ?))`,
      [matchId, userId, matchId]
    );

    matchEventPublisher.publish({
      type: 'waiting_list:entry_added',
      payload: { matchId, userId, position: 0, timestamp: new Date().toISOString() },
    });
  }

  async remove(matchId: number, userId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      'DELETE FROM waiting_list WHERE match_id = ? AND user_id = ?',
      [matchId, userId]
    );
    await this.reindex(matchId, pool);

    matchEventPublisher.publish({
      type: 'waiting_list:entry_removed',
      payload: { matchId, userId, timestamp: new Date().toISOString() },
    });
  }

  async promoteNext(matchId: number): Promise<boolean> {
    const pool = getPool();

    const [wlRows] = await pool.execute<RowData>(
      'SELECT user_id FROM waiting_list WHERE match_id = ? ORDER BY position ASC LIMIT 1',
      [matchId]
    );
    if (!wlRows.length) return false;

    const entry = wlRows[0] as any;

    await pool.execute(
      'DELETE FROM waiting_list WHERE match_id = ? AND user_id = ?',
      [matchId, entry.user_id]
    );
    await this.reindex(matchId, pool);

    await joinRequestService.submit(matchId, entry.user_id);

    matchEventPublisher.publish({
      type: 'waiting_list:promoted',
      payload: { matchId, userId: entry.user_id, position: 0, timestamp: new Date().toISOString() },
    });

    return true;
  }

  private async reindex(matchId: number, db: mysql.Pool | mysql.PoolConnection): Promise<void> {
    const [rows] = await db.execute<RowData>(
      'SELECT id FROM waiting_list WHERE match_id = ? ORDER BY position ASC', [matchId]
    );
    for (let i = 0; i < rows.length; i++) {
      await db.execute(
        'UPDATE waiting_list SET position = ? WHERE id = ?',
        [i + 1, (rows[i] as any).id]
      );
    }
  }
}

export const waitingListService = new WaitingListService();
