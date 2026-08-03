import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { refereeRepository } from '../infrastructure/repositories/referee.repository.js';
import { isProfessionalProfileKey } from '../../profiles/infrastructure/repositories/professional-profile.repository.js';
import type { ProfessionalProfileInput } from '../../profiles/infrastructure/repositories/professional-profile.repository.js';

type RowData = mysql.RowDataPacket[];

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

/**
 * Resolve the referee identity for the authenticated user.
 * The Referee is an independent actor — identity lives in the `referees`
 * table and never depends on `coach_profiles` (or any other actor table).
 */
async function getRefereeId(request: FastifyRequest): Promise<number> {
  const userId = getUserId(request);
  const refereeId = await refereeRepository.getRefereeIdByUserId(userId);
  if (!refereeId) throw new NotFoundError(ErrorCodes.REFEREE_NOT_FOUND);
  return refereeId;
}

// ── Referee Dashboard ──

export async function getRefereeDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const profile = await refereeRepository.getRefereeProfile(userId);
  const matches = await refereeRepository.countMatches(refereeId);
  const averageRating = profile ? Number(profile.rating_avg || 0) : 0;
  return reply.send({
    upcomingMatches: matches.upcomingMatches,
    completedMatches: matches.completedMatches,
    totalAssignments: matches.upcomingMatches + matches.completedMatches,
    averageRating,
  });
}

// ── Referee Profile ──

export async function getRefereeProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  await getRefereeId(request);
  const profile = await refereeRepository.getRefereeProfile(userId);
  if (!profile) throw new NotFoundError(ErrorCodes.REFEREE_NOT_FOUND);
  return reply.send(profile);
}

export async function updateRefereeProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const body = request.body as any;
  const shared: ProfessionalProfileInput = {};
  for (const [key, val] of Object.entries(body)) {
    if (val === undefined) continue;
    if (isProfessionalProfileKey(key)) (shared as any)[key] = val;
  }
  if (Object.keys(shared).length) {
    await refereeRepository.upsertProfile(userId, shared);
  }
  recordAudit({
    actorId: userId, action: 'REFEREE_PROFILE.UPDATE', entityType: 'referee',
    entityId: refereeId, afterState: body,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Referee Availability ──

export async function getRefereeAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const refereeId = await getRefereeId(request);
  const availability = await refereeRepository.listAvailability(refereeId);
  const blackouts = await refereeRepository.listBlackouts(refereeId);
  return reply.send({ availability, blackouts });
}

export async function updateRefereeAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const body = request.body as any;
  const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = body.slots || [];
  await refereeRepository.replaceAvailability(refereeId, slots);
  recordAudit({
    actorId: userId, action: 'REFEREE_AVAILABILITY.UPDATE', entityType: 'referee',
    entityId: refereeId,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function addBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const body = request.body as any;
  const blackoutId = await refereeRepository.addBlackout(refereeId, body.blackoutDate, body.reason);
  recordAudit({
    actorId: userId, action: 'REFEREE_BLACKOUT.CREATE', entityType: 'referee_availability_blackout',
    entityId: blackoutId,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ id: blackoutId });
}

export async function removeBlackoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const { id } = request.params as any;
  await refereeRepository.removeBlackout(Number(id), refereeId);
  recordAudit({
    actorId: userId, action: 'REFEREE_BLACKOUT.DELETE', entityType: 'referee_availability_blackout',
    entityId: Number(id),
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Referee Assignments ──

export async function getRefereeAssignmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const refereeId = await getRefereeId(request);
  const assignments = await refereeRepository.listAssignments(refereeId);
  return reply.send(assignments);
}

export async function acceptAssignmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const { id } = request.params as any;
  recordAudit({
    actorId: userId, action: 'REFEREE_ASSIGNMENT.ACCEPT', entityType: 'referee',
    entityId: refereeId, afterState: { matchId: Number(id) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

export async function declineAssignmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const { id } = request.params as any;
  recordAudit({
    actorId: userId, action: 'REFEREE_ASSIGNMENT.DECLINE', entityType: 'referee',
    entityId: refereeId, afterState: { matchId: Number(id) },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── Referee Match History ──

export async function getRefereeMatchHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const refereeId = await getRefereeId(request);
  const history = await refereeRepository.listMatchHistory(refereeId);
  return reply.send(history);
}

// ── Referee Statistics ──

export async function getRefereeStatisticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const refereeId = await getRefereeId(request);
  const matches = await refereeRepository.countMatches(refereeId);
  const profile = await refereeRepository.getRefereeProfile(userId);
  return reply.send({
    totalMatches: matches.totalMatches,
    tournamentMatches: matches.tournamentMatches,
    leagueMatches: matches.leagueMatches,
    averageRating: profile ? Number(profile.rating_avg || 0) : 0,
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
    `SELECT cp.id, pp.rating_avg
     FROM coach_profiles cp
     LEFT JOIN professional_profiles pp ON pp.user_id = cp.user_id
     WHERE cp.user_id = ? AND cp.deleted_at IS NULL`,
    [userId],
  );
  if (!rows.length) throw new NotFoundError(ErrorCodes.COACH_NOT_FOUND);
  const coachId = rows[0].id;
  const ratingAvg = Number(rows[0].rating_avg || 0);
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
