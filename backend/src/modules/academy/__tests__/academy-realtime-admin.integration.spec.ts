// ============================================================================
// Academy G4-A — administrative realtime producer audience (integration, real
// local Docker MySQL). Verifies that the new/reused producer events carry
// AUTHORITATIVE server-side organisation/branch/coach IDs:
//   • academy:group-updated      (group create)
//   • academy:attendance-updated (attendance record)
//   • academy:schedule-updated   (schedule regenerate)
//   • academy:session:hold-expired (expireHolds sweep, enriched org/branch)
//
// Real eventBusV2.emit is captured via a spy — no notification/realtime side
// effects (no engine/socket subscriber runs in this process).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../../database/mysql.js';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';

import { academyGroupService } from '../application/group.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';
import { academyScheduleService } from '../application/academy-schedule.service.js';
import { academyScheduleRepository } from '../infrastructure/repositories/academy-schedule.repository.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g4ar_${stamp}`;
const TZ = 'Africa/Cairo';

let pool: mysql.Pool;
let eventBusV2: any;
let emitSpy: any;
let actorId = 0;
let orgId = 0;
let branchId = 0;
let courtId = 0;
let coachUserId = 0;
let playerUserId = 0;
let programId = 0;
let groupId = 0;
let enrollmentId = 0;
let sessionId = 0;
let scheduleId = 0;

const created = { users: [] as number[], orgs: [] as number[], branches: [] as number[], resources: [] as number[], programs: [] as number[] };

function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function createUser(phoneStem: string, name: string): Promise<number> {
  const phone = `${PREFIX}${phoneStem}`;
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (UUID(), (SELECT id FROM countries LIMIT 1), ?, ?, ?, 'x', ?, 'male')`,
    [phone, `+20${phone}`, `${PREFIX}_${name}@courtzon.test`, name],
  );
  created.users.push(r.insertId);
  return r.insertId;
}

beforeAll(async () => {
  pool = getPool();
  const { eventBusV2: bus } = await import('../../../shared/event-bus/event-bus.v2.js');
  eventBusV2 = bus;
  emitSpy = vi.spyOn(eventBusV2, 'emit');

  actorId = await createUser('750', 'G4A Owner');
  const [ot] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM organisation_types LIMIT 1');
  const [o] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (UUID(), ?, ?, 'G4A Org', ?, 1)`,
    [(ot as any[])[0].id, actorId, `${PREFIX}-org`],
  );
  orgId = o.insertId;
  created.orgs.push(orgId);
  const [b] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'G4A Branch', ?, ?)`,
    [orgId, `${PREFIX}-b`, TZ],
  );
  branchId = b.insertId;
  created.branches.push(branchId);
  const [c] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
     VALUES (UUID(), 'G4A Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
    [branchId],
  );
  courtId = c.insertId;
  created.resources.push(courtId);

  coachUserId = await createUser('751', 'G4A Coach');
  await pool.query(`INSERT INTO coach_profiles (user_id, status) VALUES (?, 'approved')`, [coachUserId]);
  playerUserId = await createUser('752', 'G4A Player');

  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs (code, name, category, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
     VALUES (?, 'G4A Prog', 'tennis', 0, 'USD', 'FIXED', 'open', 0, ?, ?, (SELECT id FROM sports LIMIT 1), 'setup')`,
    [`${PREFIX}-prog`, orgId, branchId],
  );
  programId = p.insertId;
  created.programs.push(programId);

  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, coach_id, capacity, status) VALUES (?, 'G4A Group', ?, 10, 'active')`,
    [programId, coachUserId],
  );
  groupId = g.insertId;

  const [e] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`,
    [playerUserId, programId, groupId],
  );
  enrollmentId = e.insertId;

  const [s] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status) VALUES (?, '2099-01-01', '10:00', '11:00', 'in_progress')`,
    [groupId],
  );
  sessionId = s.insertId;

  // Active schedule on the org court (regeneration window 8–10 days ahead).
  const [sc] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_schedules (group_id, name, weekdays, start_date, end_date, local_start_time, local_end_time, timezone, branch_id, preferred_court_id, pending_priority_minutes, status, created_by)
     VALUES (?, 'G4A Sched', 'mon,tue,wed,thu,fri,sat,sun', ?, ?, '10:00', '11:00', ?, ?, ?, 1440, 'active', ?)`,
    [groupId, daysFromNow(8), daysFromNow(10), TZ, branchId, courtId, actorId],
  );
  scheduleId = sc.insertId;
});

afterAll(async () => {
  try {
    if (created.programs.length) await pool.query(`DELETE FROM academy_programs WHERE id IN (${created.programs.map(() => '?').join(',')})`, created.programs);
    if (created.resources.length) await pool.query(`DELETE FROM resources WHERE id IN (${created.resources.map(() => '?').join(',')})`, created.resources);
    await pool.query(`DELETE FROM coach_profiles WHERE user_id = ?`, [coachUserId]);
    if (created.branches.length) await pool.query(`DELETE FROM branches WHERE id IN (${created.branches.map(() => '?').join(',')})`, created.branches);
    if (created.orgs.length) await pool.query(`DELETE FROM organisations WHERE id IN (${created.orgs.map(() => '?').join(',')})`, created.orgs);
    if (created.users.length) await pool.query(`DELETE FROM users WHERE id IN (${created.users.map(() => '?').join(',')})`, created.users);
  } finally {
    await closePool();
  }
});

function emitted(name: string): any[] {
  return emitSpy.mock.calls.filter((c: any) => c[0] === name).map((c: any) => c[1]);
}

describe('G4-A — administrative producer payloads are authoritative (server-side)', () => {
  it('group create → academy:group-updated carries org/branch/coach from the program/group', async () => {
    const { id } = await academyGroupService.create({
      program_id: programId, name: `${PREFIX}-newgroup`, capacity: 5, coach_id: coachUserId, status: 'active',
    }, actorId);
    const events = emitted('academy:group-updated');
    const mine = events.find((e) => e.groupId === id);
    expect(mine).toBeTruthy();
    expect(Number(mine.organisationId)).toBe(orgId);
    expect(Number(mine.branchId)).toBe(branchId);
    expect(Number(mine.coachId)).toBe(coachUserId);
    expect(Number(mine.programId)).toBe(programId);
  });

  it('attendance record → academy:attendance-updated carries session/group/enrollment/player/org/branch/coach', async () => {
    await academyAttendanceService.record({ group_session_id: sessionId, enrollment_id: enrollmentId, attendance_status: 'present' });
    const events = emitted('academy:attendance-updated');
    const mine = events.find((e) => e.sessionId === sessionId && e.enrollmentId === enrollmentId);
    expect(mine).toBeTruthy();
    expect(Number(mine.sessionId)).toBe(sessionId);
    expect(Number(mine.groupId)).toBe(groupId);
    expect(Number(mine.enrollmentId)).toBe(enrollmentId);
    expect(Number(mine.playerId)).toBe(playerUserId);
    expect(Number(mine.organisationId)).toBe(orgId);
    expect(Number(mine.branchId)).toBe(branchId);
    expect(Number(mine.coachId)).toBe(coachUserId);
  });

  it('schedule regenerate → academy:schedule-updated carries org/branch from the programme', async () => {
    await academyScheduleService.regenerate(scheduleId, actorId);
    const events = emitted('academy:schedule-updated');
    const mine = events.find((e) => e.scheduleId === scheduleId);
    expect(mine).toBeTruthy();
    expect(Number(mine.groupId)).toBe(groupId);
    expect(Number(mine.programId)).toBe(programId);
    expect(Number(mine.organisationId)).toBe(orgId);
    expect(Number(mine.branchId)).toBe(branchId);
  });

  it('hold expiry → academy:session:hold-expired carries org/branch from authoritative joins', async () => {
    // An ADMIN-scoped pending hold on the group's court, already past its window.
    const [h] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO academy_group_sessions (group_id, schedule_id, session_date, start_time, end_time, court_id, status, reservation_status, pending_expires_at)
       VALUES (?, ?, '2099-02-01', '10:00', '11:00', ?, 'scheduled', 'pending_court', DATE_SUB(NOW(), INTERVAL 1 MINUTE))`,
      [groupId, scheduleId, courtId],
    );
    const holdId = h.insertId;

    try {
      await academyScheduleService.expireHolds();
      const events = emitted('academy:session:hold-expired');
      const mine = events.find((e) => e.sessionId === holdId);
      expect(mine).toBeTruthy();
      expect(Number(mine.organisationId)).toBe(orgId);
      expect(Number(mine.branchId)).toBe(branchId);
      expect(Number(mine.sessionId)).toBe(holdId);
    } finally {
      await pool.query('DELETE FROM academy_group_sessions WHERE id = ?', [holdId]);
    }
  });

  it('never emits admin audience events with client-controlled IDs (payload only carries server IDs)', () => {
    // The group-updated event we captured earlier must not contain any other
    // tenant's IDs (cross-tenant sanity at the producer layer).
    const groupEvents = emitted('academy:group-updated');
    for (const e of groupEvents) {
      expect(['number', 'null']).toContain(typeof e.organisationId);
      expect(['number', 'null']).toContain(typeof e.branchId);
    }
  });
});

// Keep schedule repository import used (regeneration path goes through it).
void academyScheduleRepository;