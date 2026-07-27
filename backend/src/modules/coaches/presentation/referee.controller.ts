import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}
type RowData = import('mysql2').RowDataPacket[];

async function getRefereeProfileId(userId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.REFEREE_NOT_FOUND);
  return rows[0].id;
}

// ── Referee Dashboard ──

export async function getRefereeDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const pool = getPool();

  const [[upcomingTournament]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ? AND status IN ('scheduled','in_progress')`,
    [profileId],
  );
  const [[upcomingLeague]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ? AND status IN ('scheduled','in_progress')`,
    [profileId],
  );
  const upcomingMatches = Number(upcomingTournament.count) + Number(upcomingLeague.count);

  const [[completedTournament]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ? AND status = 'completed'`,
    [profileId],
  );
  const [[completedLeague]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ? AND status = 'completed'`,
    [profileId],
  );
  const completedMatches = Number(completedTournament.count) + Number(completedLeague.count);

  const totalAssignments = upcomingMatches + completedMatches;

  const [[tournamentRating]] = await pool.query<RowData>(
    `SELECT COALESCE(AVG(rating_avg), 0) AS avg FROM coach_profiles WHERE id = ?`,
    [profileId],
  );
  const averageRating = Number(tournamentRating.avg);

  return reply.send({ upcomingMatches, completedMatches, totalAssignments, averageRating });
}

// ── Referee Profile ──

export async function getRefereeProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT cp.*, u.full_name, u.email, u.phone, u.avatar_url
     FROM coach_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = ? AND cp.deleted_at IS NULL`,
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.REFEREE_NOT_FOUND);
  return reply.send(rows[0]);
}

export async function updateRefereeProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = request.body as any;
  const pool = getPool();
  const fields: string[] = [];
  const params: any[] = [];
  if (body.bio !== undefined) { fields.push('bio = ?'); params.push(body.bio); }
  if (body.certifications !== undefined) { fields.push('certifications = ?'); params.push(JSON.stringify(body.certifications)); }
  if (body.sports !== undefined) { fields.push('sports = ?'); params.push(JSON.stringify(body.sports)); }
  if (body.experienceYears !== undefined) { fields.push('experience_years = ?'); params.push(body.experienceYears); }
  if (body.hourlyRate !== undefined) { fields.push('hourly_rate = ?'); params.push(body.hourlyRate); }
  if (body.currencyCode !== undefined) { fields.push('currency_code = ?'); params.push(body.currencyCode); }
  if (body.sessionDurations !== undefined) { fields.push('session_durations = ?'); params.push(JSON.stringify(body.sessionDurations)); }
  if (!fields.length) return reply.send({ success: true });
  params.push(userId);
  await pool.execute(`UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = ?`, params);
  recordAudit({
    actorId: userId, action: 'REFEREE_PROFILE.UPDATE', entityType: 'coach_profile',
    entityId: (await getRefereeProfileId(userId)), afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Referee Availability ──

export async function getRefereeAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const pool = getPool();
  const [availability] = await pool.query<RowData>(
    'SELECT * FROM coach_availability WHERE coach_id = ? ORDER BY day_of_week, start_time',
    [profileId],
  );
  const [blackouts] = await pool.query<RowData>(
    'SELECT * FROM coach_availability_blackouts WHERE coach_id = ? ORDER BY blackout_date',
    [profileId],
  );
  return reply.send({ availability, blackouts });
}

export async function updateRefereeAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const body = request.body as any;
  const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = body.slots || [];
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM coach_availability WHERE coach_id = ?', [profileId]);
    for (const slot of slots) {
      await conn.execute(
        'INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [profileId, slot.dayOfWeek, slot.startTime, slot.endTime],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  recordAudit({
    actorId: userId, action: 'REFEREE_AVAILABILITY.UPDATE', entityType: 'coach_profile',
    entityId: profileId,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function addBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const body = request.body as any;
  const pool = getPool();
  const [result] = await pool.execute(
    'INSERT INTO coach_availability_blackouts (coach_id, blackout_date, reason) VALUES (?, ?, ?)',
    [profileId, body.blackoutDate, body.reason || null],
  );
  recordAudit({
    actorId: userId, action: 'REFEREE_BLACKOUT.CREATE', entityType: 'coach_availability_blackout',
    entityId: (result as any).insertId,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ id: (result as any).insertId });
}

export async function removeBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const pool = getPool();
  await pool.execute('DELETE FROM coach_availability_blackouts WHERE id = ?', [Number(id)]);
  recordAudit({
    actorId: userId, action: 'REFEREE_BLACKOUT.DELETE', entityType: 'coach_availability_blackout',
    entityId: Number(id),
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Referee Assignments ──

export async function getRefereeAssignmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const pool = getPool();
  const [tournamentMatches] = await pool.query<RowData>(
    `SELECT tm.*, t.name AS tournament_name
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE tm.referee_id = ? AND tm.status IN ('scheduled','in_progress')
     ORDER BY tm.start_time ASC`,
    [profileId],
  );
  const [leagueMatches] = await pool.query<RowData>(
    `SELECT lm.*, l.name AS league_name
     FROM league_matches lm
     JOIN leagues l ON l.id = lm.division_id
     WHERE lm.referee_id = ? AND lm.status IN ('scheduled','in_progress')
     ORDER BY lm.match_date ASC, lm.start_time ASC`,
    [profileId],
  );
  return reply.send({ tournamentMatches, leagueMatches });
}

export async function acceptAssignmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const { id } = request.params as any;
  recordAudit({
    actorId: userId, action: 'REFEREE_ASSIGNMENT.ACCEPT', entityType: 'coach_profile',
    entityId: profileId, afterState: { matchId: Number(id) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function declineAssignmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const { id } = request.params as any;
  recordAudit({
    actorId: userId, action: 'REFEREE_ASSIGNMENT.DECLINE', entityType: 'coach_profile',
    entityId: profileId, afterState: { matchId: Number(id) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Referee Match History ──

export async function getRefereeMatchHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const pool = getPool();
  const [tournamentMatches] = await pool.query<RowData>(
    `SELECT tm.*, t.name AS tournament_name
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE tm.referee_id = ? AND tm.status = 'completed'
     ORDER BY tm.start_time DESC`,
    [profileId],
  );
  const [leagueMatches] = await pool.query<RowData>(
    `SELECT lm.*, l.name AS league_name
     FROM league_matches lm
     JOIN leagues l ON l.id = lm.division_id
     WHERE lm.referee_id = ? AND lm.status = 'completed'
     ORDER BY lm.match_date DESC, lm.start_time DESC`,
    [profileId],
  );
  return reply.send({ tournamentMatches, leagueMatches });
}

// ── Referee Statistics ──

export async function getRefereeStatisticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const profileId = await getRefereeProfileId(userId);
  const pool = getPool();
  const [[tournamentCount]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM tournament_matches WHERE referee_id = ?`,
    [profileId],
  );
  const [[leagueCount]] = await pool.query<RowData>(
    `SELECT COUNT(*) AS count FROM league_matches WHERE referee_id = ?`,
    [profileId],
  );
  const totalMatches = Number(tournamentCount.count) + Number(leagueCount.count);
  const [[avgRating]] = await pool.query<RowData>(
    `SELECT COALESCE(rating_avg, 0) AS avg FROM coach_profiles WHERE id = ?`,
    [profileId],
  );
  return reply.send({
    totalMatches,
    tournamentMatches: Number(tournamentCount.count),
    leagueMatches: Number(leagueCount.count),
    averageRating: Number(avgRating.avg),
  });
}

// ── Coach Revenue ──

export async function getCoachRevenueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT cp.id FROM coach_profiles cp WHERE cp.user_id = ? AND cp.deleted_at IS NULL`,
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.COACH_NOT_FOUND);
  const coachId = rows[0].id;
  const [sessions] = await pool.query<RowData>(
    `SELECT cs.*, u.full_name AS player_name
     FROM coach_sessions cs
     LEFT JOIN users u ON u.id = cs.player_id
     WHERE cs.coach_id = ?
     ORDER BY cs.start_time DESC`,
    [coachId],
  );
  return reply.send({ data: sessions });
}

export async function getCoachRevenueSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.COACH_NOT_FOUND);
  const coachId = rows[0].id;
  const [[totals]] = await pool.query<RowData>(
    `SELECT
       COUNT(*) AS total_sessions,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN cs.price ELSE 0 END), 0) AS total_revenue,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN cs.coach_earnings ELSE 0 END), 0) AS total_coach_earnings,
       COALESCE(SUM(CASE WHEN cs.status IN ('scheduled','confirmed','in_progress') THEN cs.price ELSE 0 END), 0) AS pending_revenue,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN 1 ELSE 0 END), 0) AS paid_count
     FROM coach_sessions cs
     WHERE cs.coach_id = ?`,
    [coachId],
  );
  const [byMonth] = await pool.query<RowData>(
    `SELECT
       DATE_FORMAT(cs.start_time, '%Y-%m') AS month,
       COUNT(*) AS session_count,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN cs.coach_earnings ELSE 0 END), 0) AS earnings
     FROM coach_sessions cs
     WHERE cs.coach_id = ?
     GROUP BY DATE_FORMAT(cs.start_time, '%Y-%m')
     ORDER BY month DESC`,
    [coachId],
  );
  return reply.send({ summary: totals, byMonth });
}

// ── Coach Attendance ──

export async function getCoachAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.COACH_NOT_FOUND);
  const coachId = rows[0].id;
  const [[stats]] = await pool.query<RowData>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
       COALESCE(SUM(CASE WHEN cs.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
       COALESCE(SUM(CASE WHEN cs.status = 'no_show' THEN 1 ELSE 0 END), 0) AS no_show
     FROM coach_sessions cs
     WHERE cs.coach_id = ?`,
    [coachId],
  );
  return reply.send(stats);
}

// ── Coach Statistics ──

export async function getCoachStatisticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id, rating_avg FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.COACH_NOT_FOUND);
  const coachId = rows[0].id;
  const ratingAvg = Number(rows[0].rating_avg);
  const [[stats]] = await pool.query<RowData>(
    `SELECT
       COUNT(*) AS total_sessions,
       COALESCE(COUNT(DISTINCT cs.player_id), 0) AS total_players,
       COALESCE(SUM(TIMESTAMPDIFF(HOUR, cs.start_time, cs.end_time)), 0) AS total_hours,
       COALESCE(SUM(CASE WHEN cs.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_sessions
     FROM coach_sessions cs
     WHERE cs.coach_id = ?`,
    [coachId],
  );
  const totalSessions = Number(stats.total_sessions);
  const completionRate = totalSessions > 0 ? Math.round((Number(stats.completed_sessions) / totalSessions) * 100) : 0;
  return reply.send({
    totalSessions,
    totalPlayers: Number(stats.total_players),
    totalHours: Number(stats.total_hours),
    averageRating: ratingAvg,
    completionRate,
  });
}
