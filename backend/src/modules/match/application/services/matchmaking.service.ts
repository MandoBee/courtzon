import { getPool } from '../../../../database/mysql.js';
import { eligibilityService } from './eligibility.service.js';
import { invitationService } from './invitation.service.js';
import type { MatchCriteria } from '../../domain/match-criteria.vo.js';
import { createModuleLogger } from '../../../../shared/utils/logger.js';

type RowData = import('mysql2').RowDataPacket[];

const log = createModuleLogger('matchmaking');

export class MatchmakingService {
  async sendInvitations(matchId: number, sportId: number, criteria: MatchCriteria, creatorId: number): Promise<number> {
    const playerIds = await eligibilityService.findEligiblePlayerIds(criteria, sportId, creatorId);

    let sent = 0;
    for (const playerId of playerIds) {
      try {
        await invitationService.send(matchId, playerId, null);
        sent++;
      } catch (err: any) {
        if (!err.message?.includes('DUPLICATE_INVITATION')) {
          log.error({ err, playerId, matchId }, 'Failed to send invitation');
        }
      }
    }

    log.info({ matchId, eligibleCount: playerIds.length, sentCount: sent }, 'Matchmaking invitations sent');
    return sent;
  }

  async getPublicMatchCriteria(matchId: number): Promise<{
    criteria: MatchCriteria;
    sportId: number;
    creatorId: number;
  } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT pmd.creator_id, pmd.min_age, pmd.max_age, pmd.target_gender,
              pmd.target_level_id, m.sport_id
       FROM public_match_details pmd
       JOIN matches m ON m.id = pmd.match_id
       WHERE pmd.match_id = ?`, [matchId]
    );
    if (!rows.length) return null;

    const r = rows[0] as any;
    const { MatchCriteria } = await import('../../domain/match-criteria.vo.js');
    return {
      criteria: new MatchCriteria({
        minAge: r.min_age, maxAge: r.max_age,
        targetGender: r.target_gender, targetLevelId: r.target_level_id,
      }),
      sportId: r.sport_id,
      creatorId: r.creator_id,
    };
  }
}

export const matchmakingService = new MatchmakingService();
