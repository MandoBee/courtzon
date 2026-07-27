import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { AppError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

export async function listCustomersHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const search = query.search ? `%${query.search}%` : null;

  let where = '';
  const params: any[] = [];
  if (search) {
    where = 'WHERE (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
    params.push(search, search, search, search);
  }

  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.execute<RowData>(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.is_active, u.created_at,
            (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS total_bookings,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS total_orders,
            (SELECT COUNT(*) FROM academy_enrollments ae WHERE ae.user_id = u.id) AS total_enrollments,
            (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.user_id = u.id) AS total_tournaments,
            (SELECT MAX(greatest(
              COALESCE((SELECT MAX(b.created_at) FROM bookings b WHERE b.user_id = u.id), '1970-01-01'),
              COALESCE((SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id), '1970-01-01'),
              COALESCE((SELECT MAX(ae.created_at) FROM academy_enrollments ae WHERE ae.user_id = u.id), '1970-01-01')
            ))) AS last_activity
     FROM users u
     ${where}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return reply.send({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getCustomerHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = Number(id);

  const [users] = await pool.execute<RowData>(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!users.length) throw new NotFoundError('User', ErrorCodes.USER_NOT_FOUND);

  const [bookings] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
     FROM bookings WHERE user_id = ?`, [userId]
  );

  const [orders] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(total_amount), 0) AS total_spent
     FROM orders WHERE user_id = ?`, [userId]
  );

  const [wallet] = await pool.execute<RowData>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS total_deposits,
            COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS total_withdrawn
     FROM wallet_transactions WHERE user_id = ?`, [userId]
  );

  const [enrollments] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM academy_enrollments WHERE user_id = ?`, [userId]
  );

  const [tournaments] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM tournament_registrations WHERE user_id = ?`, [userId]
  );

  const [leagueTeams] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM league_teams WHERE user_id = ?`, [userId]
  );

  const [lastActivity] = await pool.execute<RowData>(
    `SELECT MAX(greatest(
      COALESCE((SELECT MAX(created_at) FROM bookings WHERE user_id = ?), '1970-01-01'),
      COALESCE((SELECT MAX(created_at) FROM orders WHERE user_id = ?), '1970-01-01'),
      COALESCE((SELECT MAX(created_at) FROM academy_enrollments WHERE user_id = ?), '1970-01-01'),
      COALESCE((SELECT MAX(created_at) FROM tournament_registrations WHERE user_id = ?), '1970-01-01')
    )) AS last_activity`, [userId, userId, userId, userId]
  );

  return reply.send({
    data: {
      ...users[0],
      bookings: bookings[0],
      orders: orders[0],
      wallet: wallet[0],
      enrollments: enrollments[0],
      tournaments: tournaments[0],
      leagueTeams: leagueTeams[0],
      lastActivity: lastActivity[0].last_activity,
    },
  });
}

export async function getCustomerTimelineHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = Number(id);
  const query = request.query as any;
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));

  const [rows] = await pool.execute<RowData>(
    `SELECT created_at, 'booking' AS type, id AS ref_id, status AS ref_status, NULL AS ref_amount FROM bookings WHERE user_id = ?
     UNION ALL
     SELECT created_at, 'order', id, status, total_amount FROM orders WHERE user_id = ?
     UNION ALL
     SELECT created_at, 'enrollment', id, status, NULL FROM academy_enrollments WHERE user_id = ?
     UNION ALL
     SELECT created_at, 'tournament_registration', id, status, NULL FROM tournament_registrations WHERE user_id = ?
     UNION ALL
     SELECT created_at, 'wallet_transaction', id, type, amount FROM wallet_transactions WHERE user_id = ?
     UNION ALL
     SELECT created_at, 'activity_log', id, action, NULL FROM activity_logs WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, userId, userId, userId, userId, userId, limit]
  );

  return reply.send({ data: rows });
}

export async function listSegmentsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT cs.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name
     FROM customer_segments cs
     LEFT JOIN users u ON u.id = cs.created_by
     ORDER BY cs.created_at DESC`
  );
  return reply.send({ data: rows });
}

export async function createSegmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO customer_segments (name, description, rules_json, created_by)
     VALUES (?, ?, ?, ?)`,
    [body.name, body.description || null, body.rulesJson ? JSON.stringify(body.rulesJson) : null, userId]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'CRM.SEGMENT.CREATE',
    entityType: 'customer_segments',
    entityId: insertId,
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateSegmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM customer_segments WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Segment', ErrorCodes.SEGMENT_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE customer_segments SET name = COALESCE(?, name), description = COALESCE(?, description),
     rules_json = COALESCE(?, rules_json) WHERE id = ?`,
    [body.name ?? null, body.description ?? null, body.rulesJson ? JSON.stringify(body.rulesJson) : null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.SEGMENT.UPDATE',
    entityType: 'customer_segments',
    entityId: Number(id),
    beforeState: { name: existing[0].name },
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function refreshSegmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM customer_segments WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Segment', ErrorCodes.SEGMENT_NOT_FOUND);

  let memberIds: number[] = [];
  const rules = existing[0].rules_json ? JSON.parse(existing[0].rules_json as string) : null;

  if (rules && rules.conditions && Array.isArray(rules.conditions)) {
    const conditions = rules.conditions;
    const wheres: string[] = [];
    const params: any[] = [];

    for (const c of conditions) {
      if (c.field === 'has_booking') { wheres.push('EXISTS (SELECT 1 FROM bookings WHERE user_id = u.id)'); }
      else if (c.field === 'has_order') { wheres.push('EXISTS (SELECT 1 FROM orders WHERE user_id = u.id)'); }
      else if (c.field === 'has_enrollment') { wheres.push('EXISTS (SELECT 1 FROM academy_enrollments WHERE user_id = u.id)'); }
      else if (c.field === 'created_after') { wheres.push('u.created_at >= ?'); params.push(c.value); }
      else if (c.field === 'created_before') { wheres.push('u.created_at <= ?'); params.push(c.value); }
      else if (c.field === 'is_active') { wheres.push('u.is_active = ?'); params.push(c.value ? 1 : 0); }
    }

    if (wheres.length) {
      const whereClause = rules.operator === 'or' ? wheres.join(' OR ') : wheres.join(' AND ');
      const [rows] = await pool.execute<RowData>(`SELECT u.id FROM users u WHERE ${whereClause}`, params);
      memberIds = rows.map((r: any) => r.id);
    }
  }

  if (!memberIds.length) {
    const [allUsers] = await pool.execute<RowData>(`SELECT id FROM users`);
    memberIds = allUsers.map((r: any) => r.id);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM segment_members WHERE segment_id = ?`, [Number(id)]);
    for (const memberId of memberIds) {
      await conn.execute(
        `INSERT IGNORE INTO segment_members (segment_id, user_id) VALUES (?, ?)`,
        [Number(id), memberId]
      );
    }
    await conn.execute(`UPDATE customer_segments SET member_count = ? WHERE id = ?`, [memberIds.length, Number(id)]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  recordAudit({
    actorId: userId,
    action: 'CRM.SEGMENT.REFRESH',
    entityType: 'customer_segments',
    entityId: Number(id),
    afterState: { memberCount: memberIds.length },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), memberCount: memberIds.length } });
}

export async function deleteSegmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT id FROM customer_segments WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Segment', ErrorCodes.SEGMENT_NOT_FOUND);

  await pool.execute<RowData>(`DELETE FROM customer_segments WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'CRM.SEGMENT.DELETE',
    entityType: 'customer_segments',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), deleted: true } });
}

export async function listLeadsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.status) { conditions.push('l.status = ?'); params.push(query.status); }
  if (query.source) { conditions.push('l.source = ?'); params.push(query.source); }
  if (query.assignedTo) { conditions.push('l.assigned_to = ?'); params.push(Number(query.assignedTo)); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.execute<RowData>(
    `SELECT l.*, a.first_name AS assigned_first_name, a.last_name AS assigned_last_name,
            c.first_name AS creator_first_name, c.last_name AS creator_last_name
     FROM leads l
     LEFT JOIN users a ON a.id = l.assigned_to
     LEFT JOIN users c ON c.id = l.created_by
     ${where}
     ORDER BY l.created_at DESC
     LIMIT 500`,
    params
  );
  return reply.send({ data: rows });
}

export async function createLeadHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO leads (source, full_name, email, phone, notes, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.source || 'manual', body.fullName, body.email || null, body.phone || null,
     body.notes || null, body.assignedTo || null, userId]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'CRM.LEAD.CREATE',
    entityType: 'leads',
    entityId: insertId,
    afterState: { fullName: body.fullName, source: body.source },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateLeadHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leads WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Lead', ErrorCodes.LEAD_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes),
     assigned_to = COALESCE(?, assigned_to), full_name = COALESCE(?, full_name),
     email = COALESCE(?, email), phone = COALESCE(?, phone)
     WHERE id = ?`,
    [body.status ?? null, body.notes ?? null, body.assignedTo ?? null,
     body.fullName ?? null, body.email ?? null, body.phone ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.LEAD.UPDATE',
    entityType: 'leads',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: body.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function convertLeadHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leads WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Lead', ErrorCodes.LEAD_NOT_FOUND);

  if (existing[0].status === 'converted') {
    throw new AppError('Lead is already converted', 400, 'VALIDATION_ERROR');
  }

  let convertedUserId = existing[0].converted_user_id;
  if (body.userId) {
    convertedUserId = Number(body.userId);
  } else if (existing[0].email) {
    const [userMatch] = await pool.execute<RowData>(`SELECT id FROM users WHERE email = ?`, [existing[0].email]);
    if (userMatch.length) convertedUserId = userMatch[0].id;
  }

  await pool.execute<RowData>(
    `UPDATE leads SET status = 'converted', converted_user_id = ? WHERE id = ?`,
    [convertedUserId, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.LEAD.CONVERT',
    entityType: 'leads',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'converted', convertedUserId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'converted', convertedUserId } });
}

export async function listCampaignsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.status) { conditions.push('mc.status = ?'); params.push(query.status); }
  if (query.type) { conditions.push('mc.type = ?'); params.push(query.type); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.execute<RowData>(
    `SELECT mc.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            cs.name AS segment_name
     FROM marketing_campaigns mc
     LEFT JOIN users u ON u.id = mc.created_by
     LEFT JOIN customer_segments cs ON cs.id = mc.segment_id
     ${where}
     ORDER BY mc.created_at DESC
     LIMIT 500`,
    params
  );
  return reply.send({ data: rows });
}

export async function createCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO marketing_campaigns (name, description, type, segment_id, scheduled_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [body.name, body.description || null, body.type || 'multi_channel',
     body.segmentId || null, body.scheduledAt || null, userId]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'CRM.CAMPAIGN.CREATE',
    entityType: 'marketing_campaigns',
    entityId: insertId,
    afterState: { name: body.name, type: body.type },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM marketing_campaigns WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Campaign', ErrorCodes.CAMPAIGN_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE marketing_campaigns SET name = COALESCE(?, name), description = COALESCE(?, description),
     type = COALESCE(?, type), segment_id = COALESCE(?, segment_id), scheduled_at = COALESCE(?, scheduled_at)
     WHERE id = ?`,
    [body.name ?? null, body.description ?? null, body.type ?? null,
     body.segmentId ?? null, body.scheduledAt ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.CAMPAIGN.UPDATE',
    entityType: 'marketing_campaigns',
    entityId: Number(id),
    beforeState: { name: existing[0].name, status: existing[0].status },
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function launchCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM marketing_campaigns WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Campaign', ErrorCodes.CAMPAIGN_NOT_FOUND);

  const campaign = existing[0];
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    throw new AppError('Campaign can only be launched from draft or paused status', 400, 'VALIDATION_ERROR');
  }

  await pool.execute<RowData>(
    `UPDATE marketing_campaigns SET status = 'active', started_at = NOW() WHERE id = ?`,
    [Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.CAMPAIGN.LAUNCH',
    entityType: 'marketing_campaigns',
    entityId: Number(id),
    beforeState: { status: campaign.status },
    afterState: { status: 'active' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'active' } });
}

export async function pauseCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM marketing_campaigns WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Campaign', ErrorCodes.CAMPAIGN_NOT_FOUND);

  if (existing[0].status !== 'active') {
    throw new AppError('Only active campaigns can be paused', 400, 'VALIDATION_ERROR');
  }

  await pool.execute<RowData>(`UPDATE marketing_campaigns SET status = 'paused' WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'CRM.CAMPAIGN.PAUSE',
    entityType: 'marketing_campaigns',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'paused' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'paused' } });
}

export async function completeCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM marketing_campaigns WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Campaign', ErrorCodes.CAMPAIGN_NOT_FOUND);

  if (existing[0].status === 'completed' || existing[0].status === 'cancelled') {
    throw new AppError('Campaign is already completed or cancelled', 400, 'VALIDATION_ERROR');
  }

  await pool.execute<RowData>(
    `UPDATE marketing_campaigns SET status = 'completed', completed_at = NOW() WHERE id = ?`,
    [Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'CRM.CAMPAIGN.COMPLETE',
    entityType: 'marketing_campaigns',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'completed' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'completed' } });
}

export async function listCommunicationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.userId) { conditions.push('cl.user_id = ?'); params.push(Number(query.userId)); }
  if (query.channel) { conditions.push('cl.channel = ?'); params.push(query.channel); }
  if (query.status) { conditions.push('cl.status = ?'); params.push(query.status); }
  if (query.referenceType) { conditions.push('cl.reference_type = ?'); params.push(query.referenceType); }
  if (query.referenceId) { conditions.push('cl.reference_id = ?'); params.push(Number(query.referenceId)); }
  if (query.from) { conditions.push('cl.created_at >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('cl.created_at <= ?'); params.push(query.to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.execute<RowData>(
    `SELECT cl.*, u.first_name, u.last_name, u.email
     FROM communication_log cl
     LEFT JOIN users u ON u.id = cl.user_id
     ${where}
     ORDER BY cl.created_at DESC
     LIMIT 500`,
    params
  );
  return reply.send({ data: rows });
}

export async function getCRMDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [customerCount] = await pool.execute<RowData>(`SELECT COUNT(*) AS total FROM users`);
  const [leadStats] = await pool.execute<RowData>(
    `SELECT status, COUNT(*) AS count FROM leads GROUP BY status`
  );
  const [activeCampaigns] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM marketing_campaigns WHERE status = 'active'`
  );
  const [segmentCount] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS total FROM customer_segments WHERE is_active = 1`
  );
  const [recentLeads] = await pool.execute<RowData>(
    `SELECT l.*, a.first_name AS assigned_first_name, a.last_name AS assigned_last_name
     FROM leads l LEFT JOIN users a ON a.id = l.assigned_to
     ORDER BY l.created_at DESC LIMIT 10`
  );

  return reply.send({
    data: {
      totalCustomers: customerCount[0].total,
      leadStats: leadStats,
      activeCampaigns: activeCampaigns[0].total,
      activeSegments: segmentCount[0].total,
      recentLeads,
    },
  });
}
