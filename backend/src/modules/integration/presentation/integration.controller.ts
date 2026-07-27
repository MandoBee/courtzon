import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { getPool } from '../../../database/mysql.js';
import { apiKeyRepository } from '../infrastructure/repositories/api-key.repository.js';
import { recordAudit } from '../../audit-log/index.js';

type RowData = import('mysql2').RowDataPacket[];

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

// ── API Key Management ──

export async function createApiKeyHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = request.body as any;
  const { id, plainKey } = await apiKeyRepository.create({
    user_id: userId, name: body.name, rate_limit: body.rate_limit, scopes: body.scopes,
  });
  recordAudit({
    actorId: userId, action: 'API_KEY.CREATE', entityType: 'api_key',
    entityId: id, afterState: { name: body.name }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send({ id, name: body.name, api_key: plainKey, note: 'Save this key — it will not be shown again' });
}

export async function listApiKeysHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const keys = await apiKeyRepository.findByUser(userId);
  return reply.send(keys);
}

export async function revokeApiKeyHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await apiKeyRepository.revoke(Number(id), userId);
  recordAudit({
    actorId: userId, action: 'API_KEY.REVOKE', entityType: 'api_key',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ success: true });
}

// ── API Gateway Handlers ──
// These are thin proxies to existing internal services.
// They add no business logic — only API versioning and auth.

async function gatewayQuery(request: FastifyRequest, sql: string, params: any[]): Promise<any[]> {
  const pool = getPool();
  const limit = (request.query as any).limit ? Math.min(Number((request.query as any).limit), 100) : 20;
  const offset = (request.query as any).offset ? Number((request.query as any).offset) : 0;
  const [rows] = await pool.query<RowData>(`${sql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return rows;
}

export async function gatewayListBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const data = await gatewayQuery(request,
    'SELECT id, booking_date, start_time, end_time, total_amount, booking_status FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return reply.send({ data, meta: { version: 'v1' } });
}

export async function gatewayGetBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const userId = getUserId(request);
  const [rows] = await pool.query<RowData>('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [Number(id), userId]);
  if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking not found' });
  return reply.send({ data: rows[0], meta: { version: 'v1' } });
}

export async function gatewayListOrganisationsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const data = await gatewayQuery(_request,
    'SELECT id, name, slug, description, is_verified, is_active FROM organisations WHERE deleted_at IS NULL ORDER BY name', []);
  return reply.send({ data, meta: { version: 'v1' } });
}

export async function gatewayListTournamentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = await gatewayQuery(request,
    'SELECT id, name, format, status, start_date, end_date, max_players, registration_fee FROM tournaments WHERE deleted_at IS NULL ORDER BY start_date DESC', []);
  return reply.send({ data, meta: { version: 'v1' } });
}

export async function gatewayGetTournamentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const pool = getPool();
  const [rows] = await pool.query<RowData>('SELECT * FROM tournaments WHERE id = ?', [Number(id)]);
  if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tournament not found' });
  return reply.send({ data: rows[0], meta: { version: 'v1' } });
}

export async function gatewayListAcademyProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = await gatewayQuery(request,
    "SELECT id, code, name, category, level, season, capacity, price, price_type, status FROM academy_programs WHERE is_public = 1 AND status IN ('published','open','running') ORDER BY name", []);
  return reply.send({ data, meta: { version: 'v1' } });
}

export async function gatewayListProductsHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = await gatewayQuery(request,
    "SELECT id, name, price, discounted_price, currency_code, images, rating_avg FROM products WHERE status = 'active' ORDER BY created_at DESC", []);
  return reply.send({ data, meta: { version: 'v1' } });
}

export async function gatewayListLeaguesHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = await gatewayQuery(request,
    "SELECT l.id, l.code, l.name, l.format, l.status, l.max_teams, s.name AS season_name FROM leagues l LEFT JOIN seasons s ON s.id = l.season_id WHERE l.status IN ('registration_open','running') ORDER BY l.created_at DESC", []);
  return reply.send({ data, meta: { version: 'v1' } });
}
