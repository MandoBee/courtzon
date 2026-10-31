import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import {
  savePushToken,
  removePushToken,
  listPushTokens,
  findPushToken,
} from '../../notifications/application/device.service.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const RegisterPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(500),
  platform: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(200).optional(),
});

const UnregisterPushTokenSchema = z.object({
  token: z.string().trim().min(1).max(500),
});

export async function registerPushTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const parsed = RegisterPushTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'token, platform and deviceName are invalid or missing',
    });
  }

  const { token, platform, deviceName } = parsed.data;
  let tokenId: number;
  try {
    tokenId = await savePushToken(userId, token, platform, { deviceName: deviceName || undefined });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({
        error: 'CONFLICT',
        message: 'Push token is already registered to another user',
      });
    }
    throw err;
  }

  recordAudit({
    actorId: userId,
    action: 'MOBILE.PUSH.REGISTER',
    entityType: 'push_tokens',
    // Numeric row id — never the token itself.
    entityId: tokenId,
    afterState: { platform, deviceName: deviceName ?? null },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { registered: true } });
}

export async function unregisterPushTokenHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const parsed = UnregisterPushTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'token is invalid or missing',
    });
  }

  const { token } = parsed.data;
  const existing = await findPushToken(userId, token);
  if (!existing) throw new NotFoundError('Push token', ErrorCodes.PUSH_TOKEN_NOT_FOUND);

  // Scoped by user_id — a token owned by another user is never modified.
  await removePushToken(userId, token);

  recordAudit({
    actorId: userId,
    action: 'MOBILE.PUSH.UNREGISTER',
    entityType: 'push_tokens',
    entityId: existing.id,
    beforeState: { platform: existing.platform, deviceName: existing.device_name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { unregistered: true } });
}

export async function listPushTokensHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;

  const rows = await listPushTokens(userId);

  // Preserve the legacy response contract; `device_id` has no storage column.
  return reply.send({
    data: rows.map((row) => ({
      id: row.id,
      token: row.token,
      platform: row.platform,
      device_name: row.device_name,
      device_id: null,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  });
}

export async function getLatestVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const platform = query.platform || null;

  let sql = `SELECT id, version, build_number, platform, min_version, is_forced, release_notes, download_url, created_at
             FROM app_versions WHERE is_active = 1`;
  const params: any[] = [];
  if (platform) {
    sql += ` AND platform = ?`;
    params.push(platform);
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;

  const [rows] = await pool.execute<RowData>(sql, params);
  return reply.send({ data: rows.length ? rows[0] : null });
}

export async function listAppVersionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM app_versions ORDER BY created_at DESC`
  );
  return reply.send({ data: rows });
}

export async function createAppVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = (request as any).userId;
  const body = request.body as any;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO app_versions (version, build_number, platform, min_version, is_forced, is_active, release_notes, download_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.version, body.buildNumber || null, body.platform || null, body.minVersion || null,
     body.isForced ? 1 : 0, body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1,
     body.releaseNotes || null, body.downloadUrl || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'MOBILE.VERSION.CREATE',
    entityType: 'app_versions',
    entityId: insertId,
    afterState: { version: body.version, platform: body.platform },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateAppVersionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const body = request.body as any;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM app_versions WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('App version', ErrorCodes.APP_VERSION_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE app_versions SET version = COALESCE(?, version), build_number = COALESCE(?, build_number),
       platform = COALESCE(?, platform), min_version = COALESCE(?, min_version),
       is_forced = COALESCE(?, is_forced), is_active = COALESCE(?, is_active),
       release_notes = COALESCE(?, release_notes), download_url = COALESCE(?, download_url)
     WHERE id = ?`,
    [body.version ?? null, body.buildNumber ?? null, body.platform ?? null,
     body.minVersion ?? null, body.isForced ?? null, body.isActive ?? null,
     body.releaseNotes ?? null, body.downloadUrl ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'MOBILE.VERSION.UPDATE',
    entityType: 'app_versions',
    entityId: Number(id),
    beforeState: { version: existing[0].version },
    afterState: { version: body.version },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function getAppConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const platform = query.platform || null;

  let sql = `SELECT config_key, config_value FROM app_config WHERE is_active = 1`;
  const params: any[] = [];
  if (platform) {
    sql += ` AND (platform = ? OR platform IS NULL)`;
    params.push(platform);
  }

  const [rows] = await pool.execute<RowData>(sql, params);
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.config_key as string] = row.config_value as string;
  }
  return reply.send({ data: config });
}

export async function listAppConfigHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM app_config ORDER BY config_key ASC`
  );
  return reply.send({ data: rows });
}

export async function updateAppConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const body = request.body as any;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM app_config WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('App config', ErrorCodes.APP_VERSION_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE app_config SET config_key = COALESCE(?, config_key), config_value = COALESCE(?, config_value),
       description = COALESCE(?, description), platform = COALESCE(?, platform),
       is_active = COALESCE(?, is_active)
     WHERE id = ?`,
    [body.configKey ?? null, body.configValue ?? null, body.description ?? null,
     body.platform ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'MOBILE.CONFIG.UPDATE',
    entityType: 'app_config',
    entityId: Number(id),
    beforeState: { key: existing[0].config_key },
    afterState: { key: body.configKey },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function createAppConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = (request as any).userId;
  const body = request.body as any;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO app_config (config_key, config_value, description, platform, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [body.configKey, body.configValue || '', body.description || null,
     body.platform || null, body.isActive !== undefined ? (body.isActive ? 1 : 0) : 1]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'MOBILE.CONFIG.CREATE',
    entityType: 'app_config',
    entityId: insertId,
    afterState: { key: body.configKey },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function getPushLogHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];

  if (query.status) { conditions.push('pl.status = ?'); params.push(query.status); }
  if (query.platform) { conditions.push('pt.platform = ?'); params.push(query.platform); }
  if (query.from) { conditions.push('pl.created_at >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('pl.created_at <= ?'); params.push(query.to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM push_log pl
     LEFT JOIN push_tokens pt ON pt.id = pl.push_token_id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query<RowData>(
    `SELECT pl.*, pt.platform, pt.device_name, pt.token
     FROM push_log pl
     LEFT JOIN push_tokens pt ON pt.id = pl.push_token_id
     ${where}
     ORDER BY pl.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return reply.send({
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getMobileDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();

  const [totalTokens] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM push_tokens WHERE is_active = 1`
  );

  const [platformBreakdown] = await pool.execute<RowData>(
    `SELECT platform, COUNT(*) AS count FROM push_tokens WHERE is_active = 1 GROUP BY platform`
  );

  const [pushStats] = await pool.execute<RowData>(
    `SELECT
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM push_log WHERE DATE(created_at) = CURDATE()`
  );

  const [versionCount] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM app_versions`
  );

  return reply.send({
    data: {
      totalPushTokens: totalTokens[0].total,
      platformBreakdown,
      pushToday: {
        sent: pushStats[0].sent || 0,
        delivered: pushStats[0].delivered || 0,
        failed: pushStats[0].failed || 0,
      },
      totalAppVersions: versionCount[0].total,
    },
  });
}
