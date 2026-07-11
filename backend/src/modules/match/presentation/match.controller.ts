import type { FastifyRequest, FastifyReply } from 'fastify';
import type mysql from 'mysql2/promise';
import { MatchesQuerySchema, MatchParamsSchema, ApplicantParamsSchema, ApproveRejectBodySchema, CancelBodySchema } from './match.dto.js';
import { matchService } from '../application/services/match.service.js';
import { joinRequestService } from '../application/services/join-request.service.js';
import { getPool } from '../../../database/mysql.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

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
            bk.booking_date, bk.start_time, bk.end_time,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            br.latitude, br.longitude,
            pmd.visibility, pmd.auto_accept, pmd.max_players,
            pmd.min_age, pmd.max_age, pmd.target_gender,
            pl.name as target_level_name, pmd.deadline,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id AND role != 'host') as participant_count,
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
       AND pmd.visibility = 'public'`,
    [userId, userId, userId]
  );

  reply.send({ data: rows });
}

export async function getMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  const pool = getPool();

  const [rows] = await pool.execute<RowData>(
    `SELECT m.*, s.name as sport_name,
            b.booking_date, b.start_time, b.end_time,
            r.name as resource_name, br.name as branch_name, org.name as organisation_name,
            pmd.*, pl.name as target_level_name,
            (SELECT COUNT(*) FROM match_participants WHERE match_id = m.id) as participant_count,
            (SELECT JSON_ARRAYAGG(JSON_OBJECT('userId', mp.user_id, 'role', mp.role))
             FROM match_participants mp WHERE mp.match_id = m.id) as participants_json
     FROM matches m
     JOIN bookings b ON b.id = m.booking_id
     JOIN resources r ON r.id = b.resource_id
     JOIN branches br ON br.id = r.branch_id
     JOIN organisations org ON org.id = br.organisation_id
     JOIN sports s ON s.id = m.sport_id
     LEFT JOIN public_match_details pmd ON pmd.match_id = m.id
     LEFT JOIN player_levels pl ON pl.id = pmd.target_level_id
     WHERE m.id = ?`,
    [matchId]
  );

  if (!rows.length) {
    reply.status(404).send({ error: 'MATCH_NOT_FOUND', message: 'Match not found' });
    return;
  }

  reply.send({ data: rows[0] });
}

export async function joinMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = (request as any).userId;
  const { id } = MatchParamsSchema.parse(request.params);
  const matchId = await resolveMatchId(id);
  const result = await joinRequestService.submit(matchId, userId);
  reply.status(201).send({ data: result });
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
