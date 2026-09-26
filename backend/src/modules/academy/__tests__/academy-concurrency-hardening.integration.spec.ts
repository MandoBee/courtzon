// ============================================================================
// Academy Group 2 — concurrency & atomicity hardening (integration, real local
// Docker MySQL, courtzon_v3)
//
// Covers exactly the three hardened areas with REAL SQL — no repository mocks:
//   • coach assignment race      → conditional UPDATE (une lock + expected coach)
//   • attendance write race      → ER_DUP_ENTRY mapped to ACADEMY_ATTENDANCE_EXISTS
//   • recurring regeneration     → transaction + schedule-row FOR UPDATE
//                                   (single-writer gate, atomic, idempotent)
//
// Matrix (TEST A–H from the Group 2 spec):
//   A. concurrent coach assignment — exactly one winner
//   B. assignment after lock — blocked
//   C. concurrent duplicate attendance — one row, deterministic Academy error
//   D. attendance status-window guard unchanged
//   E. concurrent regeneration — idempotent, no duplicate sessions
//   F. regeneration rollback — no partial generated set survives a failure
//   G. repeated regeneration — idempotent, generation_ref unique
//   H. conflict/court-hold regression — engine semantics unchanged
//
// Unique rows are created and cleaned up after the run.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../../database/mysql.js';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);

// Imported after env is set (services read env lazily).
import { academyGroupService } from '../application/group.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';
import { academyScheduleService } from '../application/academy-schedule.service.js';
import { academyScheduleRepository } from '../infrastructure/repositories/academy-schedule.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g2c_${stamp}`;
const TZ = 'Africa/Cairo';

let pool: mysql.Pool;

// Owner/actor with organisation access (org owner).
let actorId = 0;
let orgId = 0;
let branchId = 0;

// Coaches.
let coachA = 0;
let coachB = 0;

// Coach groups.
let groupCoachA = 0;
let groupCoachB = 0;

// Attendance group + session.
let attGroup = 0;
let attSessionLive = 0;
let attSessionScheduled = 0;
let attEnrollment = 0;

// Schedule groups + schedules + courts.
let schedProgram = 0;
let courtE = 0;
let courtH = 0;
let gE = 0; let sE = 0;
let gF = 0; let sF = 0;
let gG = 0; let sG = 0;
let gH = 0; let sH = 0;

const created = {
  users: [] as number[],
  orgs: [] as number[],
  branches: [] as number[],
  resources: [] as number[],
  programs: [] as number[],
  coaches: [] as number[],
  enrollments: [] as number[],
};

function codeOf(err: any): string {
  return err?.code ?? err?.errorCode ?? '';
}

// Handy date helpers (UTC, mirrors the service's dailyRange).
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

async function createUser(phoneStem: string, name: string): Promise<number> {
  const phone = `${PREFIX}${phoneStem}`;
  const [res] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (UUID(), (SELECT id FROM countries LIMIT 1), ?, ?, ?, 'x', ?, 'male')`,
    [phone, `+20${phone}`, `${PREFIX}_${name}@courtzon.test`, name],
  );
  created.users.push(res.insertId);
  return res.insertId;
}

async function createOrg(name: string): Promise<number> {
  const [ot] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM organisation_types LIMIT 1');
  const [o] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (UUID(), ?, ?, ?, ?, 1)`,
    [(ot as any[])[0].id, actorId, name, `${PREFIX}_${name}`],
  );
  created.orgs.push(o.insertId);
  return o.insertId;
}

async function createBranch(oid: number): Promise<number> {
  const [b] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, ?, ?, ?)`,
    [oid, `${PREFIX}_branch`, `${PREFIX}-branch`, TZ],
  );
  created.branches.push(b.insertId);
  return b.insertId;
}

async function createCoach(userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO coach_profiles (user_id, status) VALUES (?, 'approved')`,
    [userId],
  );
  created.coaches.push(userId);
}

async function createResource(branch: number): Promise<number> {
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
     VALUES (UUID(), ?, (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
    [`${PREFIX}_court_${randomUUID().slice(0, 6)}`, branch],
  );
  created.resources.push(r.insertId);
  return r.insertId;
}

async function createProgram(oid: number | null, bid: number | null): Promise<number> {
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
     VALUES (?, ?, NULL, 'tennis', NULL, NULL, 10, 10, 0, 'USD', 'FIXED', 'open', 0, ?, ?, (SELECT id FROM sports LIMIT 1), 'setup')`,
    [`${PREFIX}_prog_${randomUUID().slice(0, 6)}`, `${PREFIX} prog`, oid, bid],
  );
  created.programs.push(p.insertId);
  return p.insertId;
}

async function createGroup(pid: number, name: string): Promise<number> {
  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, 'active')`,
    [pid, name],
  );
  return g.insertId;
}

async function createSchedule(group: number, court: number, startDate: string, endDate: string, weekdays = 'mon,tue,wed,thu,fri,sat,sun'): Promise<number> {
  const [s] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_schedules
       (group_id, name, weekdays, start_date, end_date, local_start_time, local_end_time, timezone, branch_id, preferred_court_id, pending_priority_minutes, status, created_by)
     VALUES (?, ?, ?, ?, ?, '10:00', '11:00', ?, ?, ?, 1440, 'active', ?)`,
    [group, `${PREFIX}_sched`, weekdays, startDate, endDate, TZ, branchId, court, actorId],
  );
  return s.insertId;
}

async function countRecurring(scheduleId: number): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM academy_group_sessions WHERE schedule_id = ? AND source_type = 'recurring'",
    [scheduleId],
  );
  return Number((rows[0] as any).c);
}

async function sessionRows(scheduleId: number): Promise<any[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date, reservation_status, generation_ref, DATE_FORMAT(original_session_date, '%Y-%m-%d') AS original_session_date, original_start_time, original_end_time, original_court_id, pending_expires_at, conflict_metadata FROM academy_group_sessions WHERE schedule_id = ? AND source_type = 'recurring'",
    [scheduleId],
  );
  return rows as any[];
}

beforeAll(async () => {
  pool = getPool();

  actorId = await createUser('900', 'G2 Owner');
  orgId = await createOrg('G2 Org');
  branchId = await createBranch(orgId);

  coachA = await createUser('911', 'G2 Coach A');
  coachB = await createUser('912', 'G2 Coach B');
  await createCoach(coachA);
  await createCoach(coachB);

  // ── Coach assignment groups (program under an organisation, lifecycle setup) ──
  const pCoach = await createProgram(orgId, branchId);
  groupCoachA = await createGroup(pCoach, `${PREFIX}_coach_a`);
  groupCoachB = await createGroup(pCoach, `${PREFIX}_coach_b`);

  // ── Attendance group (program scoped to nothing — attendance has no tenancy gate) ──
  const pAtt = await createProgram(null, null);
  attGroup = await createGroup(pAtt, `${PREFIX}_att`);
  const attPlayer = await createUser('921', 'G2 Att Player');
  const [enr] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`,
    [attPlayer, pAtt, attGroup],
  );
  attEnrollment = enr.insertId;
  created.enrollments.push(attEnrollment);
  const [sLive] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status) VALUES (?, '2099-01-01', '10:00', '11:00', 'in_progress')`,
    [attGroup],
  );
  attSessionLive = sLive.insertId;
  const [sSched] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status) VALUES (?, '2099-01-02', '10:00', '11:00', 'scheduled')`,
    [attGroup],
  );
  attSessionScheduled = sSched.insertId;

  // ── Regeneration groups + schedules (independent schedules per test) ──
  schedProgram = await createProgram(orgId, branchId);
  courtE = await createResource(branchId);
  courtH = await createResource(branchId);
  const start = daysFromNow(8);
  const end = daysFromNow(10); // 3 calendar days, all weekdays

  gE = await createGroup(schedProgram, `${PREFIX}_e`);
  sE = await createSchedule(gE, courtE, start, end);
  gF = await createGroup(schedProgram, `${PREFIX}_f`);
  sF = await createSchedule(gF, courtE, start, end);
  gG = await createGroup(schedProgram, `${PREFIX}_g`);
  sG = await createSchedule(gG, courtE, start, end);

  // TEST H — two-day window on a dedicated court with a pre-seeded manual hold.
  gH = await createGroup(schedProgram, `${PREFIX}_h`);
  sH = await createSchedule(gH, courtH, start, daysFromNow(9));
  await pool.query(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, court_id, status, reservation_status)
     VALUES (?, ?, '10:00', '11:00', ?, 'scheduled', 'resolved')`,
    [gH, start, courtH],
  );
});

afterAll(async () => {
  try {
    // Programme delete cascades groups → schedules → sessions → attendance.
    // Enrollments are deleted first (explicit, FK-robust), then resources,
    // coach profiles, branches, organisations and users (orgs before users so
    // the org-owner FK releases cleanly).
    if (created.enrollments.length) {
      await pool.query(`DELETE FROM academy_enrollments WHERE id IN (${created.enrollments.map(() => '?').join(',')})`, created.enrollments);
    }
    if (created.programs.length) {
      await pool.query(`DELETE FROM academy_programs WHERE id IN (${created.programs.map(() => '?').join(',')})`, created.programs);
    }
    if (created.resources.length) {
      await pool.query(`DELETE FROM resources WHERE id IN (${created.resources.map(() => '?').join(',')})`, created.resources);
    }
    if (created.coaches.length) {
      await pool.query(`DELETE FROM coach_profiles WHERE user_id IN (${created.coaches.map(() => '?').join(',')})`, created.coaches);
    }
    if (created.branches.length) {
      await pool.query(`DELETE FROM branches WHERE id IN (${created.branches.map(() => '?').join(',')})`, created.branches);
    }
    if (created.orgs.length) {
      await pool.query(`DELETE FROM organisations WHERE id IN (${created.orgs.map(() => '?').join(',')})`, created.orgs);
    }
    if (created.users.length) {
      await pool.query(`DELETE FROM users WHERE id IN (${created.users.map(() => '?').join(',')})`, created.users);
    }
  } finally {
    await closePool();
  }
});

beforeEach(() => {
  audit.recordAudit.mockClear();
});

describe('TEST A/B — coach assignment race', () => {
  it('A: two concurrent assignments → exactly one winner, loser gets a deterministic conflict', async () => {
    const outcomes = await Promise.allSettled([
      academyGroupService.assignCoach(groupCoachA, coachA, actorId),
      academyGroupService.assignCoach(groupCoachA, coachB, actorId),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(codeOf(rejected[0].reason)).toBe('ACADEMY_INVALID_TRANSITION');

    const [[row]] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT coach_id, coach_locked_at FROM academy_groups WHERE id = ?', [groupCoachA],
    );
    const finalCoach = Number((row as any).coach_id);
    expect([coachA, coachB]).toContain(finalCoach);
    expect((row as any).coach_locked_at).toBeFalsy();
    // The winner (fulfilled) is exactly the coach that persisted.
    const won = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(Number(won.group.coach_id)).toBe(finalCoach);
  });

  it('B: assignment after coach lock remains blocked', async () => {
    await groupRepository.confirmLock(groupCoachB, actorId);
    await expect(academyGroupService.assignCoach(groupCoachB, coachA, actorId))
      .rejects.toMatchObject({ code: 'ACADEMY_COACH_LOCKED' });
    const [[row]] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT coach_id FROM academy_groups WHERE id = ?', [groupCoachB],
    );
    expect((row as any).coach_id ?? null).toBeNull();
  });
});

describe('TEST C/D — attendance concurrency + window', () => {
  it('C: concurrent duplicate attendance → exactly one row, deterministic Academy error', async () => {
    const outcomes = await Promise.allSettled([
      academyAttendanceService.record({ group_session_id: attSessionLive, enrollment_id: attEnrollment, attendance_status: 'present' }),
      academyAttendanceService.record({ group_session_id: attSessionLive, enrollment_id: attEnrollment, attendance_status: 'present' }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(codeOf(rejected[0].reason)).toBe('ACADEMY_ATTENDANCE_EXISTS');

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS c FROM academy_attendance WHERE group_session_id = ? AND enrollment_id = ?',
      [attSessionLive, attEnrollment],
    );
    expect(Number((rows[0] as any).c)).toBe(1);
  });

  it('C2: bulk attendance skips the concurrent duplicate deterministically', async () => {
    const r = await academyAttendanceService.recordBulk(attSessionLive, [
      { enrollment_id: attEnrollment, attendance_status: 'present' }, // already recorded (C)
      { enrollment_id: attEnrollment, attendance_status: 'late' },   // duplicate too
    ]);
    expect(r.created).toBe(0);
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS c FROM academy_attendance WHERE group_session_id = ? AND enrollment_id = ?',
      [attSessionLive, attEnrollment],
    );
    expect(Number((rows[0] as any).c)).toBe(1); // still exactly one row
  });

  it('D: recording outside in_progress stays rejected (window guard unchanged)', async () => {
    await expect(
      academyAttendanceService.record({ group_session_id: attSessionScheduled, enrollment_id: attEnrollment, attendance_status: 'present' }),
    ).rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });
});

describe('TEST E/F/G/H — regeneration transaction, idempotency and conflict regression', () => {
  it('G: sequential regeneration is idempotent with unique generation_ref', async () => {
    const first = await academyScheduleService.regenerate(sG, actorId);
    expect(first.generated).toBe(3);
    const second = await academyScheduleService.regenerate(sG, actorId);
    expect(second.generated).toBe(0);

    expect(await countRecurring(sG)).toBe(3);
    const rows = await sessionRows(sG);
    const refs = rows.map((r) => r.generation_ref);
    expect(new Set(refs).size).toBe(3);
    for (const r of rows) {
      expect(String(r.original_session_date)).toBe(String(r.session_date));
      expect(String(r.original_court_id)).toBe(String(courtE));
    }
  });

  it('E: concurrent regeneration of the same schedule → idempotent, no duplicate sessions, no ER_DUP_ENTRY', async () => {
    const outcomes = await Promise.allSettled([
      academyScheduleService.regenerate(sE, actorId),
      academyScheduleService.regenerate(sE, actorId),
    ]);

    // Both complete (the loser re-reads the committed sessions and skips).
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.map((r) => codeOf(r.reason))).toEqual([]);
    expect(fulfilled.length).toBe(2);

    const generatedSums = fulfilled.reduce(
      (acc, f) => acc + Number((f as PromiseFulfilledResult<any>).value.generated), 0,
    );
    expect(generatedSums).toBe(3); // generated once in total, never duplicated

    expect(await countRecurring(sE)).toBe(3);
    const refs = (await sessionRows(sE)).map((r) => r.generation_ref);
    expect(new Set(refs).size).toBe(3);
  });

  it('F: a mid-generation failure rolls the whole regeneration back', async () => {
    const realInsert = academyScheduleRepository.insertSession.bind(academyScheduleRepository);
    let calls = 0;
    const spy = vi.spyOn(academyScheduleRepository, 'insertSession').mockImplementation(async (input: any, conn?: any) => {
      calls += 1;
      if (calls === 2) {
        const e: any = new Error('forced mid-generation failure');
        e.code = 'G2_TEST_FORCED';
        throw e;
      }
      return realInsert(input, conn);
    });

    await expect(academyScheduleService.regenerate(sF, actorId)).rejects.toThrow(/forced mid-generation failure/);
    spy.mockRestore();

    // The successfully-inserted first session must have been rolled back.
    expect(await countRecurring(sF)).toBe(0);
    const [[remaining]] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS c FROM academy_group_sessions WHERE schedule_id = ?', [sF],
    );
    expect(Number((remaining as any).c)).toBe(0);
  });

  it('H: conflict/court-hold regression — engine behavior unchanged under the transaction', async () => {
    const r = await academyScheduleService.regenerate(sH, actorId);
    expect(r.generated).toBe(2);

    const rows = await sessionRows(sH);
    expect(rows.length).toBe(2);

    // First date collides with the pre-seeded resolved manual hold →
    // deterministic CONFLICT (conflict_metadata + no pending expiry).
    const conflicted = rows.find((row) => row.session_date === daysFromNow(8));
    expect(conflicted).toBeTruthy();
    expect(conflicted.reservation_status).toBe('conflict');
    expect(conflicted.conflict_metadata).toBeTruthy();
    expect(conflicted.pending_expires_at).toBeFalsy();

    // Second date is vacant → pending_court hold with an expiry.
    const held = rows.find((row) => row.session_date === daysFromNow(9));
    expect(held).toBeTruthy();
    expect(held.reservation_status).toBe('pending_court');
    expect(held.pending_expires_at).toBeTruthy();
    expect(held.conflict_metadata).toBeFalsy();
  });
});