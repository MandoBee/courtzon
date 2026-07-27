import type { FastifyRequest, FastifyReply } from 'fastify';
import { academyProgramService } from '../application/program.service.js';
import { academyGroupService } from '../application/group.service.js';
import { academyEnrollmentService } from '../application/enrollment.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';
import {
  CreateProgramSchema, UpdateProgramSchema, ListProgramsQuerySchema, TransitionStatusSchema,
  CreateGroupSchema, UpdateGroupSchema, AssignCoachSchema, ListGroupsQuerySchema,
  CreateEnrollmentSchema, MoveEnrollmentSchema, ListEnrollmentsQuerySchema,
  CreateGroupSessionSchema, UpdateGroupSessionSchema, ListSessionsQuerySchema,
  RecordAttendanceSchema, RecordBulkAttendanceSchema, UpdateAttendanceSchema, ListAttendanceQuerySchema,
} from './academy.dto.js';
import { getPool } from '../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

// ── Dashboard ──

export async function getDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const dashboard = await academyProgramService.getDashboard();
  return reply.send(dashboard);
}

// ── Programs ──

export async function listProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListProgramsQuerySchema.parse(request.query);
  const result = await academyProgramService.list(query);
  return reply.send(result);
}

export async function getProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const program = await academyProgramService.getById(Number(id));
  if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  return reply.send(program);
}

export async function createProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateProgramSchema.parse(request.body);
  const program = await academyProgramService.create(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.CREATE', entityType: 'academy_program',
    entityId: program.id!, afterState: { code: body.code, name: body.name, category: body.category },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(program);
}

export async function updateProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateProgramSchema.parse(request.body);
  const before = await academyProgramService.getById(Number(id));
  const program = await academyProgramService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.UPDATE', entityType: 'academy_program',
    entityId: Number(id), beforeState: before ? { name: before.name } : null,
    afterState: { ...body }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function publishProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const program = await academyProgramService.publish(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.PUBLISH', entityType: 'academy_program',
    entityId: Number(id), afterState: { status: 'published' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function archiveProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const program = await academyProgramService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.ARCHIVE', entityType: 'academy_program',
    entityId: Number(id), afterState: { status: 'archived' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function transitionProgramStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = TransitionStatusSchema.parse(request.body);
  const program = await academyProgramService.transitionStatus(Number(id), body.status);
  recordAudit({
    actorId: userId, action: `ACADEMY_PROGRAM.TRANSITION_${body.status.toUpperCase()}`, entityType: 'academy_program',
    entityId: Number(id), afterState: { status: body.status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function getProgramCategoriesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const categories = await academyProgramService.getCategories();
  return reply.send({ categories });
}

// ── Groups ──

export async function listGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListGroupsQuerySchema.parse(request.query);
  const { programId } = request.params as any;
  if (programId) {
    const result = await academyGroupService.listByProgram(Number(programId), query);
    return reply.send(result);
  }
  const result = await academyGroupService.listAll(query);
  return reply.send(result);
}

export async function getGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const group = await academyGroupService.getById(Number(id));
  return reply.send(group);
}

export async function createGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateGroupSchema.parse(request.body);
  const group = await academyGroupService.create(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.CREATE', entityType: 'academy_group',
    entityId: group.id!, afterState: { name: body.name, program_id: body.program_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(group);
}

export async function updateGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateGroupSchema.parse(request.body);
  const group = await academyGroupService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.UPDATE', entityType: 'academy_group',
    entityId: Number(id), afterState: body, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(group);
}

export async function assignCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = AssignCoachSchema.parse(request.body);
  const group = await academyGroupService.assignCoach(Number(id), body.coach_id);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.ASSIGN_COACH', entityType: 'academy_group',
    entityId: Number(id), afterState: { coach_id: body.coach_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(group);
}

export async function archiveGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await academyGroupService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.ARCHIVE', entityType: 'academy_group',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// ── Enrollments ──

export async function listEnrollmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListEnrollmentsQuerySchema.parse(request.query);
  const { programId } = request.params as any;
  if (programId) query.program_id = Number(programId);
  const result = await academyEnrollmentService.list(query);
  return reply.send(result);
}

export async function getEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const enrollment = await academyEnrollmentService.getById(Number(id));
  return reply.send(enrollment);
}

export async function createEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateEnrollmentSchema.parse(request.body);
  const enrollment = await academyEnrollmentService.enroll(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.CREATE', entityType: 'academy_enrollment',
    entityId: enrollment.id!, afterState: { player_id: body.player_id, program_id: body.program_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(enrollment);
}

export async function cancelEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  await academyEnrollmentService.cancel(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.CANCEL', entityType: 'academy_enrollment',
    entityId: Number(id), beforeState: before ? { status: before.status } : null,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Enrolment cancelled' });
}

export async function completeEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await academyEnrollmentService.complete(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.COMPLETE', entityType: 'academy_enrollment',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Enrolment completed' });
}

export async function confirmEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await academyEnrollmentService.confirm(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.CONFIRM', entityType: 'academy_enrollment',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Enrolment confirmed' });
}

export async function moveEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = MoveEnrollmentSchema.parse(request.body);
  const enrollment = await academyEnrollmentService.moveToGroup(Number(id), body.group_id);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.MOVE', entityType: 'academy_enrollment',
    entityId: Number(id), afterState: { group_id: body.group_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(enrollment);
}

export async function getEnrollmentHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const history = await academyEnrollmentService.getHistory(Number(id));
  return reply.send(history);
}

// ── Group Sessions ──

export async function listSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListSessionsQuerySchema.parse(request.query);
  const { groupId } = request.params as any;
  if (groupId) query.group_id = Number(groupId);
  const pool = getPool();
  type RowData = import('mysql2').RowDataPacket[];
  const where: string[] = ['1 = 1'];
  const params: any[] = [];
  if (query.group_id) { where.push('s.group_id = ?'); params.push(query.group_id); }
  if (query.status) { where.push('s.status = ?'); params.push(query.status); }
  const pag = buildPagination(query.page, query.limit);
  const clause = paginationClause(pag);
  const [countRows] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM academy_group_sessions s WHERE ${where.join(' AND ')}`, params,
  );
  const [rows] = await pool.query<RowData>(
    `SELECT s.*, g.name AS group_name, r.name AS court_name, u.full_name AS coach_name
     FROM academy_group_sessions s
     LEFT JOIN academy_groups g ON g.id = s.group_id
     LEFT JOIN resources r ON r.id = s.court_id
     LEFT JOIN users u ON u.id = s.coach_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.session_date DESC, s.start_time ASC${clause}`, params,
  );
  return reply.send({ data: rows, total: countRows[0]?.total ?? 0, page: pag.page, limit: pag.limit });
}

export async function createSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateGroupSessionSchema.parse(request.body);
  const pool = getPool();
  const sql = 'INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, court_id, coach_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const [result] = await pool.execute(sql,
    [body.group_id, body.session_date, body.start_time ?? null, body.end_time ?? null,
     body.court_id ?? null, body.coach_id ?? null, body.status],
  );
  const id = (result as any).insertId;
  return reply.status(201).send({ id });
}

export async function updateSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateGroupSessionSchema.parse(request.body);
  const fields: string[] = [];
  const params: any[] = [];
  if (body.session_date !== undefined) { fields.push('session_date = ?'); params.push(body.session_date); }
  if (body.start_time !== undefined) { fields.push('start_time = ?'); params.push(body.start_time); }
  if (body.end_time !== undefined) { fields.push('end_time = ?'); params.push(body.end_time); }
  if (body.court_id !== undefined) { fields.push('court_id = ?'); params.push(body.court_id); }
  if (body.coach_id !== undefined) { fields.push('coach_id = ?'); params.push(body.coach_id); }
  if (body.status !== undefined) { fields.push('status = ?'); params.push(body.status); }
  if (fields.length) {
    params.push(Number(id));
    const pool = getPool();
    await pool.query(
      `UPDATE academy_group_sessions SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, params,
    );
  }
  return reply.send({ message: 'Session updated' });
}

// ── Attendance ──

export async function listAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListAttendanceQuerySchema.parse(request.query);
  const { sessionId } = request.params as any;
  if (sessionId) query.group_session_id = Number(sessionId);
  const result = await academyAttendanceService.list(query);
  return reply.send(result);
}

export async function recordAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = RecordAttendanceSchema.parse(request.body);
  const result = await academyAttendanceService.record(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.RECORD', entityType: 'academy_attendance',
    entityId: result.id, afterState: { group_session_id: body.group_session_id, enrollment_id: body.enrollment_id, attendance_status: body.attendance_status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}

export async function recordBulkAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { sessionId } = request.params as any;
  const body = RecordBulkAttendanceSchema.parse(request.body);
  const result = await academyAttendanceService.recordBulk(Number(sessionId), body.records);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.BULK_RECORD', entityType: 'academy_group_session',
    entityId: Number(sessionId), afterState: { count: result.created },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}

export async function updateAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateAttendanceSchema.parse(request.body);
  await academyAttendanceService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.UPDATE', entityType: 'academy_attendance',
    entityId: Number(id), afterState: body, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Attendance updated' });
}

export async function getSessionAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sessionId } = request.params as any;
  const rows = await academyAttendanceService.getBySession(Number(sessionId));
  const summary = await academyAttendanceService.getSummary(Number(sessionId));
  return reply.send({ data: rows, summary });
}
