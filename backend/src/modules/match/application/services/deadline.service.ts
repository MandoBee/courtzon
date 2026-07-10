import { getPool } from '../../../../database/mysql.js';
import { matchRepository } from '../../infrastructure/repositories/match.repository.js';
import { invitationService } from './invitation.service.js';
import { joinRequestService } from './join-request.service.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('deadline-service');

export class DeadlineService {
  async closeExpiredMatches(): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id FROM matches m
       JOIN public_match_details pmd ON pmd.match_id = m.id
       WHERE m.status IN ('open', 'full')
         AND pmd.deadline IS NOT NULL
         AND pmd.deadline < NOW()`
    );

    let closed = 0;
    for (const row of rows as any[]) {
      try {
        const match = await matchRepository.findById(row.id);
        if (!match) continue;

        match.transition('closed');
        await this.closeMatch(match.id);
        closed++;
      } catch (err) {
        log.error({ err, matchId: row.id }, 'Failed to close expired match');
      }
    }
    return closed;
  }

  private async closeMatch(matchId: number): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        "UPDATE matches SET status = 'closed', updated_at = NOW() WHERE id = ?",
        [matchId]
      );

      await invitationService.expireByMatchId(matchId, conn);
      await joinRequestService.autoRejectPendingByMatchId(matchId, conn);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async voidEmptyMatches(): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT m.id FROM matches m
       WHERE m.status = 'closed'
         AND (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) <= 1
         AND m.updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    for (const row of rows as any[]) {
      await pool.execute(
        "UPDATE matches SET status = 'void' WHERE id = ?",
        [row.id]
      );
    }
    return rows.length;
  }
}

export const deadlineService = new DeadlineService();
