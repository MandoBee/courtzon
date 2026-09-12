import type { FastifyRequest, FastifyReply } from 'fastify';
import { coachAcademyService } from '../application/coach-academy.service.js';
import {
  RecordAttendanceSchema, UpdateAttendanceSchema, RecordBulkAttendanceSchema, CancelSessionSchema,
} from './academy.dto.js';
import { recordAudit } from '../../audit-log/index.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

// ── G7 — Coach-facing Academy ──

export async function listCoachSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const sessions = await coachAcademyService.listMySessions(userId);
  return reply.send(sessions);
}

export async function getCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const session = await coachAcademyService.getMySession(userId, Number(id));
  return reply.send(session);
}

export async function getCoachSessionRosterHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const roster = await coachAcademyService.getRoster(userId, Number(id));
  return reply.send(roster);
}

export async function startCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const session = await coachAcademyService.start(userId, Number(id));
  return reply.send(session);
}

export async function completeCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const session = await coachAcademyService.complete(userId, Number(id));
  return reply.send(session);
}

export async function cancelCoachSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CancelSessionSchema.parse(request.body ?? {});
  const session = await coachAcademyService.cancel(userId, Number(id), body?.reason ?? null);
  return reply.send(session);
}

export async function recordCoachAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = RecordAttendanceSchema.parse(request.body);
  const result = await coachAcademyService.markAttendance(userId, body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.RECORD', entityType: 'academy_attendance',
    entityId: result.id, afterState: { group_session_id: body.group_session_id, enrollment_id: body.enrollment_id, attendance_status: body.attendance_status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}

export async function updateCoachAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = UpdateAttendanceSchema.parse(request.body);
  await coachAcademyService.updateAttendance(userId, Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.UPDATE', entityType: 'academy_attendance',
    entityId: Number(id), afterState: body, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Attendance updated' });
}

export async function bulkCoachAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RecordBulkAttendanceSchema.parse(request.body);
  const result = await coachAcademyService.bulkAttendance(userId, Number(id), body.records);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.BULK_RECORD', entityType: 'academy_group_session',
    entityId: Number(id), afterState: { count: result.created },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}