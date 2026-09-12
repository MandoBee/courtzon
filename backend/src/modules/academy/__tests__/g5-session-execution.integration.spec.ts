// ============================================================================
// Academy G5 — session execution + attendance (integration, real local MySQL)
//
// Validates concurrency-safe lifecycle transitions (exactly one winner), the
// attendance window, group-membership integrity, and roster correctness against
// the shared dev DB (courtzon_v3). Unique rows are created and cleaned up.
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

const audit = vi.hoisted(() => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../audit-log/index.js', () => audit);
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../notifications/application/scheduler.service.js', () => ({ scheduleAcademySessionReminder: vi.fn(async () => undefined) }));

import { academySessionService } from '../application/session.service.js';
import { academyAttendanceService } from '../application/attendance.service.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g5_${stamp}`;

let pool: mysql.Pool;
let programId = 0;
let group1 = 0;
let group2 = 0;
let session1 = 0;
let session2 = 0;
let p1 = 0;
let p2 = 0;
let p3 = 0;

async function createUser(i: number): Promise<number> {
  const phone = `${stamp}${String(i).padStart(2, '0')}`;
  const [res] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
    [randomUUID(), phone, `+20${phone}`, `${PREFIX}_${i}@test.com`, `Player ${i}`],
  );
  return res.insertId;
}

beforeAll(async () => {
  pool = getPool();
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
     VALUES (?, ?, ?, ?, ?, ?, 5, 5, 0, 'USD', 'FIXED', 'open', 0, NULL, NULL, NULL)`,
    [`${PREFIX}_prog`, `G5 Prog ${PREFIX}`, null, 'tennis', null, null],
  );
  programId = p.insertId;
  const [g1] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, 'active')`,
    [programId, `${PREFIX}_g1`],
  );
  group1 = g1.insertId;
  const [g2] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, 'active')`,
    [programId, `${PREFIX}_g2`],
  );
  group2 = g2.insertId;

  p1 = await createUser(1);
  p2 = await createUser(2);
  p3 = await createUser(3);

  await pool.query(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status) VALUES (?, ?, ?, 'confirmed'), (?, ?, ?, 'confirmed'), (?, ?, ?, 'confirmed')`,
    [p1, programId, group1, p2, programId, group1, p3, programId, group2],
  );

  const [s1] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status)
     VALUES (?, '2099-01-01', '10:00', '11:00', 'scheduled')`,
    [group1],
  );
  session1 = s1.insertId;
  const [s2] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status)
     VALUES (?, '2099-01-02', '10:00', '11:00', 'scheduled')`,
    [group1],
  );
  session2 = s2.insertId;
});

afterAll(async () => {
  try {
    if (programId) await pool.query('DELETE FROM academy_programs WHERE id = ?', [programId]);
    await pool.query(`DELETE FROM users WHERE id IN (?, ?, ?)`, [p1, p2, p3]);
  } finally {
    await closePool();
  }
});

async function sessionStatus(id: number): Promise<string> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT status FROM academy_group_sessions WHERE id = ?', [id]);
  return (rows[0] as any).status;
}

describe('G5 integration — concurrency-safe lifecycle', () => {
  it('#8 concurrent start -> exactly one winner, loser gets ALREADY_TRANSITIONED', async () => {
    const outcomes = await Promise.allSettled([
      academySessionService.start(session1, 9),
      academySessionService.start(session1, 9),
    ]);
    const ok = outcomes.filter((o) => o.status === 'fulfilled');
    const bad = outcomes.filter((o) => o.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
    const err = (bad[0] as PromiseRejectedResult).reason;
    expect(err?.code ?? err?.errorCode ?? '').toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
    expect(await sessionStatus(session1)).toBe('in_progress');
  });

  it('#9 concurrent complete -> exactly one winner', async () => {
    const outcomes = await Promise.allSettled([
      academySessionService.complete(session1, 9),
      academySessionService.complete(session1, 9),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled').length).toBe(1);
    const bad = outcomes.filter((o) => o.status === 'rejected');
    expect((bad[0] as PromiseRejectedResult).reason?.code ?? (bad[0] as PromiseRejectedResult).reason?.errorCode ?? '').toBe('ACADEMY_SESSION_ALREADY_TRANSITIONED');
    expect(await sessionStatus(session1)).toBe('completed');
  });
});

describe('G5 integration — attendance window + integrity', () => {
  it('#19 scheduled attendance rejected', async () => {
    await expect(academyAttendanceService.record({ group_session_id: session2, enrollment_id: p1, attendance_status: 'present' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#18 in_progress attendance works for a confirmed group member', async () => {
    await academySessionService.start(session2, 9);
    const [enrollRows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT id FROM academy_enrollments WHERE group_id = ? AND player_id = ?", [group1, p1],
    );
    const enrollmentId = Number((enrollRows[0] as any).id);
    const r = await academyAttendanceService.record({ group_session_id: session2, enrollment_id: enrollmentId, attendance_status: 'present' });
    expect(r.id).toBeTruthy();
  });

  it('#22 cross-group enrollment rejected', async () => {
    const [enrollRows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT id FROM academy_enrollments WHERE group_id = ? AND player_id = ?", [group2, p3],
    );
    const otherGroupEnrollmentId = Number((enrollRows[0] as any).id);
    await expect(academyAttendanceService.record({ group_session_id: session2, enrollment_id: otherGroupEnrollmentId, attendance_status: 'absent' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_GROUP_MISMATCH' });
  });

  it('#20 completed attendance modification rejected', async () => {
    await academySessionService.complete(session2, 9);
    const [attRows] = await pool.query<mysql.RowDataPacket[]>(
      'SELECT id FROM academy_attendance WHERE group_session_id = ? LIMIT 1', [session2],
    );
    const attId = Number((attRows[0] as any).id);
    await expect(academyAttendanceService.update(attId, { attendance_status: 'absent' }))
      .rejects.toMatchObject({ code: 'ACADEMY_ATTENDANCE_WINDOW' });
  });

  it('#15/#16/#17 roster contains only confirmed members of the session group', async () => {
    const roster = await academySessionService.getRoster(session2);
    const playerIds = roster.data.map((r: any) => r.player_id);
    expect(playerIds).toContain(p1);
    expect(playerIds).toContain(p2);
    expect(playerIds).not.toContain(p3); // group2 member excluded
    expect(roster.data).toHaveLength(2);
  });

  it('#26/#27 summary reflects marked + unmarked', async () => {
    const summary = await academySessionService.getSummary(session2);
    expect(summary.total).toBe(2);
    expect(summary.present).toBe(1);
    expect(summary.unmarked).toBe(1);
    expect(summary.status).toBe('completed');
  });
});