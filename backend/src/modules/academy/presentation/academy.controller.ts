import type { FastifyRequest, FastifyReply } from 'fastify';
import { academyProgramService } from '../application/program.service.js';
import { academyGroupService } from '../application/group.service.js';
import { academyEnrollmentService } from '../application/enrollment.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';
import { academyScheduleService } from '../application/academy-schedule.service.js';
import { academyConfirmationService } from '../application/academy-confirmation.service.js';
import { academyCapacityOverrideService } from '../application/capacity-override.service.js';
import { academySessionService } from '../application/session.service.js';
import { publicAcademyService } from '../application/public-academy.service.js';
import {
  CreateProgramSchema, UpdateProgramSchema, ListProgramsQuerySchema, TransitionStatusSchema,
  CreateGroupSchema, UpdateGroupSchema, AssignCoachSchema, SetCompensationSchema, ConfirmAcademySchema, ListGroupsQuerySchema,
  CreateEnrollmentSchema, MoveEnrollmentSchema, ListEnrollmentsQuerySchema,
  CreateGroupSessionSchema, UpdateGroupSessionSchema, ListSessionsQuerySchema,
  RecordAttendanceSchema, RecordBulkAttendanceSchema, UpdateAttendanceSchema, ListAttendanceQuerySchema,
  CreateScheduleSchema, UpdateScheduleSchema, ListSchedulesQuerySchema, ListScheduleSessionsQuerySchema,
  ScheduleStatusSchema, ResolveSessionSchema, ConfirmationRequestSchema, MarkEnrollmentPaymentSchema,
  CapacityOverrideSchema, RemoveCapacityOverrideSchema, PromoteEnrollmentSchema, ReplaceEnrollmentSchema,
  StartSessionSchema, CompleteSessionSchema, CancelSessionSchema,
} from './academy.dto.js';
import { getPool } from '../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';
import { recordAudit } from '../../audit-log/index.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { assertCanManageScopeInput, resolveAcademyReadScope, academyScopeWhere } from '../application/academy-scope.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }
function getUserAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

/** Object-level authorization: actor must manage the Academy's organisation+branch. */
async function assertProgramAccess(actorId: number, programId: number): Promise<void> {
  await academyProgramService.assertCanManage(actorId, programId);
}

/** Object-level authorization for a group (resolved to its program). */
async function assertGroupAccess(actorId: number, groupId: number): Promise<void> {
  const programId = await academyGroupService.resolveProgramId(groupId);
  if (!programId) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
  await assertProgramAccess(actorId, programId);
}

/**
 * G1.1 — resolve the user's Academy read scope and build a SQL fragment over the
 * program-ownership alias (`p.`) for list queries.
 */
async function resolveListScope(request: FastifyRequest): Promise<{ where: string; params: number[] }> {
  const scope = await resolveAcademyReadScope(getUserId(request));
  return academyScopeWhere(scope, 'p');
}

// â”€â”€ Dashboard â”€â”€

export async function getDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const scope = await resolveAcademyReadScope(getUserId(request));
  const dashboard = await academyProgramService.getDashboard({ orgIds: scope.orgIds, branchIds: scope.branchIds });
  return reply.send(dashboard);
}

// â”€â”€ Programs â”€â”€

export async function listProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const query = ListProgramsQuerySchema.parse(request.query);
  const { where, params } = await resolveListScope(request);
  const filters: any = { ...query };
  if (where) filters.scopeWhere = where;
  if (params.length) filters.scopeParams = params;
  const result = await academyProgramService.list(filters);
  return reply.send(result);
}

export async function getProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertProgramAccess(userId, Number(id));
  const program = await academyProgramService.getById(Number(id));
  if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  return reply.send(program);
}

export async function getProgramDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertProgramAccess(userId, Number(id));
  const detail = await academyProgramService.getDetail(Number(id));
  if (!detail) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  return reply.send(detail);
}

export async function createProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateProgramSchema.parse(request.body);
  // Creation requires the actor to have organisation/branch access to the chosen scope.
  await assertCanManageScopeInput(userId, body.organisation_id, body.branch_id ?? null);
  const program = await academyProgramService.create(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.CREATE', entityType: 'academy_program',
    entityId: program.id!, afterState: { code: body.code, name: body.name, category: body.category, organisation_id: body.organisation_id, branch_id: body.branch_id ?? null, sport_id: body.sport_id ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(program);
}

export async function updateProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertProgramAccess(userId, Number(id));
  const body = UpdateProgramSchema.parse(request.body);
  const before = await academyProgramService.getById(Number(id));
  const program = await academyProgramService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.UPDATE', entityType: 'academy_program',
    entityId: Number(id), beforeState: before ? { name: before.name, organisation_id: before.organisation_id } : null,
    afterState: { ...body }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function confirmProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertProgramAccess(userId, Number(id));
  ConfirmAcademySchema.parse(request.body ?? {});
  const program = await academyProgramService.confirm(Number(id), userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_PROGRAM.CONFIRM', entityType: 'academy_program',
    entityId: Number(id), afterState: { lifecycle_state: 'confirmed' },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

// ── G3 — Confirmation lifecycle ──

export async function getConfirmationReadinessHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const readiness = await academyConfirmationService.readiness(Number(id), userId);
  return reply.send(readiness);
}

export async function confirmProgramG3Handler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = ConfirmationRequestSchema.parse(request.body ?? {});
  const result = await academyConfirmationService.confirm(Number(id), userId, {
    expectedSnapshotToken: body.expected_snapshot_token ?? null,
    overrideBelowMin: body.override_below_min,
    overrideAboveMax: body.override_above_max,
    reason: body.reason ?? null,
  });
  return reply.send(result);
}

export async function markEnrollmentPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  MarkEnrollmentPaymentSchema.parse(request.body ?? {});
  const result = await academyConfirmationService.markPaymentConfirmed(Number(id), userId);
  return reply.send(result);
}

// ── G4 — Capacity override + waitlist promotion/replacement ──

export async function getCapacityStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const status = await academyCapacityOverrideService.getStatus(Number(id), userId);
  return reply.send(status);
}

export async function setCapacityOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = CapacityOverrideSchema.parse(request.body);
  const status = await academyCapacityOverrideService.setOverride(Number(id), userId, {
    amount: body.amount,
    until: body.until ?? null,
    reason: body.reason,
  });
  return reply.send(status);
}

export async function removeCapacityOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = RemoveCapacityOverrideSchema.parse(request.body);
  const status = await academyCapacityOverrideService.removeOverride(Number(id), userId, body.reason);
  return reply.send(status);
}

export async function promoteEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
  PromoteEnrollmentSchema.parse(request.body ?? {});
  const enrollment = await academyEnrollmentService.promote(Number(id), userId, { outOfOrder: false });
  return reply.send(enrollment);
}

export async function replaceEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
  const body = ReplaceEnrollmentSchema.parse(request.body);
  const enrollment = await academyEnrollmentService.replace(Number(id), userId, body.reason);
  return reply.send(enrollment);
}

export async function publishProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertProgramAccess(userId, Number(id));
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
  await assertProgramAccess(userId, Number(id));
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
  await assertProgramAccess(userId, Number(id));
  const body = TransitionStatusSchema.parse(request.body);
  const program = await academyProgramService.transitionStatus(Number(id), body.status);
  recordAudit({
    actorId: userId, action: `ACADEMY_PROGRAM.TRANSITION_${body.status.toUpperCase()}`, entityType: 'academy_program',
    entityId: Number(id), afterState: { status: body.status },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(program);
}

export async function getProgramCategoriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const scope = await resolveAcademyReadScope(getUserId(request));
  const categories = await academyProgramService.getCategories({ orgIds: scope.orgIds, branchIds: scope.branchIds });
  return reply.send({ categories });
}

// â”€â”€ Groups â”€â”€

export async function listGroupsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const query = ListGroupsQuerySchema.parse(request.query);
  const { where, params } = await resolveListScope(request);
  const { programId } = request.params as any;
  if (programId) {
    await assertProgramAccess(userId, Number(programId));
    const result = await academyGroupService.listByProgram(Number(programId), { ...query, scopeWhere: where || undefined, scopeParams: params.length ? params : undefined });
    return reply.send(result);
  }
  const result = await academyGroupService.listAll({ ...query, scopeWhere: where || undefined, scopeParams: params.length ? params : undefined });
  return reply.send(result);
}

export async function getGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertGroupAccess(userId, Number(id));
  const group = await academyGroupService.getById(Number(id));
  return reply.send(group);
}

export async function createGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateGroupSchema.parse(request.body);
  await assertProgramAccess(userId, body.program_id);
  const group = await academyGroupService.create(body, userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.CREATE', entityType: 'academy_group',
    entityId: group.id!, afterState: { name: body.name, program_id: body.program_id, coach_id: body.coach_id ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(group);
}

export async function updateGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertGroupAccess(userId, Number(id));
  const body = UpdateGroupSchema.parse(request.body);
  const before = await academyGroupService.getById(Number(id));
  const group = await academyGroupService.update(Number(id), body, userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.UPDATE', entityType: 'academy_group',
    entityId: Number(id), beforeState: before ? { name: before.name, coach_id: before.coach_id } : null,
    afterState: body, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(group);
}

export async function assignCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertGroupAccess(userId, Number(id));
  const body = AssignCoachSchema.parse(request.body);
  const before = await academyGroupService.getById(Number(id));
  const { group, relation } = await academyGroupService.assignCoach(Number(id), body.coach_id, userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.ASSIGN_COACH', entityType: 'academy_group',
    entityId: Number(id), beforeState: before ? { coach_id: before.coach_id } : null,
    afterState: { coach_id: body.coach_id, relation: relation ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ ...group, coach_relation: relation });
}

export async function setCompensationHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertGroupAccess(userId, Number(id));
  const body = SetCompensationSchema.parse(request.body);
  const before = await academyGroupService.getById(Number(id));
  const group = await academyGroupService.setCompensation(Number(id), body, userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.SET_COMPENSATION', entityType: 'academy_group',
    entityId: Number(id), beforeState: before ? { comp_type: before.comp_type, comp_value: before.comp_value } : null,
    afterState: { comp_type: body.comp_type, comp_value: body.comp_value, comp_currency: body.comp_currency ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(group);
}

export async function archiveGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertGroupAccess(userId, Number(id));
  await academyGroupService.archive(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_GROUP.ARCHIVE', entityType: 'academy_group',
    entityId: Number(id), ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(204).send();
}

// â”€â”€ Enrollments â”€â”€

export async function listEnrollmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const query = ListEnrollmentsQuerySchema.parse(request.query);
  const { where, params } = await resolveListScope(request);
  const { programId } = request.params as any;
  if (programId) {
    await assertProgramAccess(userId, Number(programId));
    query.program_id = Number(programId);
  }
  const result = await academyEnrollmentService.list({ ...query, scopeWhere: where || undefined, scopeParams: params.length ? params : undefined });
  return reply.send(result);
}

export async function getEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const enrollment = await academyEnrollmentService.getById(Number(id));
  if (enrollment?.program_id) await assertProgramAccess(userId, Number(enrollment.program_id));
  return reply.send(enrollment);
}

export async function createEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateEnrollmentSchema.parse(request.body);
  await assertProgramAccess(userId, body.program_id);
  const enrollment = await academyEnrollmentService.enroll(body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.CREATE', entityType: 'academy_enrollment',
    entityId: enrollment.id!, afterState: { player_id: body.player_id, program_id: body.program_id, status: enrollment.status, waiting_order: enrollment.waiting_order ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(enrollment);
}

export async function cancelEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
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
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
  await academyEnrollmentService.complete(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.COMPLETE', entityType: 'academy_enrollment',
    entityId: Number(id), beforeState: before ? { status: before.status } : null,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Enrolment completed' });
}

export async function confirmEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
  await academyEnrollmentService.confirm(Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.CONFIRM', entityType: 'academy_enrollment',
    entityId: Number(id), beforeState: before ? { status: before.status } : null,
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Enrolment confirmed' });
}

export async function moveEnrollmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const before = await academyEnrollmentService.getById(Number(id));
  if (before?.program_id) await assertProgramAccess(userId, Number(before.program_id));
  const body = MoveEnrollmentSchema.parse(request.body);
  const enrollment = await academyEnrollmentService.moveToGroup(Number(id), body.group_id);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.MOVE', entityType: 'academy_enrollment',
    entityId: Number(id), beforeState: before ? { group_id: before.group_id } : null,
    afterState: { group_id: body.group_id },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(enrollment);
}

export async function getEnrollmentHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const enrollment = await academyEnrollmentService.getById(Number(id));
  if (enrollment?.program_id) await assertProgramAccess(userId, Number(enrollment.program_id));
  const history = await academyEnrollmentService.getHistory(Number(id));
  return reply.send(history);
}

// ── Group Sessions ──

/** G5 — object-level authorization for a session (resolved to its group → program). */
async function assertSessionAccess(actorId: number, sessionId: number): Promise<void> {
  const groupId = await academyAttendanceService.getSessionGroupId(sessionId);
  if (groupId == null) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
  await assertGroupAccess(actorId, groupId);
}

export async function listSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const query = ListSessionsQuerySchema.parse(request.query);
  const { where, params: scopeParams } = await resolveListScope(request);
  const { groupId } = request.params as any;
  if (groupId) await assertGroupAccess(userId, Number(groupId));
  if (query.group_id) await assertGroupAccess(userId, query.group_id);
  const result = await academySessionService.list({
    ...query,
    groupId: query.group_id,
    scopeWhere: where || undefined,
    scopeParams: scopeParams.length ? scopeParams : undefined,
  });
  return reply.send(result);
}

export async function createSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateGroupSessionSchema.parse(request.body);
  await assertGroupAccess(userId, body.group_id);
  const session = await academySessionService.create(body, userId);
  return reply.status(201).send(session);
}

export async function updateSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertSessionAccess(userId, Number(id));
  const body = UpdateGroupSessionSchema.parse(request.body);
  const session = await academySessionService.update(Number(id), body, userId);
  return reply.send(session);
}

// ── G5 — Session execution ──

export async function startSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertSessionAccess(userId, Number(id));
  StartSessionSchema.parse(request.body ?? {});
  const session = await academySessionService.start(Number(id), userId);
  return reply.send(session);
}

export async function completeSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertSessionAccess(userId, Number(id));
  CompleteSessionSchema.parse(request.body ?? {});
  const session = await academySessionService.complete(Number(id), userId);
  return reply.send(session);
}

export async function cancelSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertSessionAccess(userId, Number(id));
  const body = CancelSessionSchema.parse(request.body ?? {});
  const session = await academySessionService.cancel(Number(id), userId, body?.reason ?? null);
  return reply.send(session);
}

export async function getSessionRosterHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertSessionAccess(userId, Number(id));
  const roster = await academySessionService.getRoster(Number(id));
  return reply.send(roster);
}

// ── G2 — Recurring Schedules ──

async function assertScheduleAccess(actorId: number, scheduleId: number): Promise<void> {
  const schedule = await academyScheduleService.getById(scheduleId);
  const programId = await academyGroupService.resolveProgramId(Number(schedule.group_id));
  if (!programId) throw new NotFoundError('Academy group', ErrorCodes.ACADEMY_GROUP_NOT_FOUND);
  await assertProgramAccess(actorId, programId);
}

export async function listSchedulesHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListSchedulesQuerySchema.parse(request.query);
  const { where, params } = await resolveListScope(request);
  const result = await academyScheduleService.list({ ...query, scopeWhere: where || undefined, scopeParams: params.length ? params : undefined });
  return reply.send(result);
}

export async function listScheduleSessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { scheduleId } = request.params as any;
  await assertScheduleAccess(userId, Number(scheduleId));
  const query = ListScheduleSessionsQuerySchema.parse(request.query);
  const result = await academyScheduleService.listSessions({ ...query, scheduleId: Number(scheduleId) });
  return reply.send(result);
}

export async function getScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const schedule = await academyScheduleService.getById(Number(id));
  return reply.send(schedule);
}

export async function createScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateScheduleSchema.parse(request.body);
  const schedule = await academyScheduleService.create(body as any, userId);
  if (schedule) {
    recordAudit({
      actorId: userId, action: 'ACADEMY_SCHEDULE.CREATE', entityType: 'academy_schedule',
      entityId: Number(schedule.id), afterState: { group_id: body.group_id, weekdays: body.weekdays, start_date: body.start_date, end_date: body.end_date, preferred_court_id: body.preferred_court_id ?? null },
      ipAddress: request.ip, userAgent: getUserAgent(request),
    });
  }
  return reply.status(201).send(schedule);
}

export async function previewScheduleChangeHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const body = UpdateScheduleSchema.parse(request.body);
  const preview = await academyScheduleService.previewChange(Number(id), body as any, userId);
  return reply.send(preview);
}

export async function updateScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const body = UpdateScheduleSchema.parse(request.body);
  const before = await academyScheduleService.getById(Number(id));
  const result = await academyScheduleService.update(Number(id), body as any, userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_SCHEDULE.UPDATE', entityType: 'academy_schedule',
    entityId: Number(id), beforeState: before ? { start_date: before.start_date, end_date: before.end_date, weekdays: before.weekdays } : null,
    afterState: { ...body, affected: result.affected },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(result);
}

export async function regenerateScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const result = await academyScheduleService.regenerate(Number(id), userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_SCHEDULE.REGENERATE', entityType: 'academy_schedule',
    entityId: Number(id), afterState: { generated: result.generated }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(result);
}

export async function resyncScheduleHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const result = await academyScheduleService.resync(Number(id), userId);
  recordAudit({
    actorId: userId, action: 'ACADEMY_SCHEDULE.RESYNC', entityType: 'academy_schedule',
    entityId: Number(id), afterState: { resynced: result.resynced }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(result);
}

export async function setScheduleStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  await assertScheduleAccess(userId, Number(id));
  const body = ScheduleStatusSchema.parse(request.body);
  const schedule = await academyScheduleService.setStatus(Number(id), body.status, userId);
  recordAudit({
    actorId: userId, action: `ACADEMY_SCHEDULE.STATUS_${body.status.toUpperCase()}`, entityType: 'academy_schedule',
    entityId: Number(id), afterState: { status: body.status }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(schedule);
}

export async function resolveSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const body = ResolveSessionSchema.parse(request.body);
  const session = await academyScheduleService.getSession(Number(id));
  if (session?.schedule_id) await assertScheduleAccess(userId, Number(session.schedule_id));
  const resolved = await academyScheduleService.resolveSession(Number(id), body as any, userId);
  recordAudit({
    actorId: userId, action: `ACADEMY_SESSION.RESOLVE_${body.type.toUpperCase()}`, entityType: 'academy_group_session',
    entityId: Number(id), afterState: { type: body.type, alternative: body.alternative ?? null }, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send(resolved);
}

// â”€â”€ Attendance â”€â”€

export async function listAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListAttendanceQuerySchema.parse(request.query);
  const { where, params: scopeParams } = await resolveListScope(request);
  const { sessionId } = request.params as any;
  if (sessionId) query.group_session_id = Number(sessionId);
  const result = await academyAttendanceService.list({ ...query, scopeWhere: where || undefined, scopeParams: scopeParams.length ? scopeParams : undefined });
  return reply.send(result);
}

export async function recordAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = RecordAttendanceSchema.parse(request.body);
  const groupId = await academyAttendanceService.getSessionGroupId(body.group_session_id);
  if (groupId == null) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
  await assertGroupAccess(userId, groupId);
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
  const groupId = await academyAttendanceService.getSessionGroupId(Number(sessionId));
  if (groupId == null) throw new NotFoundError('Academy group session', ErrorCodes.ACADEMY_INVALID_SESSION);
  await assertGroupAccess(userId, groupId);
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
  const sessionId = await academyAttendanceService.getAttendanceSessionId(Number(id));
  if (sessionId) {
    const groupId = await academyAttendanceService.getSessionGroupId(sessionId);
    if (groupId != null) await assertGroupAccess(userId, groupId);
  }
  await academyAttendanceService.update(Number(id), body);
  recordAudit({
    actorId: userId, action: 'ACADEMY_ATTENDANCE.UPDATE', entityType: 'academy_attendance',
    entityId: Number(id), afterState: body, ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.send({ message: 'Attendance updated' });
}

export async function getSessionAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { sessionId } = request.params as any;
  const groupId = await academyAttendanceService.getSessionGroupId(Number(sessionId));
  if (groupId != null) await assertGroupAccess(userId, groupId);
  const rows = await academyAttendanceService.getBySession(Number(sessionId));
  const summary = await academyAttendanceService.getSummary(Number(sessionId));
  return reply.send({ data: rows, summary });
}

export async function listPublicProgramsHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await publicAcademyService.listPublished();
  return reply.send(result);
}

export async function getPublicProgramHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const program = await publicAcademyService.getPublished(Number(id));
  return reply.send(program);
}

export async function getMyEnrollmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const result = await publicAcademyService.myEnrollments(userId);
  return reply.send(result);
}

export async function getMySessionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const result = await publicAcademyService.mySessions(userId);
  return reply.send(result);
}

export async function getMyAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const result = await publicAcademyService.myAttendance(userId);
  return reply.send(result);
}

export async function publicEnrollHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const { id } = request.params as any;
  const result = await publicAcademyService.enroll(userId, Number(id));
  recordAudit({
    actorId: userId, action: 'ACADEMY_ENROLLMENT.PUBLIC_ENROLL', entityType: 'academy_enrollment',
    entityId: result.enrollment.id, afterState: { player_id: userId, program_id: result.enrollment.programId, status: result.status, waiting_order: result.enrollment.waitingOrder ?? null },
    ipAddress: request.ip, userAgent: getUserAgent(request),
  });
  return reply.status(201).send(result);
}