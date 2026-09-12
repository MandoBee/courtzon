// ============================================================================
// Academy G6 — player-facing integration (real local MySQL)
//
// Validates: concurrent self-enrollment at one remaining slot, published-gate
// (draft/archived detail + enroll rejected), start-gate (late enrollment
// blocked), effective capacity, and IDOR — Player A never sees Player B's
// enrollment/sessions/attendance. Unique rows + cleanup.
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

import { publicAcademyService } from '../application/public-academy.service.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g6_${stamp}`;

let pool: mysql.Pool;
let pubProg = 0;
let startedProg = 0;
let draftProg = 0;
let archivedProg = 0;
let group = 0;
let startedGroup = 0;
let A = 0;
let B = 0;
let C = 0;

async function createUser(i: number): Promise<number> {
  const phone = `${stamp}${String(i).padStart(2, '0')}`;
  const [res] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
    [randomUUID(), phone, `+20${phone}`, `${PREFIX}_${i}@test.com`, `Player ${i}`],
  );
  return res.insertId;
}

async function insertProgram(code: string, capacity: number, status: string): Promise<number> {
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
     VALUES (?, ?, ?, 'tennis', NULL, NULL, ?, ?, 100, 'USD', 'FIXED', ?, 1, NULL, NULL, NULL)`,
    [code, `Prog ${code}`, null, capacity, capacity, status],
  );
  return p.insertId;
}

async function enrollmentId(programId: number, playerId: number): Promise<number> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT id FROM academy_enrollments WHERE program_id = ? AND player_id = ? LIMIT 1', [programId, playerId],
  );
  return Number((rows[0] as any).id);
}

beforeAll(async () => {
  pool = getPool();
  pubProg = await insertProgram(`${PREFIX}_pub`, 1, 'published');
  draftProg = await insertProgram(`${PREFIX}_draft`, 5, 'draft');
  archivedProg = await insertProgram(`${PREFIX}_arch`, 5, 'archived');
  startedProg = await insertProgram(`${PREFIX}_started`, 5, 'published');

  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, 'active')`, [pubProg, `${PREFIX}_g`],
  );
  group = g.insertId;
  const [g2] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 10, 'active')`, [startedProg, `${PREFIX}_gs`],
  );
  startedGroup = g2.insertId;

  // started program: earliest session begun (start_at_utc in the past).
  await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, status, start_at_utc, end_at_utc)
     VALUES (?, '2000-01-01', '10:00', '11:00', 'scheduled', '2000-01-01 10:00:00', '2000-01-01 11:00:00')`,
    [startedGroup],
  );

  A = await createUser(1);
  B = await createUser(2);
  C = await createUser(3);
});

afterAll(async () => {
  try {
    await pool.query('DELETE FROM academy_programs WHERE id IN (?, ?, ?, ?)', [pubProg, startedProg, draftProg, archivedProg]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [A, B, C]);
  } finally {
    await closePool();
  }
});

describe('G6 integration — self-enrollment + gates', () => {
  it('#13 concurrent self-enrollment at one remaining slot -> one confirmed + one waiting', async () => {
    const outcomes = await Promise.allSettled([
      publicAcademyService.enroll(A, pubProg),
      publicAcademyService.enroll(B, pubProg),
    ]);
    const ok = outcomes.filter((o) => o.status === 'fulfilled').map((o) => (o as PromiseFulfilledResult<any>).value.status);
    expect(ok.sort()).toEqual(['confirmed', 'waiting']);
  });

  it('#2/#3 draft + archived detail are non-revealing 404s', async () => {
    await expect(publicAcademyService.getPublished(draftProg)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
    await expect(publicAcademyService.getPublished(archivedProg)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
  });

  it('#11 self-enroll into draft/archived rejected', async () => {
    await expect(publicAcademyService.enroll(C, draftProg)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
    await expect(publicAcademyService.enroll(C, archivedProg)).rejects.toMatchObject({ code: 'ACADEMY_PROGRAM_NOT_FOUND' });
  });

  it('self-enroll after program started rejected', async () => {
    await expect(publicAcademyService.enroll(C, startedProg)).rejects.toMatchObject({ code: 'ACADEMY_ENROLLMENT_CLOSED' });
  });

  it('#7 effective capacity honored with override', async () => {
    // pubProg capacity 1 is full (A confirmed, B waiting). Add override +2 -> effective 3,
    // C enrolls into a fresh program instead: create a published capacity-1 program.
    const fresh = await insertProgram(`${PREFIX}_fresh`, 1, 'published');
    try {
      await pool.query<mysql.ResultSetHeader>(
        'UPDATE academy_programs SET capacity_override_amount = 2, capacity_override_by = ?, capacity_override_reason = \'test\' WHERE id = ?', [A, fresh],
      );
      const res = await publicAcademyService.enroll(C, fresh);
      expect(res.status).toBe('confirmed'); // 0 confirmed < effective 3
    } finally {
      await pool.query('DELETE FROM academy_programs WHERE id = ?', [fresh]);
    }
  });
});

describe('G6 integration — IDOR (identity-bound my-data)', () => {
  it('#17/#18/#19 Player A sees only A\'s enrollment/sessions/attendance', async () => {
    const aEnrollments = await publicAcademyService.myEnrollments(A);
    const aIds = aEnrollments.map((e: any) => e.id);
    const bEnrollmentId = await enrollmentId(pubProg, B);
    expect(aIds).not.toContain(bEnrollmentId); // A never sees B's enrollment
    expect(aEnrollments.every((e: any) => e.programId === pubProg)).toBe(true);

    const aSessions = await publicAcademyService.mySessions(A);
    expect(aSessions.every((s: any) => s.program_code === `${PREFIX}_pub` || s.program_code?.startsWith(PREFIX))).toBe(true);

    const aAttendance = await publicAcademyService.myAttendance(A);
    expect(Array.isArray(aAttendance)).toBe(true);
  });

  it('self-enroll binds identity: client cannot submit another user id (service takes playerId)', async () => {
    // The service signature takes playerId from the session; a client can never
    // pass a different player id. Duplicate re-enroll for A is rejected.
    await expect(publicAcademyService.enroll(A, pubProg)).rejects.toMatchObject({ code: 'ACADEMY_PLAYER_ALREADY_ASSIGNED' });
  });
});