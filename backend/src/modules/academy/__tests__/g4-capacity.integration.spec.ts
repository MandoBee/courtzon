// ============================================================================
// Academy G4 — concurrency integration (real local Docker MySQL 3307)
//
// Validates the FOR UPDATE serialization on the academy_programs row:
//   * two concurrent enrollments with one remaining slot -> exactly one
//     confirmed and one waiting
//   * concurrent waitlist inserts -> distinct deterministic waiting_order
//   * concurrent promotions/replacements cannot exceed effective capacity
//
// Uses the shared dev DB (courtzon_v3) with uniquely-named rows and cleans up
// after itself (program delete cascades groups + enrollments; users deleted).
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

// Imported after env is set (getPool + services read env lazily).
import { academyEnrollmentService } from '../application/enrollment.service.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g4_${stamp}`;

let pool: mysql.Pool;
let userIds: number[] = [];
let programId = 0;
let groupId = 0;

function makeProgram(code: string, capacity: number) {
  return {
    code, name: `G4 Test ${code}`, description: null, category: 'tennis', level: null, season: null,
    capacity, original_capacity: capacity, price: 0, currency: 'USD', price_type: 'FIXED',
    status: 'open', is_public: 0, organisation_id: null, branch_id: null, sport_id: null,
  };
}

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

  const program = makeProgram(`${PREFIX}_prog_cap1`, 1);
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [program.code, program.name, program.description, program.category, program.level, program.season,
     program.capacity, program.original_capacity, program.price, program.currency, program.price_type,
     program.status, program.is_public, program.organisation_id, program.branch_id, program.sport_id],
  );
  programId = p.insertId;
  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 20, 'active')`,
    [programId, `${PREFIX}_group`],
  );
  groupId = g.insertId;
  for (let i = 1; i <= 6; i++) userIds.push(await createUser(i));
});

afterAll(async () => {
  try {
    if (programId) await pool.query('DELETE FROM academy_programs WHERE id = ?', [programId]);
    if (userIds.length) {
      await pool.query(`DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, userIds);
    }
  } finally {
    await closePool();
  }
});

describe('G4 concurrency — enroll serialization', () => {
  it('#19 two concurrent enrollments with one remaining slot -> exactly one confirmed + one waiting', async () => {
    const [a, b] = await Promise.all([
      academyEnrollmentService.enroll({ player_id: userIds[0], program_id: programId, group_id: groupId }),
      academyEnrollmentService.enroll({ player_id: userIds[1], program_id: programId, group_id: groupId }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(['confirmed', 'waiting']);
  });

  it('#10 concurrent waiting inserts receive distinct deterministic order', async () => {
    // Program already has 1 confirmed + 1 waiting; five more concurrent enrolls.
    const players = [userIds[2], userIds[3], userIds[4], userIds[5]];
    const results = await Promise.all(
      players.map((pid) => academyEnrollmentService.enroll({ player_id: pid, program_id: programId, group_id: groupId })),
    );
    const waiting = results.filter((r: any) => r.status === 'waiting');
    expect(waiting.length).toBe(4);
    const orders = waiting.map((w: any) => w.waiting_order).sort((x: number, y: number) => x - y);
    expect(new Set(orders).size).toBe(4); // all distinct
    expect(orders[0]).toBeGreaterThan(0);
  });
});

describe('G4 concurrency — promotion cannot exceed effective capacity', () => {
  it('#20 concurrent authorized replacements cannot exceed capacity', async () => {
    // Fresh program with capacity 1 and two pre-seeded waiting enrollments.
    const prog = makeProgram(`${PREFIX}_prog_cap1b`, 1);
    const [p] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO academy_programs
         (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prog.code, prog.name, prog.description, prog.category, prog.level, prog.season,
       prog.capacity, prog.original_capacity, prog.price, prog.currency, prog.price_type,
       prog.status, prog.is_public, prog.organisation_id, prog.branch_id, prog.sport_id],
    );
    const pid2 = p.insertId;
    const [g] = await pool.query<mysql.ResultSetHeader>(
      'INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, 20, \'active\')',
      [pid2, `${PREFIX}_group2`],
    );
    const gid2 = g.insertId;

    try {
      const [u1] = await Promise.all([createUser(101)]);
      const [u2] = await Promise.all([createUser(102)]);
      await pool.query(
        `INSERT INTO academy_enrollments (player_id, program_id, group_id, status, waiting_order)
         VALUES (?, ?, ?, 'waiting', 1), (?, ?, ?, 'waiting', 2)`,
        [u1, pid2, gid2, u2, pid2, gid2],
      );
      const [wRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT id FROM academy_enrollments WHERE program_id = ? AND status='waiting' ORDER BY waiting_order", [pid2],
      );
      const wIds = (wRows as any[]).map((r) => Number(r.id));
      expect(wIds.length).toBe(2);

      // Two DIFFERENT waitlist rows replaced concurrently (both skip FIFO via
      // the authorized replace path) against capacity 1 -> exactly one succeeds,
      // the other must fail with ACADEMY_CAPACITY_EXCEEDED.
      const outcomes = await Promise.allSettled([
        academyEnrollmentService.replace(wIds[0], 9, 'concurrent-1'),
        academyEnrollmentService.replace(wIds[1], 9, 'concurrent-2'),
      ]);

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err?.code ?? err?.errorCode ?? '').toBe('ACADEMY_CAPACITY_EXCEEDED');

      const [[counts]] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT SUM(status='confirmed') AS confirmed, SUM(status='waiting') AS waiting FROM academy_enrollments WHERE program_id = ?",
        [pid2],
      );
      expect(Number(counts.confirmed)).toBe(1);
      expect(Number(counts.waiting)).toBe(1);
    } finally {
      await pool.query('DELETE FROM academy_programs WHERE id = ?', [pid2]);
    }
  });
});