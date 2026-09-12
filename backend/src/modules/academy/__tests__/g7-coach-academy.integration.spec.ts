// ============================================================================
// Academy G7 — coach-facing integration (real local MySQL)
//
// Validates: coach scope (group.coach_id = authenticated user), coach A cannot
// touch coach B's sessions/groups, approved-coach gate, coach lifecycle single-
// winner, cross-group attendance rejection, and coach attendance window.
// Unique rows + cleanup.
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

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../notifications/application/scheduler.service.js', () => ({ scheduleAcademySessionReminder: vi.fn(async () => undefined) }));

import { coachAcademyService } from '../application/coach-academy.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g7_${stamp}`;

let pool: mysql.Pool;
let progA = 0;
let progB = 0;
let groupA = 0;
let groupB = 0;
let sessionA = 0;
let sessionB = 0;
let sessionC = 0;
let coachA = 0;
let coachB = 0;
let player = 0;
let enrA = 0;
let enrB = 0;

async function createUser(i: number): Promise<number> {
  const phone = `${stamp}${String(i).padStart(2, '0')}`;
  const [res] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
    [randomUUID(), phone, `+20${phone}`, `${PREFIX}_${i}@test.com`, `User ${i}`],
  );
  return res.insertId;
}

async function approveCoach(userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
    [userId],
  );
}

async function insertProgram(code: string): Promise<number> {
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
     VALUES (?, ?, NULL, 'tennis', NULL, NULL, 5, 5, 0, 'USD', 'FIXED', 'open', 1, NULL, NULL, NULL)`,
    [code, `Prog ${code}`],
  );
  return p.insertId;
}

beforeAll(async () => {
  pool = getPool();
  progA = await insertProgram(`${PREFIX}_pa`);
  progB = await insertProgram(`${PREFIX}_pb`);

  const [ga] = await pool.query<mysql.ResultSetHeader>(
    'INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, \'active\')', [progA, `${PREFIX}_ga`],
  );
  groupA = ga.insertId;
  const [gb] = await pool.query<mysql.ResultSetHeader>(
    'INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, \'active\')', [progB, `${PREFIX}_gb`],
  );
  groupB = gb.insertId;

  coachA = await createUser(1);
  coachB = await createUser(2);
  player = await createUser(3);
  await approveCoach(coachA);
  await approveCoach(coachB);

  await pool.query('UPDATE academy_groups SET coach_id = ? WHERE id = ?', [coachA, groupA]);
  await pool.query('UPDATE academy_groups SET coach_id = ? WHERE id = ?', [coachB, groupB]);

  const [sa] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status)
     VALUES (?, '2099-01-01', '10:00', '11:00', 'scheduled')`, [groupA],
  );
  sessionA = sa.insertId;
  const [sb] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status)
     VALUES (?, '2099-01-02', '10:00', '11:00', 'scheduled')`, [groupB],
  );
  sessionB = sb.insertId;
  const [sc] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status)
     VALUES (?, '2099-01-03', '10:00', '11:00', 'scheduled')`, [groupA],
  );
  sessionC = sc.insertId;

  const [ea] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`, [player, progA, groupA],
  );
  enrA = ea.insertId;
  const [eb] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed')`, [player, progB, groupB],
  );
  enrB = eb.insertId;
});

afterAll(async () => {
  try {
    await pool.query('DELETE FROM academy_programs WHERE id IN (?, ?)', [progA, progB]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [coachA, coachB, player]);
  } finally {
    await closePool();
  }
});

async function statusOf(id: number): Promise<string> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT status FROM academy_group_sessions WHERE id = ?', [id]);
  return (rows[0] as any).status;
}

describe('G7 integration — coach scope + IDOR', () => {
  it('#1/#4 assigned coach lists only own sessions; coach A never sees group B', async () => {
    const sessions = await coachAcademyService.listMySessions(coachA);
    const ids = sessions.map((s: any) => s.id);
    expect(ids).toContain(sessionA);
    expect(ids).not.toContain(sessionB);
  });

  it('#3/#4 coach A cannot view coach B\'s session (non-revealing)', async () => {
    await expect(coachAcademyService.getMySession(coachA, sessionB)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
    const s = await coachAcademyService.getMySession(coachA, sessionA);
    expect(Number(s.id)).toBe(sessionA);
  });

  it('#6 non-approved player denied', async () => {
    await expect(coachAcademyService.listMySessions(player)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
  });

  it('#23 coach starts own session; other coach cannot', async () => {
    await coachAcademyService.start(coachA, sessionA);
    expect(await statusOf(sessionA)).toBe('in_progress');
    await expect(coachAcademyService.start(coachB, sessionA)).rejects.toMatchObject({ code: 'ACADEMY_INVALID_SESSION' });
  });

  it('#30 concurrent coach start has exactly one winner', async () => {
    const outcomes = await Promise.allSettled([
      coachAcademyService.start(coachA, sessionC),
      coachAcademyService.start(coachA, sessionC),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1);
    expect((outcomes.filter((o) => o.status === 'rejected')[0] as PromiseRejectedResult).reason?.code)
      .toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
  });
});

describe('G7 integration — coach attendance', () => {
  it('#15/#16/#19 coach marks own-group attendance in_progress; cross-group + window blocked', async () => {
    // sessionA is in_progress (started above).
    const r = await coachAcademyService.markAttendance(coachA, { group_session_id: sessionA, enrollment_id: enrA, attendance_status: 'present' });
    expect(r.id).toBeTruthy();

    // cross-group enrollment (group B) on group A session -> group mismatch.
    await expect(coachAcademyService.markAttendance(coachA, { group_session_id: sessionA, enrollment_id: enrB }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_GROUP_MISMATCH' });

    // sessionB is still scheduled -> window.
    await expect(coachAcademyService.markAttendance(coachB, { group_session_id: sessionB, enrollment_id: enrB }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('roster for coach A excludes group B members', async () => {
    const roster = await coachAcademyService.getRoster(coachA, sessionA);
    expect(roster.data.map((r: any) => r.enrollment_id)).toEqual([enrA]);
    expect(roster.summary.total).toBe(1);
  });

  it('#17 completed attendance locked', async () => {
    await coachAcademyService.complete(coachA, sessionA);
    expect(await statusOf(sessionA)).toBe('completed');
    const [attRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT id FROM academy_attendance WHERE group_session_id = ? LIMIT 1', [sessionA],
    );
    const attId = Number((attRows[0] as any).id);
    await expect(academyAttendanceService.update(attId, { attendance_status: 'absent' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });
});