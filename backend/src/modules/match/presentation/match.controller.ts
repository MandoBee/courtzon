import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { MatchesQuerySchema, MatchParamsSchema, ApplicantParamsSchema, ApproveRejectBodySchema, CancelBodySchema, MonitorMatchesQuerySchema, OrgMatchesParamsSchema, OrgMatchParamsSchema, JoinBodySchema, ChangeSideBodySchema } from './match.dto.js';
import { matchService } from '../application/services/match.service.js';
import { joinRequestService } from '../application/services/join-request.service.js';
import { getPool } from '../../../database/mysql.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';
import { computeResultState } from '../../match-result/application/result-window.js';

type RowData = mysql.RowDataPacket[];

/**
 * Same authoritative played_at computation as match-result.getMatchContext:
 * the session row wins when present, otherwise the scheduled booking end
 * (end_at_utc) is used once it has passed. Keeps the exposed played_at /
 * result_state consistent with the backend submission rules so the UI can
 * never show a stale "Enter Result" state for a match that already ended.
 */
function playedAtExpr(bookingAlias: string): string {
  return `COALESCE(
    (SELECT COALESCE(ms.ended_at, ms.started_at) FROM match_sessions ms
     WHERE ms.match_id = m.id ORDER BY ms.id DESC LIMIT 1),
    CASE WHEN ${bookingAlias}.end_at_utc IS NOT NULL AND ${bookingAlias}.end_at_utc <= UTC_TIMESTAMP()
         THEN ${bookingAlias}.end_at_utc ELSE NULL END
  )`;
}

/** Scheduled end passed — the earliest a result may be entered. */
function resultEntryOpenExpr(bookingAlias: string): string {
  return `(CASE
    WHEN ${bookingAlias}.end_at_utc IS NOT NULL THEN ${bookingAlias}.end_at_utc <= UTC_TIMESTAMP()
    ELSE TIMESTAMP(CONCAT(${bookingAlias}.booking_date, ' ', ${bookingAlias}.end_time)) <= NOW()
  END)`;
}

/** Latest result-record status for a match ('' when none — nothing terminal yet). */
const RESULT_STATUS_EXPR = `(SELECT r.submission_status FROM match_result_records r
   WHERE r.match_id = m.id ORDER BY r.id DESC LIMIT 1)`;

/** Attach the server-computed result_state and drop the internal status column. */
function decorateResultState(row: any): void {
  row.result_state = computeResultState(row);
  delete row.result_status;
}

async function resolveMatchId(id: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT id FROM matches WHERE id = ? UNION SELECT id FROM matches WHERE booking_id = ?',
    [id, id]
  );
  if (!rows.length) throw new NotFoundError('Match');
  return (rows[0] as any).id;
}

async function verifyCreator(matchId: number, userId: number): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    'SELECT creator_id FROM public_match_details WHERE match_id = ?', [matchId]
  );
  if (!rows.length) throw new NotFoundError('Match');
  if ((rows[0] as any).creator_id !== userId) throw new ForbiddenError('Only the match creator can perform this action');
}

export async function getMatchesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const query = MatchesQuerySchema.parse(request.query);
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    `SELECT m.id, m.type, m.status, m.sport_id, s.name as sport_name,
            bk.id as booking_id, bk.public_id, bk.booking_status as booking_status,
            bk.booking_date, bk.start_time, bk.end_time, bk.start_at_utc,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            br.latitude, br.longitude,
            pmd.visibility, pmd.auto_accept, pmd.max_players,
            pmd.min_age, pmd.max_age, pmd.target_gender,
            pl.name as target_level_name, pmd.deadline,
            ${playedAtExpr('bk')} as played_at,
            ${resultEntryOpenExpr('bk')} as result_entry_open,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            bi.id as invitation_id, bi.status as invitation_status,
            jr.id as join_request_id, jr.status as join_request_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id AND user_id = ?) > 0 as is_participant
     FROM matches m
     JOIN bookings bk ON bk.id = m.booking_id
     JOIN resources r ON r.id = bk.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN invitations bi ON bi.match_id = m.id AND bi.user_id = ?
     LEFT JOIN join_requests jr ON jr.match_id = m.id AND jr.user_id = ?
     LEFT JOIN player_levels pl ON pl.id = pmd.target_level_id
      WHERE m.status IN ('open', 'full')
        AND pmd.visibility = 'public'
        AND (
          (bk.start_at_utc IS NOT NULL AND bk.start_at_utc >= UTC_TIMESTAMP())
          OR (bk.start_at_utc IS NULL AND CONCAT(bk.booking_date, ' ', bk.start_time) >= NOW())
        )`,
    [userId, userId, userId]
  );

  for (const row of rows as any[]) decorateResultState(row);

  reply.send({ data: rows });
}

/**
 * Player-scoped match list — returns ALL matches the user has interacted with
 * (participant, join request, invitation) regardless of status or time. Feeds
 * the Applied / Joined / History tabs on the frontend. Unlike /matches, this
 * endpoint never excludes started/completed/cancelled matches so the Joined
 * tab entry point survives past the match start and the History tab can show
 * expired/rejected records.
 */
export async function getMyMatchesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    `SELECT m.id, m.type, m.status, m.sport_id, s.name as sport_name,
            bk.id as booking_id, bk.public_id, bk.booking_status as booking_status,
            bk.booking_date, bk.start_time, bk.end_time, bk.start_at_utc,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            br.latitude, br.longitude,
            pmd.visibility, pmd.auto_accept, pmd.max_players,
            pmd.min_age, pmd.max_age, pmd.target_gender,
            pl.name as target_level_name, pmd.deadline,
            ${playedAtExpr('bk')} as played_at,
            ${resultEntryOpenExpr('bk')} as result_entry_open,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            bi.id as invitation_id, bi.status as invitation_status,
            jr.id as join_request_id, jr.status as join_request_status,
            (SELECT 1 FROM match_participants WHERE match_id = m.id AND user_id = ?) > 0 as is_participant
     FROM matches m
     JOIN bookings bk ON bk.id = m.booking_id
     JOIN resources r ON r.id = bk.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN invitations bi ON bi.match_id = m.id AND bi.user_id = ?
     LEFT JOIN join_requests jr ON jr.match_id = m.id AND jr.user_id = ?
     LEFT JOIN player_levels pl ON pl.id = pmd.target_level_id
     WHERE (
       EXISTS (SELECT 1 FROM match_participants mp WHERE mp.match_id = m.id AND mp.user_id = ?)
       OR EXISTS (SELECT 1 FROM invitations i WHERE i.match_id = m.id AND i.user_id = ?)
       OR EXISTS (SELECT 1 FROM join_requests jr2 WHERE jr2.match_id = m.id AND jr2.user_id = ?)
     )
     ORDER BY COALESCE(bk.start_at_utc, TIMESTAMP(CONCAT(bk.booking_date, ' ', bk.start_time))) DESC`,
    [userId, userId, userId, userId, userId, userId]
  );

  for (const row of rows as any[]) decorateResultState(row);

  reply.send({ data: rows });
}

/**
 * Platform-wide match monitoring — every status, joined to org/branch/resource.
 * Guards on the platform `matches.admin.view` permission; used by the Admin workbench.
 */
export async function getAdminMatchesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = MonitorMatchesQuerySchema.parse(request.query);
  const pool = getPool();

  const where = ['1=1'];
  const params: any[] = [];
  if (query.status) {
    where.push('m.status = ?');
    params.push(query.status);
  }
  const whereSql = where.join(' AND ');

  const [rows] = await pool.query<RowData>(
    `SELECT m.id, m.type, m.status, m.sport_id, s.name as sport_name,
            bk.id as booking_id, bk.public_id, bk.booking_status as booking_status,
            bk.booking_date, bk.start_time, bk.end_time, bk.start_at_utc, bk.end_at_utc,
            bk.organisation_id,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            pmd.creator_id, cu.full_name as creator_name,
            ${playedAtExpr('bk')} as played_at,
            ${resultEntryOpenExpr('bk')} as result_entry_open,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            (SELECT COUNT(*) FROM join_requests WHERE match_id = m.id AND status = 'submitted') as pending_requests
     FROM matches m
     JOIN bookings bk ON bk.id = m.booking_id
     JOIN resources r ON r.id = bk.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN users cu ON cu.id = pmd.creator_id
     WHERE ${whereSql}
     ORDER BY COALESCE(bk.start_at_utc, TIMESTAMP(CONCAT(bk.booking_date, ' ', bk.start_time))) DESC
     LIMIT ? OFFSET ?`,
    [...params, query.limit ?? 50, query.offset ?? 0]
  );

  for (const row of rows as any[]) decorateResultState(row);

  reply.send({ data: rows });
}

/**
 * Organisation-scoped match monitoring — every match linked to a booking of the
 * given organisation, regardless of status. Tenant isolation is enforced twice:
 * the `requireOrgScopedPermission('org.matches.view')` route guard approves the
 * actor for the org, and this SQL filters on bookings.organisation_id so data can
 * never leak across tenants.
 */
export async function getOrgMatchesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { orgId } = OrgMatchesParamsSchema.parse(request.params);
  const query = MonitorMatchesQuerySchema.parse(request.query);
  const pool = getPool();

  const where = ['bk.organisation_id = ?'];
  const params: any[] = [orgId];
  if (query.status) {
    where.push('m.status = ?');
    params.push(query.status);
  }
  const whereSql = where.join(' AND ');

  const [rows] = await pool.query<RowData>(
    `SELECT m.id, m.type, m.status, m.sport_id, s.name as sport_name,
            bk.id as booking_id, bk.public_id, bk.booking_status as booking_status,
            bk.booking_date, bk.start_time, bk.end_time, bk.start_at_utc, bk.end_at_utc,
            bk.organisation_id, bk.branch_id,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            pmd.creator_id, cu.full_name as creator_name,
            ${playedAtExpr('bk')} as played_at,
            ${resultEntryOpenExpr('bk')} as result_entry_open,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            (SELECT COUNT(*) FROM join_requests WHERE match_id = m.id AND status = 'submitted') as pending_requests
     FROM matches m
     JOIN bookings bk ON bk.id = m.booking_id
     JOIN resources r ON r.id = bk.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN users cu ON cu.id = pmd.creator_id
     WHERE ${whereSql}
     ORDER BY COALESCE(bk.start_at_utc, TIMESTAMP(CONCAT(bk.booking_date, ' ', bk.start_time))) DESC
     LIMIT ? OFFSET ?`,
    [...params, query.limit ?? 50, query.offset ?? 0]
  );

  for (const row of rows as any[]) decorateResultState(row);

  reply.send({ data: rows });
}

/** Single org-scoped match — resolves the match id then verifies tenant ownership. */
export async function getOrgMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { orgId, matchId } = OrgMatchParamsSchema.parse(request.params);
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    `SELECT m.*, m.status as match_status, s.name as sport_name,
            b.id as booking_id, b.public_id, b.booking_status as booking_status,
            b.booking_date, b.start_time, b.end_time, b.end_at_utc,
            b.organisation_id, b.branch_id,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            pmd.*, pl.name as target_level_name,
            ${playedAtExpr('b')} as played_at,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
               'userId', mp.user_id,
               'role', mp.role,
               'fullName', u.full_name,
               'avatarUrl', u.avatar_url
             ))
             FROM match_participants mp
             JOIN users u ON u.id = mp.user_id
             WHERE mp.match_id = m.id) as participants_json,
            ${resultEntryOpenExpr('b')} as result_entry_open
     FROM matches m
     JOIN bookings b ON b.id = m.booking_id
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN player_levels pl ON pl.id = pmd.target_level_id
     WHERE m.id = ? AND b.organisation_id = ?`,
    [matchId, orgId]
  );

  if (!rows.length) {
    reply.status(404).send({ error: 'MATCH_NOT_FOUND', message: 'Match not found in this organisation' });
    return;
  }

  const row = rows[0] as any;
  decorateResultState(row);
  reply.send({ data: row });
}

export async function getMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    `SELECT m.*, m.status as match_status, s.name as sport_name,
            b.id as booking_id, b.public_id, b.booking_status as booking_status,
            b.booking_date, b.start_time, b.end_time, b.end_at_utc,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            pmd.*, pl.name as target_level_name,
            ${playedAtExpr('b')} as played_at,
            ${RESULT_STATUS_EXPR} as result_status,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id AND user_id = ?) > 0 as is_participant,
            (SELECT status FROM join_requests WHERE match_id = m.id AND user_id = ? ORDER BY id DESC LIMIT 1) as join_request_status,
            (SELECT status FROM invitations WHERE match_id = m.id AND user_id = ? ORDER BY id DESC LIMIT 1) as invitation_status,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
               'userId', mp.user_id,
               'role', mp.role,
               'side', mp.side,
               'teamIndex', mp.team_index,
               'fullName', u.full_name,
               'avatarUrl', u.avatar_url,
               'phone', CASE
                 WHEN ? IN (SELECT user_id FROM match_participants WHERE match_id = m.id) OR pmd.creator_id = ?
                 THEN u.phone_number ELSE NULL END
             ))
             FROM match_participants mp
             JOIN users u ON u.id = mp.user_id
             WHERE mp.match_id = m.id) as participants_json,
            ${resultEntryOpenExpr('b')} as result_entry_open
     FROM matches m
     JOIN bookings b ON b.id = m.booking_id
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN player_levels pl ON pl.id = pmd.target_level_id
     WHERE m.id = ?`,
    [userId, userId, userId, userId, userId, matchId]
  );

  if (!rows.length) {
    reply.status(404).send({ error: 'MATCH_NOT_FOUND', message: 'Match not found' });
    return;
  }

  const row = rows[0] as any;
  if (row.format_snapshot && typeof row.format_snapshot === 'string') {
    try { row.format_snapshot = JSON.parse(row.format_snapshot); } catch { row.format_snapshot = null; }
  }
  decorateResultState(row);
  reply.send({ data: row });
}

export async function joinMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const body = JoinBodySchema.parse(request.body ?? {});
  const matchId = await resolveMatchId(id);
  const result = await joinRequestService.submit(matchId, userId, body?.requestedSide);
  reply.status(201).send({ data: result });
}

/**
 * Group 3 — a participant changes their OWN side while the Match is still
 * editable (open/full). The server validates capacity + format + lifecycle
 * authoritatively; the frontend never bypasses the backend.
 */
export async function changeMySideHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const { side } = ChangeSideBodySchema.parse(request.body);
  const matchId = await resolveMatchId(id);
  await joinRequestService.changeSide(matchId, userId, side);
  reply.send({ data: { success: true, side } });
}

export async function withdrawJoinHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    "SELECT id FROM join_requests WHERE match_id = ? AND user_id = ? AND status = 'submitted'",
    [matchId, userId]
  );
  if (!rows.length) throw new NotFoundError('Pending join request');

  await joinRequestService.withdraw((rows[0] as any).id, userId);
  reply.send({ success: true });
}

export async function getApplicantsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  const pool = getPool();

  const [joinRequests] = await pool.execute<RowData>(
    `SELECT jr.id, jr.user_id, u.full_name, u.avatar_url, jr.status, jr.submitted_at, jr.rejection_reason
     FROM join_requests jr
     JOIN users u ON u.id = jr.user_id
     WHERE jr.match_id = ?
     ORDER BY jr.submitted_at DESC`,
    [matchId]
  );

  const [participants] = await pool.execute<RowData>(
    `SELECT mp.user_id, u.full_name, u.avatar_url, mp.role
     FROM match_participants mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.match_id = ?`,
    [matchId]
  );

  reply.send({ data: { joinRequests, participants } });
}

export async function approveApplicantHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id, requestId } = ApplicantParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await joinRequestService.approve(requestId, userId);
  reply.send({ success: true });
}

export async function rejectApplicantHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id, requestId } = ApplicantParamsSchema.parse(request.params);
  const body = ApproveRejectBodySchema.parse(request.body);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await joinRequestService.reject(requestId, userId, body.reason);
  reply.send({ success: true });
}

export async function closeMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await matchService.closeMatch(matchId);
  reply.send({ success: true });
}

export async function cancelMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const body = CancelBodySchema.parse(request.body);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await matchService.cancelMatch(matchId, body.reason);
  reply.send({ success: true });
}

export async function startMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await matchService.startMatch(matchId);
  reply.send({ success: true });
}

export async function completeMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  await verifyCreator(matchId, userId);

  await matchService.completeMatch(matchId);
  reply.send({ success: true });
}
