// ============================================================================
// Academy G3 — Confirmation Lifecycle
// ============================================================================
// Readiness + atomic confirmation of an Academy program. On confirm the engine:
//   1. Serializes on the program row (FOR UPDATE) and re-verifies object scope.
//   2. Re-runs the full readiness gate against locked rows and throws a 409
//      (ACADEMY_NOT_READY) with granular blockers when not ready.
//   3. Finalizes every future recurring session to `confirmed`, snapshotting:
//      • confirmed_at / confirmed_by
//      • court price via PricingEngine (hourly + peak) at confirmation time
//      • district DST detail (`dst_gap` / `dst_ambiguous`) first requires an
//        admin time resolution (blocker UNRESOLVED_DST)
//   4. Locks every non-archived schedule (locked_at / locked_by) and locks each
//      group's coach + compensation (coach_locked_at / coach_locked_by), making
//      the program immutable until a future lifecycle step.
//   5. Acknowledges offline/manual payments (markPaymentConfirmed) — a business
//      acknowledgement ONLY. No wallet, ledger, or settlement transactions are
//      created (explicit scope decision).
// ============================================================================

import { createHash } from 'node:crypto';
import { getPool } from '../../../database/mysql.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { academyScheduleRepository } from '../infrastructure/repositories/academy-schedule.repository.js';
import { assertCanManageAcademy, isApprovedCoach, resolveProgramScope } from './academy-scope.js';
import { effectiveCapacity } from '../domain/capacity.js';
import type { AcademyProgramAttributes, AcademyEnrollmentAttributes } from '../domain/academy.types.js';
import type { AcademySchedule, AcademyGroupSession, AcademyReservationStatus } from '../domain/academy-schedule.types.js';

type RowData = import('mysql2').RowDataPacket[];
type PoolConnection = import('mysql2/promise').PoolConnection;

export type AcademyConfirmationBlockerCode =
  | 'ALREADY_CONFIRMED'
  | 'MISSING_SCHEDULE'
  | 'MISSING_COACH'
  | 'INVALID_COACH'
  | 'MISSING_COMPENSATION'
  | 'MISSING_COURT'
  | 'UNRESOLVED_COURT_CONFLICT'
  | 'UNRESOLVED_DST'
  | 'UNRESOLVED_PENDING_HOLD'
  | 'UNPAID_ENROLLMENT'
  | 'BELOW_MINIMUM'
  | 'ABOVE_MAXIMUM'
  | 'CONCURRENT_MODIFICATION';

export interface AcademyConfirmationBlocker {
  code: AcademyConfirmationBlockerCode;
  entity?: 'academy_group' | 'academy_schedule' | 'academy_group_session' | 'academy_enrollment' | 'academy_program' | 'resource';
  entityId?: number;
  entityName?: string | null;
  detail?: string;
  /** Capacity blockers that the admin may override on confirm (with a reason). */
  overridable?: boolean;
}

export interface AcademyConfirmationStats {
  activeGroups: number;
  schedules: number;
  futureSessions: number;
  finalizableSessions: number;
  confirmedEnrollments: number;
  unpaidEnrollments: number;
  capacity: number;
  minEnrollments: number;
  price: number;
  currency: string;
}

export interface AcademyConfirmationReadiness {
  programId: number;
  programName: string;
  lifecycleState: string;
  ready: boolean;
  blockers: AcademyConfirmationBlocker[];
  snapshotToken: string;
  stats: AcademyConfirmationStats;
}

export interface ConfirmAcademyProgramInput {
  expectedSnapshotToken?: string | null;
  overrideBelowMin?: boolean;
  overrideAboveMax?: boolean;
  reason?: string | null;
}

export interface ConfirmAcademyProgramResult {
  confirmed: boolean;
  programId: number;
  lifecycleState: 'confirmed';
  finalizedSessions: number;
  lockedSchedules: number;
  lockedGroups: number;
}

const OVERRIDABLE = new Set<AcademyConfirmationBlockerCode>(['BELOW_MINIMUM', 'ABOVE_MAXIMUM']);

/** Snapshot payload fragment for a group (coach + compensation dimensions). */
function groupSnapshotFragment(g: any) {
  return {
    id: g.id,
    coach_id: g.coach_id ?? null,
    coach_locked_at: g.coach_locked_at ?? null,
    comp_type: g.comp_type ?? null,
    comp_value: g.comp_value ?? null,
    comp_currency: g.comp_currency ?? null,
    updated_at: g.updated_at ?? null,
  };
}

/** Snapshot payload fragment for a schedule (court + temporal dimensions). */
function scheduleSnapshotFragment(s: any) {
  return {
    id: s.id,
    preferred_court_id: s.preferred_court_id ?? null,
    weekdays: Array.isArray(s.weekdays) ? s.weekdays : (s.weekdays ? (typeof s.weekdays === 'string' ? JSON.parse(s.weekdays) : s.weekdays) : []),
    start_date: s.start_date ?? null,
    end_date: s.end_date ?? null,
    local_start_time: s.local_start_time ?? null,
    local_end_time: s.local_end_time ?? null,
    timezone: s.timezone ?? null,
    status: s.status ?? null,
    locked_at: s.locked_at ?? null,
    updated_at: s.updated_at ?? null,
  };
}

/**
 * Deterministic SHA-1 fingerprint of everything that confirmation freezes:
 * program lifecycle, group coach/compensation, schedule court/temporal config.
 * The confirmation modal sends this token back; any change → the confirm is
 * rejected with CONCURRENT_MODIFICATION (re-fetch the readiness first).
 */
export function computeSnapshotToken(
  program: AcademyProgramAttributes,
  groups: any[],
  schedules: any[],
): string {
  const payload = {
    program: {
      lifecycle_state: program.lifecycle_state,
      confirmed_at: program.confirmed_at ?? null,
      confirmed_by: program.confirmed_by ?? null,
      updated_at: program.updated_at ?? null,
    },
    groups: (groups ?? [])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(groupSnapshotFragment),
    schedules: (schedules ?? [])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map(scheduleSnapshotFragment),
  };
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

function nowUtcIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Active (non-deleted, is_active) resource lookup for a set of courts. */
async function activeCourtMap(courtIds: number[]): Promise<Map<number, { branch_id: number | null }>> {
  const map = new Map<number, { branch_id: number | null }>();
  const ids = [...new Set(courtIds.filter((id) => id != null && Number(id) > 0))];
  if (!ids.length) return map;
  const [rows] = await getPool().query<RowData>(
    `SELECT id, branch_id, is_active, deleted_at FROM resources
     WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  for (const r of rows as any[]) {
    if (Number(r.is_active) === 1 && r.deleted_at == null) {
      map.set(Number(r.id), { branch_id: r.branch_id == null ? null : Number(r.branch_id) });
    }
  }
  return map;
}

async function loadConfirmedEnrollments(programId: number, conn?: PoolConnection): Promise<AcademyEnrollmentAttributes[]> {
  const db = conn ?? getPool();
  const [rows] = await db.query<RowData>(
    `SELECT e.*, u.full_name AS player_name
     FROM academy_enrollments e
     LEFT JOIN users u ON u.id = e.player_id
     WHERE e.program_id = ? AND e.status = 'confirmed'
     ORDER BY e.id ASC${conn ? ' FOR UPDATE' : ''}`,
    [programId],
  );
  return rows as AcademyEnrollmentAttributes[];
}

async function loadNonArchivedGroups(programId: number, conn?: PoolConnection): Promise<any[]> {
  const db = conn ?? getPool();
  const [rows] = await db.query<RowData>(
    `SELECT g.*, u.full_name AS coach_name
     FROM academy_groups g
     LEFT JOIN users u ON u.id = g.coach_id
     WHERE g.program_id = ? AND g.status != 'archived'
     ORDER BY g.id ASC${conn ? ' FOR UPDATE' : ''}`,
    [programId],
  );
  return rows as any[];
}

interface BlockersContext {
  program: AcademyProgramAttributes;
  groups: any[];
  schedules: AcademySchedule[];
  sessions: AcademyGroupSession[];
  enrollments: AcademyEnrollmentAttributes[];
  courtMap: Map<number, { branch_id: number | null }>;
}

/** Compute the full readiness gate. Capacity blockers carry `overridable`. */
export async function computeBlockers(ctx: BlockersContext): Promise<AcademyConfirmationBlocker[]> {
  const blockers: AcademyConfirmationBlocker[] = [];

  if (ctx.program.lifecycle_state === 'confirmed') {
    blockers.push({ code: 'ALREADY_CONFIRMED', entity: 'academy_program', entityId: Number(ctx.program.id) });
  }

  const schedules = ctx.schedules.filter((s) => s.status !== 'archived');
  if (!schedules.length) {
    blockers.push({ code: 'MISSING_SCHEDULE', entity: 'academy_program', entityId: Number(ctx.program.id) });
  }

  for (const group of ctx.groups) {
    if (group.status !== 'active') continue;
    const coachId = group.coach_id == null ? null : Number(group.coach_id);
    if (!coachId) {
      blockers.push({ code: 'MISSING_COACH', entity: 'academy_group', entityId: Number(group.id), entityName: group.name ?? null, detail: 'no coach assigned' });
      continue;
    }
    if (!(await isApprovedCoach(coachId))) {
      blockers.push({ code: 'INVALID_COACH', entity: 'academy_group', entityId: Number(group.id), entityName: group.name ?? null, detail: `coach ${coachId} is not an approved coach profile` });
    }
    const compType = group.comp_type ?? null;
    if (compType == null || compType === '' || compType === 'NONE' || compType === 'none') {
      blockers.push({ code: 'MISSING_COMPENSATION', entity: 'academy_group', entityId: Number(group.id), entityName: group.name ?? null, detail: 'compensation type not configured' });
    }
  }

  for (const schedule of schedules) {
    const courtId = schedule.preferred_court_id == null ? null : Number(schedule.preferred_court_id);
    if ((schedule.status === 'active' || schedule.status === 'paused') && !courtId) {
      blockers.push({ code: 'MISSING_COURT', entity: 'academy_schedule', entityId: Number(schedule.id), entityName: schedule.name ?? null, detail: 'no preferred court set' });
      continue;
    }
    if (courtId && !ctx.courtMap.has(courtId)) {
      blockers.push({ code: 'MISSING_COURT', entity: 'academy_schedule', entityId: Number(schedule.id), entityName: schedule.name ?? null, detail: `preferred court ${courtId} is not active` });
    }
  }

  for (const session of ctx.sessions) {
    const status = session.reservation_status;
    if (status === 'confirmed') continue;
    if (!session.court_id) {
      blockers.push({
        code: 'MISSING_COURT', entity: 'academy_group_session', entityId: Number(session.id),
        detail: `session ${session.session_date} ${session.start_time} has no court assigned`,
      });
      continue;
    }
    if (status === 'conflict') {
      const reason = session.conflict_metadata?.reason;
      if (reason === 'dst_gap' || reason === 'dst_ambiguous') {
        blockers.push({
          code: 'UNRESOLVED_DST', entity: 'academy_group_session', entityId: Number(session.id),
          entityName: session.group_name ?? null, detail: `session ${session.session_date} ${session.start_time} falls in a DST ${reason === 'dst_gap' ? 'gap' : 'overlap'} — resolve the time first`,
        });
      } else {
        blockers.push({
          code: 'UNRESOLVED_COURT_CONFLICT', entity: 'academy_group_session', entityId: Number(session.id),
          entityName: session.group_name ?? null, detail: `session ${session.session_date} ${session.start_time} still conflicts${reason ? ` (${reason})` : ''}`,
        });
      }
      continue;
    }
    if (status === 'pending_expired') {
      blockers.push({
        code: 'UNRESOLVED_PENDING_HOLD', entity: 'academy_group_session', entityId: Number(session.id),
        entityName: session.group_name ?? null, detail: `session ${session.session_date} ${session.start_time} has an expired pending hold awaiting a decision`,
      });
    }
  }

  const confirmedCount = ctx.enrollments.length;
  const requiresPayment = Number(ctx.program.price ?? 0) > 0;
  if (requiresPayment) {
    const unpaid = ctx.enrollments.filter((e) => !e.payment_confirmed_at);
    for (const e of unpaid) {
      blockers.push({
        code: 'UNPAID_ENROLLMENT', entity: 'academy_enrollment', entityId: Number(e.id),
        entityName: (e as any).player_name ?? null, detail: 'confirmed enrollment payment not yet acknowledged',
      });
    }
  }

  const min = 1;
  if (confirmedCount < min) {
    blockers.push({ code: 'BELOW_MINIMUM', overridable: true, entity: 'academy_program', entityId: Number(ctx.program.id), detail: `only ${confirmedCount} confirmed enrollment(s) — minimum is ${min}` });
  }
  // G4: use the EFFECTIVE maximum (original_capacity + active override), not the
  // stored capacity which is the immutable baseline.
  const max = effectiveCapacity(ctx.program);
  if (max > 0 && confirmedCount > max) {
    blockers.push({ code: 'ABOVE_MAXIMUM', overridable: true, entity: 'academy_program', entityId: Number(ctx.program.id), detail: `${confirmedCount} confirmed enrollment(s) exceed capacity ${max}` });
  }

  return blockers;
}

function statsFrom(context: Omit<BlockersContext, 'courtMap'> & { courtMap: BlockersContext['courtMap'] }): AcademyConfirmationStats {
  const finalizable = context.sessions.filter(
    (s) => s.reservation_status !== null && s.reservation_status !== 'confirmed' && s.court_id,
  ).length;
  return {
    activeGroups: context.groups.filter((g) => g.status === 'active').length,
    schedules: context.schedules.filter((s) => s.status !== 'archived').length,
    futureSessions: context.sessions.length,
    finalizableSessions: finalizable,
    confirmedEnrollments: context.enrollments.length,
    unpaidEnrollments: context.enrollments.filter((e) => !e.payment_confirmed_at && Number(context.program.price ?? 0) > 0).length,
    capacity: effectiveCapacity(context.program),
    minEnrollments: 1,
    price: Number(context.program.price ?? 0),
    currency: context.program.currency ?? 'USD',
  };
}

export class AcademyConfirmationService {
  async readiness(programId: number, actorId: number): Promise<AcademyConfirmationReadiness> {
    const scope = await resolveProgramScope(programId);
    await assertCanManageAcademy(actorId, scope);
    const program = await programRepository.getById(programId);
    if (!program) throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);

    const [groups, schedules, sessions, enrollments] = await Promise.all([
      loadNonArchivedGroups(programId),
      academyScheduleRepository.listSchedulesByProgram(programId),
      academyScheduleRepository.listFutureSessionsForProgram(programId),
      loadConfirmedEnrollments(programId),
    ]);

    const courtIds = [
      ...schedules.map((s) => s.preferred_court_id),
      ...sessions.map((s) => s.court_id),
    ].filter((id) => id != null) as number[];
    const courtMap = await activeCourtMap(courtIds);

    const blockers = await computeBlockers({ program, groups, schedules, sessions, enrollments, courtMap });

    return {
      programId,
      programName: program.name ?? '',
      lifecycleState: program.lifecycle_state ?? 'setup',
      ready: blockers.length === 0,
      blockers,
      snapshotToken: computeSnapshotToken(program, groups, schedules),
      stats: statsFrom({ program, groups, schedules, sessions, enrollments, courtMap }),
    };
  }

  async confirm(programId: number, actorId: number, input: ConfirmAcademyProgramInput = {}): Promise<ConfirmAcademyProgramResult> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const program = await programRepository.getByIdForUpdate(programId, conn);
      if (!program) {
        await conn.rollback();
        throw new NotFoundError('Academy program', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
      }
      if (program.lifecycle_state === 'confirmed') {
        await conn.rollback();
        throw new ConflictError('Academy program is already confirmed', ErrorCodes.ACADEMY_LIFECYCLE_LOCKED);
      }

      const scope = {
        programId,
        organisationId: program.organisation_id == null ? null : Number(program.organisation_id),
        branchId: program.branch_id == null ? null : Number(program.branch_id),
        sportId: program.sport_id == null ? null : Number(program.sport_id),
        lifecycleState: program.lifecycle_state ?? 'setup',
      };
      await assertCanManageAcademy(actorId, scope);

      const useOverride = Boolean(input.overrideBelowMin) || Boolean(input.overrideAboveMax);
      if (useOverride && !input.reason?.trim()) {
        await conn.rollback();
        throw new ConflictError('reason is required when overriding capacity blockers', ErrorCodes.ACADEMY_INVALID_SCOPE);
      }

      const groups = await loadNonArchivedGroups(programId, conn);
      const scheduleIds = await academyScheduleRepository.lockScheduleIdsForProgram(programId, conn);
      const sessionIds = await academyScheduleRepository.lockSessionIdsForProgram(programId, conn);
      const sessionIdSet = new Set(sessionIds.map(Number));
      const [schedules, sessionsRaw, enrollments] = await Promise.all([
        academyScheduleRepository.listSchedulesByProgram(programId),
        academyScheduleRepository.listFutureSessionsForProgram(programId),
        loadConfirmedEnrollments(programId, conn),
      ]);
      const sessions = sessionsRaw.filter((s) => sessionIdSet.has(Number(s.id)));

      const currentToken = computeSnapshotToken(program, groups, schedules);
      if (input.expectedSnapshotToken && input.expectedSnapshotToken !== currentToken) {
        await conn.rollback();
        throw new ConflictError(
          'Academy program changed after the confirmation screen was loaded. Refresh and confirm again.',
          ErrorCodes.ACADEMY_NOT_READY,
          { code: 'ACADEMY_NOT_READY', blockers: [{ code: 'CONCURRENT_MODIFICATION' } as AcademyConfirmationBlocker] },
        );
      }

      const courtIds = [
        ...schedules.map((s) => s.preferred_court_id),
        ...sessions.map((s) => s.court_id),
      ].filter((id) => id != null) as number[];
      const courtMap = await activeCourtMap(courtIds);

      const allBlockers = await computeBlockers({ program, groups, schedules, sessions, enrollments, courtMap });
      let blockers = allBlockers;
      if (input.overrideBelowMin) blockers = blockers.filter((b) => b.code !== 'BELOW_MINIMUM');
      if (input.overrideAboveMax) blockers = blockers.filter((b) => b.code !== 'ABOVE_MAXIMUM');

      if (blockers.length) {
        await conn.rollback();
        throw new ConflictError('Academy program is not ready for confirmation', ErrorCodes.ACADEMY_NOT_READY, {
          code: 'ACADEMY_NOT_READY',
          blockers,
        });
      }

      const finalizable = sessions.filter(
        (s) => s.reservation_status !== null && s.reservation_status !== 'confirmed',
      );

      // Serialize on every court in a deterministic order to prevent cross-program
      // deadlocks (each court row is the aggregate serialization point).
      const courtIdsToLock = [...new Set(finalizable.map((s) => Number(s.court_id)).filter(Boolean))].sort((a, b) => a - b);
      for (const courtId of courtIdsToLock) {
        await bookingRepository.lockResource(courtId, conn);
      }

      const now = nowUtcIso();
      let finalizedCount = 0;
      const priceFailures: number[] = [];
      for (const session of finalizable) {
        const courtId = Number(session.court_id);
        if (!courtId) continue;
        const ok = await bookingRepository.checkSlotAvailability(
          courtId,
          session.session_date,
          [{ start: session.start_time, end: session.end_time }],
          conn,
          { excludeAcademySessionId: session.id },
        );
        if (!ok) {
          await conn.rollback();
          throw new ConflictError(
            'A player booking occupied a session court during confirmation',
            ErrorCodes.ACADEMY_NOT_READY,
            {
              code: 'ACADEMY_NOT_READY',
              blockers: [{
                code: 'UNRESOLVED_COURT_CONFLICT',
                entity: 'academy_group_session',
                entityId: session.id,
                detail: 'court_occupied_during_confirmation',
              } as AcademyConfirmationBlocker],
            },
          );
        }
        let price: { totalPrice: number };
        try {
          price = await pricingEngine.calculatePrice(courtId, session.start_time, session.end_time);
        } catch {
          priceFailures.push(session.id);
          price = { totalPrice: 0 };
        }
        await academyScheduleRepository.updateSessionG2(session.id, {
          reservation_status: 'confirmed',
          confirmed_at: now,
          confirmed_by: actorId,
          pending_expires_at: null,
          pending_resolved_at: now,
          pending_resolved_by: actorId,
          court_price_amount: price.totalPrice,
          court_price_currency: program.currency ?? 'USD',
          court_price_snapshot_at: now,
        }, conn);
        finalizedCount += 1;
      }

      for (const scheduleId of scheduleIds) {
        await academyScheduleRepository.lockSchedule(Number(scheduleId), actorId, conn);
      }
      for (const group of groups) {
        await groupRepository.confirmLock(Number(group.id), actorId, conn);
      }
      await programRepository.confirm(programId, actorId, conn);

      await conn.commit();

      await recordAudit({
        actorId,
        action: 'ACADEMY_PROGRAM.CONFIRMED',
        entityType: 'academy_program',
        entityId: programId,
        beforeState: { lifecycle_state: 'setup' },
        afterState: {
          lifecycle_state: 'confirmed',
          finalized_sessions: finalizedCount,
          locked_schedules: scheduleIds.length,
          locked_groups: groups.length,
          pricing_failures: priceFailures.length ? priceFailures : undefined,
          override_below_min: Boolean(input.overrideBelowMin),
          override_above_max: Boolean(input.overrideAboveMax),
          reason: input.reason ?? null,
        },
        ipAddress: undefined,
        userAgent: undefined,
      });

      return {
        confirmed: true,
        programId,
        lifecycleState: 'confirmed',
        finalizedSessions: finalizedCount,
        lockedSchedules: scheduleIds.length,
        lockedGroups: groups.length,
      };
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        /* connection already released/rolled back */
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async markPaymentConfirmed(enrollmentId: number, actorId: number): Promise<{ id: number; payment_confirmed_at: string }> {
    const enrollment = await enrollmentRepository.getById(enrollmentId);
    if (!enrollment) throw new NotFoundError('Academy enrollment', ErrorCodes.ACADEMY_ENROLLMENT_NOT_FOUND);
    if (enrollment.status !== 'confirmed') {
      throw new ConflictError('Only confirmed enrollments can be payment-acknowledged', ErrorCodes.ACADEMY_INVALID_TRANSITION);
    }
    if (enrollment.payment_confirmed_at) {
      throw new ConflictError('Enrollment payment is already acknowledged', ErrorCodes.ACADEMY_ENROLLMENT_ALREADY_PAID);
    }
    const scope = await resolveProgramScope(Number(enrollment.program_id));
    await assertCanManageAcademy(actorId, scope);

    const acknowledged = await enrollmentRepository.markPaymentConfirmed(enrollmentId, actorId);
    if (!acknowledged) throw new ConflictError('Enrollment payment acknowledged but update affected no rows', ErrorCodes.ACADEMY_ENROLLMENT_ALREADY_PAID);

    const now = nowUtcIso();
    await recordAudit({
      actorId,
      action: 'ACADEMY_ENROLLMENT.PAYMENT_CONFIRMED',
      entityType: 'academy_enrollment',
      entityId: enrollmentId,
      beforeState: { payment_confirmed_at: null, status: enrollment.status },
      afterState: { payment_confirmed_at: now, payment_confirmed_by: actorId },
      ipAddress: undefined,
      userAgent: undefined,
    });

    return { id: enrollmentId, payment_confirmed_at: now };
  }
}

export const academyConfirmationService = new AcademyConfirmationService();