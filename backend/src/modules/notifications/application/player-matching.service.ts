import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { dispatchToUser, type DispatchOptions } from './dispatcher.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('player-matching');

type RowData = RowDataPacket[];

export interface MatchingCriteria {
  sportId?: number;
  clubId?: number;
  branchId?: number;
  skillLevel?: string;
  gender?: string;
  minAge?: number;
  maxAge?: number;
  maxDistance?: number;
  latitude?: number;
  longitude?: number;
  requiredPlayers: number;
  excludeUserIds?: number[];
}

export interface MatchResult {
  userId: number;
  score: number;
}

export async function findEligiblePlayers(
  criteria: MatchingCriteria,
  limit: number = 10,
): Promise<MatchResult[]> {
  const pool = getPool();

  const conditions: string[] = [
    'u.is_active = TRUE',
    'u.deleted_at IS NULL',
    'u.id NOT IN (SELECT user_id FROM player_match_requests WHERE booking_id IS NOT NULL AND is_active = TRUE)',
  ];
  const params: any[] = [];

  if (criteria.excludeUserIds?.length) {
    conditions.push(`u.id NOT IN (${criteria.excludeUserIds.map(() => '?').join(',')})`);
    params.push(...criteria.excludeUserIds);
  }

  if (criteria.sportId) {
    conditions.push(`
      EXISTS (SELECT 1 FROM user_sports us WHERE us.user_id = u.id AND us.sport_id = ?)
    `);
    params.push(criteria.sportId);
  }

  if (criteria.skillLevel) {
    conditions.push(`
      EXISTS (SELECT 1 FROM user_sports us WHERE us.user_id = u.id AND us.skill_level = ?)
    `);
    params.push(criteria.skillLevel);
  }

  if (criteria.gender) {
    conditions.push('u.gender = ?');
    params.push(criteria.gender);
  }

  if (criteria.minAge) {
    conditions.push('TIMESTAMPDIFF(YEAR, u.date_of_birth, CURDATE()) >= ?');
    params.push(criteria.minAge);
  }

  if (criteria.maxAge) {
    conditions.push('TIMESTAMPDIFF(YEAR, u.date_of_birth, CURDATE()) <= ?');
    params.push(criteria.maxAge);
  }

  if (criteria.branchId) {
    conditions.push(`
      EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id = u.id AND ub.branch_id = ?)
    `);
    params.push(criteria.branchId);
  }

  if (criteria.clubId) {
    conditions.push(`
      EXISTS (SELECT 1 FROM user_organisations uo
        JOIN branches b ON uo.organisation_id = b.organisation_id
        WHERE uo.user_id = u.id AND b.id = ?)
    `);
    params.push(criteria.clubId);
  }

  if (criteria.latitude != null && criteria.longitude != null) {
    conditions.push(`
      ST_Distance_Sphere(
        POINT(u.longitude, u.latitude),
        POINT(?, ?)
      ) <= ? * 1000
    `);
    params.push(criteria.longitude, criteria.latitude, criteria.maxDistance ?? 50);
  }

  const sql = `
    SELECT u.id,
      ${criteria.latitude != null && criteria.longitude != null
        ? `ST_Distance_Sphere(POINT(u.longitude, u.latitude), POINT(?, ?)) as distance,`
        : '0 as distance,'}
      CASE WHEN u.skill_level = ? THEN 3 ELSE 0 END +
      CASE WHEN u.gender = ? THEN 2 ELSE 0 END as score
    FROM users u
    WHERE ${conditions.join(' AND ')}
    ORDER BY score DESC, distance ASC
    LIMIT ?
  `;

  const scoreParams = criteria.latitude != null
    ? [criteria.longitude, criteria.latitude, criteria.skillLevel ?? '', criteria.gender ?? '', ...params, limit]
    : [criteria.skillLevel ?? '', criteria.gender ?? '', ...params, limit];

  const [rows] = await pool.execute<RowData>(sql, scoreParams);

  return rows.map((r: any) => ({
    userId: r.id,
    score: r.score,
  }));
}

export async function sendMatchInvitations(
  bookingId: number,
  sportId: number,
  branchId: number,
  requiredPlayers: number,
  currentPlayers: number,
  creatorId: number,
): Promise<void> {
  const remaining = requiredPlayers - currentPlayers;
  if (remaining <= 0) return;

  const criteria: MatchingCriteria = {
    sportId,
    branchId,
    requiredPlayers: remaining,
    excludeUserIds: [creatorId],
  };

  const matches = await findEligiblePlayers(criteria, remaining);
  if (!matches.length) return;

  for (const match of matches) {
    await dispatchToUser({
      userId: match.userId,
      eventName: 'match:invitation',
      categorySlug: 'system',
      type: 'info',
      priority: 'high',
      data: { bookingId },
      relatedEntityType: 'booking',
      relatedEntityId: String(bookingId),
      senderId: creatorId,
      actions: [
        { label: 'Join Match', actionKey: 'join_match', routePattern: `/bookings/${bookingId}/join`, icon: 'users' },
        { label: 'Decline', actionKey: 'decline_match', routePattern: `/bookings/${bookingId}/decline`, icon: 'x', confirmMessage: 'Are you sure you want to decline?' },
      ],
      digestable: false,
    });
  }

  const pool = getPool();
  await pool.execute(
    `INSERT INTO player_match_requests (booking_id, sport_id, branch_id, required_players, invited_count, created_by, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())`,
    [bookingId, sportId, branchId, requiredPlayers, matches.length, creatorId],
  );
}

export async function handlePlayerJoined(
  bookingId: number,
  playerId: number,
): Promise<void> {
  const pool = getPool();

  const [requests] = await pool.execute<RowData>(
    `SELECT * FROM player_match_requests WHERE booking_id = ? AND is_active = TRUE LIMIT 1`,
    [bookingId],
  );

  if (!requests.length) return;

  const request = requests[0];

  const [joined] = await pool.execute<RowData>(
    `SELECT COUNT(*) as cnt FROM booking_players WHERE booking_id = ? AND status = 'confirmed'`,
    [bookingId],
  );

  if (joined[0].cnt >= request.required_players) {
    await pool.execute(
      'UPDATE player_match_requests SET is_active = FALSE WHERE id = ?',
      [request.id],
    );

    await dispatchToUser({
      userId: request.created_by,
      eventName: 'booking:fully-booked',
      categorySlug: 'system',
      type: 'success',
      priority: 'high',
      data: { bookingId, requiredPlayers: request.required_players },
      relatedEntityType: 'booking',
      relatedEntityId: String(bookingId),
      digestable: false,
    });
  }
}
