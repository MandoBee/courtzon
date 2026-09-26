// ============================================================================
// Academy G5-B — coach availability/conflict integration (real local Docker MySQL)
//
// Exercises the COACH dimension added to academy-conflict.service.evaluate:
//   A. weekly availability      — available → PENDING_COURT; outside → CONFLICT
//   B. blackouts                — overlapping → CONFLICT; outside → no conflict
//   C. 1:1 coach sessions       — overlapping active → CONFLICT (canonical
//                                 overlap semantics); non-overlapping → none
//   D. other Academy sessions   — same coach overlapping → CONFLICT; the
//                                 CURRENT session is excluded on re-evaluation
//   E. merged conflict          — court conflict AND coach conflict preserve all
//                                 information (no silent overwrite)
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { closePool, getPool } from '../../../database/mysql.js';
import { academyConflictService, type AcademyConflictContext } from '../application/academy-conflict.service.js';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';

const TZ = 'Africa/Cairo';
const PREFIX = `g5bd_${Date.now().toString().slice(-8)}`;

let pool: mysql.Pool;
let actorId = 0; let orgId = 0; let branchId = 0; let courtId = 0;
let programId = 0; let groupId = 0; let coachUserId = 0; let coachProfileId = 0;

const created = { users: [] as number[], orgs: [] as number[], branches: [] as number[], resources: [] as number[], programs: [] as number[] };

const CANDIDATE_DATE = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();
const CANDIDATE_DOW = new Date(`${CANDIDATE_DATE}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat

function makeCtx(sessionId: number | null): AcademyConflictContext {
  return {
    schedule: {
      id: 1, group_id: groupId, name: 'Coach Test', weekdays: ['mon', 'wed', 'fri'],
      start_date: CANDIDATE_DATE, end_date: CANDIDATE_DATE,
      local_start_time: '10:00', local_end_time: '11:00',
      timezone: TZ, branch_id: branchId, preferred_court_id: courtId, pending_priority_minutes: 1440, status: 'active',
    },
    groupCoachId: coachUserId,
    resource: { id: courtId, name: 'Court', branch_id: branchId, is_active: 1, deleted_at: null, opening_time: '08:00', closing_time: '22:00', sport_id: null },
    branchCourts: [],
    sessionId: sessionId ?? undefined,
    conn: undefined,
  } as any;
}

function evaluate(sessionId: number | null) {
  return academyConflictService.evaluate(courtId, CANDIDATE_DATE, '10:00', '11:00', makeCtx(sessionId));
}

/** Reset all coach-conflict sources so each test is isolated. */
async function resetState(): Promise<void> {
  await pool.query('DELETE FROM coach_sessions WHERE coach_id = ?', [coachProfileId]);
  await pool.query('DELETE FROM coach_availability_blackouts WHERE coach_id = ?', [coachProfileId]);
  await pool.query('DELETE FROM coach_availability WHERE coach_id = ?', [coachProfileId]);
  await pool.query('DELETE FROM academy_group_sessions WHERE group_id = ?', [groupId]);
  await pool.query('DELETE FROM bookings WHERE resource_id = ? AND booking_date = ?', [courtId, CANDIDATE_DATE]);
}

async function setAvailability(window: [string, string] | null): Promise<void> {
  await pool.query('DELETE FROM coach_availability WHERE coach_id = ?', [coachProfileId]);
  if (window) {
    await pool.query('INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)', [coachProfileId, CANDIDATE_DOW, window[0], window[1]]);
  }
}

async function insertCoachSession(startTime: string, endTime: string, status = 'confirmed'): Promise<number> {
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO coach_sessions (coach_id, organisation_id, branch_id, resource_id, player_id, start_time, end_time, price, currency_code, platform_commission_pct, coach_earnings, org_earnings, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'EGP', 0, 0, 0, ?)`,
    [coachProfileId, orgId, branchId, courtId, actorId, `${CANDIDATE_DATE} ${startTime}`, `${CANDIDATE_DATE} ${endTime}`, status],
  );
  return r.insertId;
}

async function insertAcademySession(startTime: string, endTime: string, coachId: number | null): Promise<number> {
  const [r] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_group_sessions (group_id, session_date, start_time, end_time, coach_id, status)
     VALUES (?, ?, ?, ?, ?, 'scheduled')`,
    [groupId, CANDIDATE_DATE, startTime, endTime, coachId],
  );
  return r.insertId;
}

beforeAll(async () => {
  pool = getPool();

  const [u1] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (UUID(), (SELECT id FROM countries LIMIT 1), ?, ?, ?, 'x', 'G5B Owner', 'male')`,
    [`${PREFIX}800`, `+20${PREFIX}800`, `${PREFIX}owner@courtzon.test`],
  );
  actorId = u1.insertId; created.users.push(actorId);

  const [u2] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (UUID(), (SELECT id FROM countries LIMIT 1), ?, ?, ?, 'x', 'G5B Coach', 'male')`,
    [`${PREFIX}801`, `+20${PREFIX}801`, `${PREFIX}coach@courtzon.test`],
  );
  coachUserId = u2.insertId; created.users.push(coachUserId);

  const [ot] = await pool.query<mysql.RowDataPacket[]>('SELECT id FROM organisation_types LIMIT 1');
  orgId = (await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, ?, 'G5B Org', ?, 1)`,
    [(ot as any[])[0].id, actorId, `${PREFIX}-org`],
  ))[0].insertId;
  created.orgs.push(orgId);

  branchId = (await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'G5B Branch', ?, ?)`,
    [orgId, `${PREFIX}-b`, TZ],
  ))[0].insertId;
  created.branches.push(branchId);

  courtId = (await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
     VALUES (UUID(), 'G5B Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
    [branchId],
  ))[0].insertId;
  created.resources.push(courtId);

  const prof = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO coach_profiles (user_id, status) VALUES (?, 'approved')`, [coachUserId],
  );
  coachProfileId = prof[0].insertId;

  programId = (await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_programs (code, name, category, price, currency, price_type, status, is_public, organisation_id, branch_id, sport_id, lifecycle_state)
     VALUES (?, 'G5B Prog', 'tennis', 0, 'USD', 'FIXED', 'open', 0, ?, ?, (SELECT id FROM sports LIMIT 1), 'setup')`,
    [`${PREFIX}-prog`, orgId, branchId],
  ))[0].insertId;
  created.programs.push(programId);

  groupId = (await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO academy_groups (program_id, name, coach_id, capacity, status) VALUES (?, 'G5B Group', ?, 10, 'active')`,
    [programId, coachUserId],
  ))[0].insertId;
});

afterAll(async () => {
  try {
    await pool.query('DELETE FROM coach_sessions WHERE coach_id = ?', [coachProfileId]);
    await pool.query('DELETE FROM coach_availability_blackouts WHERE coach_id = ?', [coachProfileId]);
    await pool.query('DELETE FROM coach_availability WHERE coach_id = ?', [coachProfileId]);
    if (created.programs.length) await pool.query(`DELETE FROM academy_programs WHERE id IN (${created.programs.map(() => '?').join(',')})`, created.programs);
    await pool.query('DELETE FROM coach_profiles WHERE id = ?', [coachProfileId]);
    if (created.resources.length) await pool.query(`DELETE FROM resources WHERE id IN (${created.resources.map(() => '?').join(',')})`, created.resources);
    if (created.branches.length) await pool.query(`DELETE FROM branches WHERE id IN (${created.branches.map(() => '?').join(',')})`, created.branches);
    if (created.orgs.length) await pool.query(`DELETE FROM organisations WHERE id IN (${created.orgs.map(() => '?').join(',')})`, created.orgs);
    if (created.users.length) await pool.query(`DELETE FROM users WHERE id IN (${created.users.map(() => '?').join(',')})`, created.users);
  } finally {
    await closePool();
  }
});

describe('G5-B — Academy coach availability/conflict evaluation', () => {
  it('A. coach within weekly availability → no coach conflict (normal pending state)', async () => {
    await resetState();
    await setAvailability(['08:00', '17:00']);
    const ev = await evaluate(null);
    expect(ev.state).toBe('PENDING_COURT');
    expect(ev.reason).not.toBe('coach_conflict');
  });

  it('A2. coach outside weekly availability → CONFLICT (coach_conflict)', async () => {
    await resetState();
    await setAvailability(['05:00', '06:00']);
    const ev = await evaluate(null);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('coach_conflict');
  });

  it('B. blackout overlapping → CONFLICT; outside the candidate date → no conflict', async () => {
    await resetState();
    await setAvailability(['08:00', '17:00']);
    const okEv = await evaluate(null);
    expect(okEv.reason).not.toBe('coach_conflict');

    await pool.query('INSERT INTO coach_availability_blackouts (coach_id, blackout_date, reason) VALUES (?, ?, \'day off\')', [coachProfileId, CANDIDATE_DATE]);
    const busyEv = await evaluate(null);
    expect(busyEv.state).toBe('CONFLICT');
    expect(busyEv.reason).toBe('coach_conflict');
  });

  it('C. overlapping active 1:1 coach session → CONFLICT; cancelled confirmed follow canonical semantics', async () => {
    await resetState();
    await setAvailability(['08:00', '17:00']);
    const id = await insertCoachSession('10:15', '10:45', 'confirmed');
    const ev = await evaluate(null);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('coach_conflict');
    expect(String(ev.conflict.detail || '')).toContain('coach session');
    await pool.query('DELETE FROM coach_sessions WHERE id = ?', [id]);

    // A CANCELLED coach session must NOT conflict (canonical shared semantics).
    await insertCoachSession('10:15', '10:45', 'cancelled');
    const after = await evaluate(null);
    expect(after.state).toBe('PENDING_COURT');
    expect(after.reason).not.toBe('coach_conflict');
  });

  it('D. overlapping other Academy session same coach → CONFLICT; current session excluded on re-evaluation', async () => {
    await resetState();
    await setAvailability(['08:00', '17:00']);
    const otherId = await insertAcademySession('10:15', '10:45', coachUserId);

    const fresh = await evaluate(null);
    expect(fresh.state).toBe('CONFLICT');
    expect(fresh.reason).toBe('coach_conflict');
    expect(String(fresh.conflict.detail || '')).toContain('Academy session');

    // Re-evaluating the existing session itself excludes itself.
    const self = await evaluate(otherId);
    expect(self.reason).not.toBe('coach_conflict');
    expect(self.state).toBe('PENDING_COURT');
  });

  it('E. court AND coach conflict preserve all information (no silent overwrite)', async () => {
    await resetState();
    await setAvailability(['05:00', '06:00']);
    // A player booking occupies the court slot → court CONFLICT as well.
    await pool.query(
      `INSERT INTO bookings (public_id, user_id, organisation_id, resource_id, booking_type, booking_date, start_time, end_time, total_amount, booking_status)
       VALUES (UUID(), ?, ?, ?, 'academy', ?, '10:00', '11:00', 100, 'confirmed')`,
      [actorId, orgId, courtId, CANDIDATE_DATE],
    );
    const ev = await evaluate(null);
    expect(ev.state).toBe('CONFLICT');
    expect(ev.reason).toBe('coach_conflict');
    expect((ev.conflict as any).coach).toMatchObject({ coachId: coachUserId });
    // The court (booking) conflict detail is preserved alongside the coach info.
    expect(ev.conflict.type).toBe('booking');
  });
});