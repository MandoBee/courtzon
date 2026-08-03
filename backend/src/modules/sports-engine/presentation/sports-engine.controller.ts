import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { rankingService } from '../application/ranking.service.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = import('mysql2').RowDataPacket[];

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

export async function getRankingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const rankings = await rankingService.getRankings({
    type: query.type, sportId: query.sportId ? Number(query.sportId) : undefined,
    orgId: query.orgId ? Number(query.orgId) : undefined, limit: query.limit ? Number(query.limit) : 100,
  });
  return reply.send(rankings);
}

export async function calculateEloHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = request.body as any;
  const result = await rankingService.calculateElo(body.match_id, body.winner_id, body.loser_id, body.sport_id);
  recordAudit({
    actorId: userId, action: 'SPORTS_ENGINE.ELO_CALCULATE', entityType: 'elo_ratings',
    entityId: body.match_id, afterState: { winner_id: body.winner_id, ...result },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(result);
}

export async function getOptimizedScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const pool = getPool();
  const limit = query.limit ? Number(query.limit) : 10;

  const [resources] = await pool.query<RowData>(
    `SELECT r.id, r.name, r.sport_id, r.hourly_price, r.opening_time, r.closing_time,
            b.name AS branch_name, b.id AS branch_id, b.organisation_id,
            COALESCE((SELECT COUNT(*) FROM bookings bk WHERE bk.resource_id = r.id AND bk.booking_date >= CURDATE() AND bk.booking_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND bk.booking_status NOT IN ('cancelled','no_show')), 0) AS booking_count
     FROM resources r
     JOIN branches b ON b.id = r.branch_id
     WHERE r.is_active = 1
     ORDER BY booking_count ASC
     LIMIT ?`, [limit],
  );

  return reply.send(resources.map((r: any) => ({
    resource_id: r.id, resource_name: r.name, branch_name: r.branch_name,
    sport_id: r.sport_id, hourly_price: r.hourly_price,
    opening_time: r.opening_time, closing_time: r.closing_time,
    availability_score: Math.max(0, 100 - (r.booking_count || 0) * 10),
    reasons: ['Low booking volume', 'Available this week'],
  })));
}

export async function getPlayerAnalyticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const userId = Number(id);

  const [[user]] = await pool.query<RowData>('SELECT id, full_name, avatar_url FROM users WHERE id = ?', [userId]);
  if (!user) return reply.status(404).send({ error: 'Player not found' });

  const [[matchStats]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN pm.winner_id = ? THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN pm.winner_id IS NOT NULL AND pm.winner_id != ? THEN 1 ELSE 0 END) AS losses
     FROM tournament_matches pm WHERE (pm.player1_id = ? OR pm.player2_id = ?) AND pm.status = 'completed'`,
    [userId, userId, userId, userId],
  );

  const [sportBreakdown] = await pool.query<RowData>(
    `SELECT s.name AS sport_name, COUNT(*) AS matches, SUM(CASE WHEN pm.winner_id = ? THEN 1 ELSE 0 END) AS wins
     FROM tournament_matches pm JOIN tournaments t ON t.id = pm.tournament_id JOIN sports s ON s.id = t.sport_id
     WHERE (pm.player1_id = ? OR pm.player2_id = ?) AND pm.status = 'completed'
     GROUP BY s.name`, [userId, userId, userId],
  );

  return reply.send({
    user_id: user.id, full_name: user.full_name,
    total_matches: matchStats.total, wins: matchStats.wins, losses: matchStats.losses,
    win_rate: matchStats.total > 0 ? Math.round((matchStats.wins / matchStats.total) * 100) : 0,
    sport_breakdown: sportBreakdown,
  });
}

export async function getMatchQualityHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.query<RowData>(
    `SELECT pm.id AS match_id, pm.status, pm.winner_id IS NOT NULL AS has_winner,
            COALESCE(ABS(COALESCE(e1.rating, 1200) - COALESCE(e2.rating, 1200)), 500) AS rating_gap
     FROM tournament_matches pm
     LEFT JOIN elo_ratings e1 ON e1.user_id = pm.player1_id AND e1.sport_id = 1
     LEFT JOIN elo_ratings e2 ON e2.user_id = pm.player2_id AND e2.sport_id = 1
     WHERE pm.status = 'completed'
     ORDER BY pm.created_at DESC LIMIT 50`,
  );

  return reply.send(rows.map((r: any) => ({
    match_id: r.match_id, has_winner: !!r.has_winner,
    quality_score: r.rating_gap < 100 ? 95 : r.rating_gap < 200 ? 80 : r.rating_gap < 400 ? 60 : 40,
    skill_balance: Math.max(0, 100 - r.rating_gap / 10),
  })));
}

export async function getSportsTrendsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const months = 6;

  const [bookings] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(booking_date, '%Y-%m') AS month, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS revenue
     FROM bookings WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH) AND booking_status NOT IN ('cancelled','no_show')
     GROUP BY DATE_FORMAT(booking_date, '%Y-%m') ORDER BY month`, [months],
  );

  const [tournaments] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count FROM tournaments
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month`, [months],
  );

  const [academy] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS count FROM academy_enrollments
     WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH) GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month`, [months],
  );

  return reply.send({ bookings, tournaments, academy_enrollments: academy });
}

export async function getPartnerRecommendationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const limit = (request.query as any).limit ? Number((request.query as any).limit) : 10;

  const [elo] = await pool.query<RowData>('SELECT sport_id, rating FROM elo_ratings WHERE user_id = ?', [userId]);
  const sportId = elo.length ? elo[0].sport_id : 1;
  const userRating = elo.length ? elo[0].rating : 1200;

  const [candidates] = await pool.query<RowData>(
    `SELECT er.user_id, u.full_name, u.avatar_url, er.rating, er.matches_played, er.sport_id
     FROM elo_ratings er JOIN users u ON u.id = er.user_id
     WHERE er.user_id != ? AND er.sport_id = ?
     ORDER BY ABS(er.rating - ?) ASC, er.matches_played DESC
     LIMIT ?`, [userId, sportId, userRating, limit],
  );

  return reply.send(candidates.map((c: any) => ({
    user_id: c.user_id, full_name: c.full_name, avatar_url: c.avatar_url,
    compatibility_score: Math.max(0, 100 - Math.abs(c.rating - userRating) / 10),
    skill_gap: Math.abs(c.rating - userRating), common_sports: [], mutual_friends: 0,
  })));
}

export async function getCoachRecommendationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const limit = (request.query as any).limit ? Number((request.query as any).limit) : 10;

  const [coaches] = await pool.query<RowData>(
    `SELECT cp.user_id, u.full_name, u.avatar_url,
            ps.price AS hourly_rate, pp.rating_avg,
            pp.experience_years, pp.sports
     FROM coach_profiles cp
     JOIN professional_profiles pp ON pp.user_id = cp.user_id
     LEFT JOIN professional_services ps ON ps.professional_profile_id = pp.id
       AND ps.service_key = 'coach_default' AND ps.is_active = 1
     JOIN users u ON u.id = cp.user_id
     WHERE cp.status = 'approved' AND pp.is_available = 1
     ORDER BY pp.rating_avg DESC, pp.experience_years DESC
     LIMIT ?`, [limit],
  );

  return reply.send(coaches.map((c: any) => ({
    user_id: c.user_id, full_name: c.full_name, avatar_url: c.avatar_url,
    hourly_rate: c.hourly_rate, rating_avg: c.rating_avg,
    experience_years: c.experience_years, compatibility_score: 80,
  })));
}
