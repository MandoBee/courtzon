import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const CreateTicketSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  category: z.enum(['general', 'billing', 'technical', 'account', 'feature_request', 'other']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const UpdateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  category: z.enum(['general', 'billing', 'technical', 'account', 'feature_request', 'other']).optional(),
});

const AssignTicketSchema = z.object({
  assignedTo: z.number().int().positive(),
});

const AddMessageSchema = z.object({
  message: z.string().min(1),
  isInternal: z.boolean().optional(),
});

function buildMeta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() };
}

function getUserId(request: FastifyRequest): number {
  return (request as any).userId;
}

export async function listTicketsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { status, category, priority, search, page = '1', limit = '20' } = request.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE 1=1';
  const params: mysql.ExecuteValues = [];
  if (status) { where += ' AND st.status = ?'; params.push(status); }
  if (category) { where += ' AND st.category = ?'; params.push(category); }
  if (priority) { where += ' AND st.priority = ?'; params.push(priority); }
  if (search) { where += ' AND st.subject LIKE ?'; params.push(`%${search}%`); }

  const [countRows] = await pool.execute<RowData>(
    `SELECT COUNT(*) as total FROM support_tickets st ${where}`, params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query<RowData>(
    `SELECT st.*, 
      u.full_name AS user_name, u.email AS user_email,
      a.full_name AS assignee_name,
      org.name AS organisation_name
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     LEFT JOIN users a ON a.id = st.assigned_to
     LEFT JOIN organisations org ON org.id = st.organisation_id
     ${where}
     ORDER BY st.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  return reply.send({
    data: rows,
    meta: buildMeta(request),
    pagination: { page: pageNum, limit: limitNum, total },
  });
}

export async function getTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as { id: string };
  const [rows] = await pool.execute<RowData>(
    `SELECT st.*, 
      u.full_name AS user_name, u.email AS user_email,
      a.full_name AS assignee_name,
      org.name AS organisation_name
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     LEFT JOIN users a ON a.id = st.assigned_to
     LEFT JOIN organisations org ON org.id = st.organisation_id
     WHERE st.id = ?`,
    [id]
  );
  if (!rows.length) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Ticket not found', meta: buildMeta(request) });
  }
  return reply.send({ data: rows[0], meta: buildMeta(request) });
}

export async function createTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const body = CreateTicketSchema.parse(request.body);

  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO support_tickets (organisation_id, user_id, subject, description, category, priority, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`,
    [body.organisationId || null, userId, body.subject, body.description, body.category || 'general', body.priority || 'normal']
  );

  const ticketId = result.insertId;

  recordAudit({
    actorId: userId,
    action: 'SUPPORT_TICKET.CREATE',
    entityType: 'support_ticket',
    entityId: String(ticketId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string,
    afterState: { subject: body.subject, category: body.category, priority: body.priority },
  });

  return reply.status(201).send({
    data: { id: ticketId },
    meta: { ...buildMeta(request), code: 'CREATED' },
  });
}

export async function updateTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const { id } = request.params as { id: string };
  const body = UpdateTicketSchema.parse(request.body);

  const sets: string[] = [];
  const params: mysql.ExecuteValues = [];
  if (body.status) { sets.push('status = ?'); params.push(body.status); }
  if (body.priority) { sets.push('priority = ?'); params.push(body.priority); }
  if (body.category) { sets.push('category = ?'); params.push(body.category); }
  if (!sets.length) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'No fields to update', meta: buildMeta(request) });
  }
  params.push(id);

  await pool.execute(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`, params);

  recordAudit({
    actorId: userId,
    action: 'SUPPORT_TICKET.UPDATE',
    entityType: 'support_ticket',
    entityId: id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string,
    afterState: body,
  });

  return reply.send({ data: { id: Number(id), ...body }, meta: buildMeta(request) });
}

export async function assignTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const { id } = request.params as { id: string };
  const body = AssignTicketSchema.parse(request.body);

  await pool.execute('UPDATE support_tickets SET assigned_to = ? WHERE id = ?', [body.assignedTo, id]);

  recordAudit({
    actorId: userId,
    action: 'SUPPORT_TICKET.ASSIGN',
    entityType: 'support_ticket',
    entityId: id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string,
    afterState: { assignedTo: body.assignedTo },
  });

  return reply.send({ data: { id: Number(id), assignedTo: body.assignedTo }, meta: buildMeta(request) });
}

export async function getTicketMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as { id: string };
  const [rows] = await pool.execute<RowData>(
    `SELECT stm.*, u.full_name AS user_name, u.email AS user_email
     FROM support_ticket_messages stm
     LEFT JOIN users u ON u.id = stm.user_id
     WHERE stm.ticket_id = ?
     ORDER BY stm.created_at ASC`,
    [id]
  );
  return reply.send({ data: rows, meta: buildMeta(request) });
}

export async function addTicketMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const { id } = request.params as { id: string };
  const body = AddMessageSchema.parse(request.body);

  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO support_ticket_messages (ticket_id, user_id, message, is_internal)
     VALUES (?, ?, ?, ?)`,
    [id, userId, body.message, body.isInternal ? 1 : 0]
  );

  recordAudit({
    actorId: userId,
    action: 'SUPPORT_TICKET.ADD_MESSAGE',
    entityType: 'support_ticket_message',
    entityId: String(result.insertId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string,
    afterState: { ticketId: Number(id), isInternal: body.isInternal },
  });

  return reply.status(201).send({
    data: { id: result.insertId },
    meta: { ...buildMeta(request), code: 'CREATED' },
  });
}

export async function getMyTicketsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const { page = '1', limit = '20' } = request.query as Record<string, string>;
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  const [countRows] = await pool.execute<RowData>(
    'SELECT COUNT(*) as total FROM support_tickets WHERE user_id = ?', [userId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query<RowData>(
    `SELECT st.*, a.full_name AS assignee_name
     FROM support_tickets st
     LEFT JOIN users a ON a.id = st.assigned_to
     WHERE st.user_id = ?
     ORDER BY st.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limitNum, offset]
  );

  return reply.send({
    data: rows,
    meta: buildMeta(request),
    pagination: { page: pageNum, limit: limitNum, total },
  });
}

export async function addMyTicketMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const userId = getUserId(request);
  const { id } = request.params as { id: string };

  const [tickets] = await pool.execute<RowData>(
    'SELECT id FROM support_tickets WHERE id = ? AND user_id = ?', [id, userId]
  );
  if (!tickets.length) {
    return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not your ticket', meta: buildMeta(request) });
  }

  const body = AddMessageSchema.parse(request.body);
  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO support_ticket_messages (ticket_id, user_id, message, is_internal)
     VALUES (?, ?, ?, 0)`,
    [id, userId, body.message]
  );

  return reply.status(201).send({
    data: { id: result.insertId },
    meta: { ...buildMeta(request), code: 'CREATED' },
  });
}

export async function getTicketStatsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();

  const [statusCounts] = await pool.execute<RowData>(
    `SELECT status, COUNT(*) as count FROM support_tickets GROUP BY status`
  );
  const [categoryCounts] = await pool.execute<RowData>(
    `SELECT category, COUNT(*) as count FROM support_tickets GROUP BY category`
  );
  const [priorityCounts] = await pool.execute<RowData>(
    `SELECT priority, COUNT(*) as count FROM support_tickets GROUP BY priority`
  );

  const toMap = (rows: RowData) => Object.fromEntries(rows.map((r: any) => [r.status || r.category || r.priority, r.count]));

  return reply.send({
    data: {
      byStatus: toMap(statusCounts),
      byCategory: toMap(categoryCounts),
      byPriority: toMap(priorityCounts),
    },
    meta: buildMeta(_request),
  });
}
