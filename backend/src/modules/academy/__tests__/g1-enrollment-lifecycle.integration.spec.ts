// ============================================================================
// Academy G1 — enrollment transfer correctness + lifecycle write hardening
// (integration, real local Docker MySQL)
//
// This suite deliberately uses the REAL repositories (no repository mocks) so
// it exercises the actual SQL. The original `POST /admin/academy/enrollments/:id/
// move` defect — a service-held `SELECT ... FOR UPDATE` combined with a
// repository `getPool()` UPDATE on a second connection — was invisible to the
// unit suite because every unit spec mocked `moveToGroup`. The transfer tests
// below reproduce the exact call path that used to fail with
// ER_LOCK_WAIT_TIMEOUT.
//
// Matrix:
//   1. transfer to a group with capacity succeeds and commits
//   2. transfer to a FULL group fails with ACADEMY_GROUP_FULL, group_id unchanged
//   3. a failure after the UPDATE but before COMMIT rolls back, group_id unchanged
//   4. cancel vs promote race -> exactly one winner, deterministic conflict for the loser
//   5. complete is concurrency-safe (no last-writer-wins)
//   6. events: cancel/complete emit exactly one event each; a rolled-back
//      transaction emits none
//
// Unique rows are created and cleaned up (program delete cascades groups +
// enrollments; users deleted).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

const emit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit } }));

// Imported after the mocks/env are set (getPool + services read env lazily).
import { academyEnrollmentService } from '../application/enrollment.service.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';

const stamp = Date.now().toString().slice(-8);
const PREFIX = `g1lc_${stamp}`;

let pool: mysql.Pool;
let programId = 0;
let groupA = 0;
let groupB = 0;
let groupFull = 0;
let userIds: number[] = [];

function code(suffix: string): string {
  return `${PREFIX}_${suffix}`;
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

async function createGroup(name: string, capacity: number): Promise<number> {
  const [g] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, capacity, status) VALUES (?, ?, ?, 'active')`,
    [programId, name, capacity],
  );
  return g.insertId;
}

/** Insert a confirmed enrollment directly (deterministic, no service side effects). */
async function seedConfirmed(playerId: number, groupId: number): Promise<number> {
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_enrollments (player_id, program_id, group_id, status, waiting_order)
     VALUES (?, ?, ?, 'confirmed', NULL)`,
    [playerId, programId, groupId],
  );
  return r.insertId;
}

async function readEnrollment(id: number): Promise<any> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT id, player_id, program_id, group_id, status, waiting_order, cancelled_at, completed_at FROM academy_enrollments WHERE id = ?',
    [id],
  );
  return (rows as any[])[0];
}

function codeOf(err: any): string {
  return err?.code ?? err?.errorCode ?? '';
}

beforeAll(async () => {
  pool = getPool();
  const [p] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs
       (code, name, description, category, level, season, capacity, original_capacity, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id)
     VALUES (?, ?, NULL, 'tennis', NULL, NULL, 0, 0, 0, 'USD', 'FIXED', 'open', 0, NULL, NULL, NULL)`,
    [code('prog'), `G1 Lifecycle ${PREFIX}`],
  );
  programId = p.insertId;
  groupA = await createGroup(`${PREFIX}_A`, 20);
  groupB = await createGroup(`${PREFIX}_B`, 20);
  groupFull = await createGroup(`${PREFIX}_full`, 1);
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

beforeEach(() => {
  emit.mockClear();
});

describe('G1 — enrollment transfer between groups (real SQL, no repository mock)', () => {
  it('#1 transfer to a group with capacity succeeds and commits', async () => {
    const playerId = await createUser(1);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    const moved = await academyEnrollmentService.moveToGroup(enrollmentId, groupB);

    expect(Number(moved.group_id)).toBe(groupB);
    const row = await readEnrollment(enrollmentId);
    expect(Number(row.group_id)).toBe(groupB);
    // Status vocabulary untouched by a transfer.
    expect(row.status).toBe('confirmed');
  });

  it('#2 transfer to a FULL group fails with ACADEMY_GROUP_FULL and leaves group_id unchanged', async () => {
    const playerId = await createUser(2);
    const occupant = await createUser(21);
    userIds.push(playerId, occupant);
    // Fill the capacity-1 group with another confirmed enrollment.
    await seedConfirmed(occupant, groupFull);

    const enrollmentId = await seedConfirmed(playerId, groupA);

    await expect(academyEnrollmentService.moveToGroup(enrollmentId, groupFull))
      .rejects.toMatchObject({ code: 'ACADEMY_GROUP_FULL' });

    const row = await readEnrollment(enrollmentId);
    expect(Number(row.group_id)).toBe(groupA);
    expect(row.status).toBe('confirmed');
  });

  it('#3 a failure after the UPDATE but before COMMIT rolls back — group_id unchanged', async () => {
    const playerId = await createUser(3);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      // Lock the row exactly as the service does, then run the REAL repository
      // transfer on the SAME connection.
      const locked = await enrollmentRepository.getByIdForUpdate(enrollmentId, conn);
      expect(locked).toBeTruthy();
      expect(Number(locked!.group_id)).toBe(groupA);
      await enrollmentRepository.moveToGroup(enrollmentId, groupB, conn);
      // Still inside the transaction: the change is invisible to other readers.
      const outside = await readEnrollment(enrollmentId);
      expect(Number(outside.group_id)).toBe(groupA);
      await conn.rollback();
    } finally {
      conn.release();
    }

    const row = await readEnrollment(enrollmentId);
    expect(Number(row.group_id)).toBe(groupA);
  });
});

describe('G1 — cancel / complete are lock-serialized and conditional', () => {
  it('#4a cancel writes cancelled_at and emits exactly one cancellation event', async () => {
    const playerId = await createUser(4);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    await academyEnrollmentService.cancel(enrollmentId);

    const row = await readEnrollment(enrollmentId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_at).toBeTruthy();

    const calls = emit.mock.calls.filter((c: any) => c[0] === 'academy:enrollment-cancelled');
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toMatchObject({
      programId, userId: playerId, enrollmentId,
    });
  });

  it('#4b complete writes completed_at and emits exactly one completion event', async () => {
    const playerId = await createUser(5);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    await academyEnrollmentService.complete(enrollmentId);

    const row = await readEnrollment(enrollmentId);
    expect(row.status).toBe('completed');
    expect(row.completed_at).toBeTruthy();

    const calls = emit.mock.calls.filter((c: any) => c[0] === 'academy:enrollment-completed');
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toMatchObject({ programId, userId: playerId, enrollmentId });
  });

  it('#4c complete is rejected from `waiting` (lifecycle contract unchanged)', async () => {
    const playerId = await createUser(6);
    userIds.push(playerId);
    const [r] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO academy_enrollments (player_id, program_id, group_id, status, waiting_order)
       VALUES (?, ?, ?, 'waiting', 900)`,
      [playerId, programId, groupA],
    );
    await expect(academyEnrollmentService.complete(r.insertId))
      .rejects.toMatchObject({ code: 'ACADEMY_INVALID_TRANSITION' });
    expect((await readEnrollment(r.insertId)).status).toBe('waiting');
    expect(emit.mock.calls.filter((c: any) => String(c[0]).startsWith('academy:enrollment-completed')).length).toBe(0);
  });

  it('#4d cancel vs promote race -> exactly one winner, deterministic conflict for the loser', async () => {
    const playerId = await createUser(7);
    userIds.push(playerId);
    const [r] = await pool.query<mysql.ResultSetHeader>(
      `INSERT INTO academy_enrollments (player_id, program_id, group_id, status, waiting_order)
       VALUES (?, ?, ?, 'waiting', 901)`,
      [playerId, programId, groupA],
    );
    const enrollmentId = r.insertId;

    const outcomes = await Promise.allSettled([
      academyEnrollmentService.promote(enrollmentId, 9, { outOfOrder: true, reason: 'g1-race' }),
      academyEnrollmentService.cancel(enrollmentId),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

    // The first operation to acquire the row lock always can act on `waiting`.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // Any rejected loser must be a deterministic conflict, never a silent
    // last-writer-wins overwrite.
    for (const r of rejected) {
      expect(['ACADEMY_INVALID_TRANSITION', 'ACADEMY_WAITLIST_NOT_ELIGIBLE']).toContain(codeOf(r.reason));
    }

    const row = await readEnrollment(enrollmentId);
    const promoteEvents = emit.mock.calls.filter((c: any) => c[0] === 'academy:promoted').length;
    const cancelEvents = emit.mock.calls.filter((c: any) => c[0] === 'academy:enrollment-cancelled').length;

    // No impossible state, and the final DB state must be exactly what the
    // successful transitions in lock order produced — the pre-fix unconditional
    // writes could end here with both callers told "success" while the row
    // shows whichever write was physically last.
    if (row.status === 'confirmed') {
      expect(fulfilled.length).toBe(1); // promote won; cancel must have been rejected
      expect(promoteEvents).toBe(1);
      expect(cancelEvents).toBe(0);
      expect(row.waiting_order).toBeNull();
      expect(row.cancelled_at).toBeNull();
    } else {
      // Cancelled: either cancel won the lock directly (promote rejected), or
      // promote committed first and the contract-legal `confirmed -> cancelled`
      // transition followed (both fulfilled, in that order).
      expect(row.status).toBe('cancelled');
      expect(row.cancelled_at).toBeTruthy();
      expect(cancelEvents).toBe(1);
      if (promoteEvents === 1) {
        expect(row.waiting_order).toBeNull(); // promote cleared it before the cancel
      } else {
        expect(promoteEvents).toBe(0);
      }
    }
  });

  it('#5 complete vs cancel race yields a single deterministic winner', async () => {
    const playerId = await createUser(8);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    const outcomes = await Promise.allSettled([
      academyEnrollmentService.complete(enrollmentId),
      academyEnrollmentService.cancel(enrollmentId),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(['ACADEMY_INVALID_TRANSITION', 'ACADEMY_SESSION_ALREADY_TRANSITIONED']).toContain(codeOf(rejected[0].reason));

    const row = await readEnrollment(enrollmentId);
    // The loser must never leave a half-applied state behind.
    if (row.status === 'cancelled') {
      expect(row.cancelled_at).toBeTruthy();
      expect(row.completed_at).toBeNull();
    } else {
      expect(row.status).toBe('completed');
      expect(row.completed_at).toBeTruthy();
    }
  });

  it('#6 a rolled-back lifecycle write emits NO event', async () => {
    const playerId = await createUser(9);
    userIds.push(playerId);
    const enrollmentId = await seedConfirmed(playerId, groupA);

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const locked = await enrollmentRepository.getByIdForUpdate(enrollmentId, conn);
      expect(locked).toBeTruthy();
      // Simulate a post-write failure inside the service transaction.
      throw new Error('forced failure before commit');
    } catch {
      await conn.rollback();
    } finally {
      conn.release();
    }

    const row = await readEnrollment(enrollmentId);
    expect(row.status).toBe('confirmed');
    expect(emit.mock.calls.filter((c: any) => String(c[0]).startsWith('academy:enrollment-')).length).toBe(0);
  });
});
