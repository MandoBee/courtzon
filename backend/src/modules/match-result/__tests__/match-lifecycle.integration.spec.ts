import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool } from '../../../database/mysql.js';

let ctx: TestContext;
let redis: { disconnect: () => void; ping: () => Promise<string> };

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const ioredis = await import('ioredis');
  const RedisClient = (ioredis as any).default || ioredis;
  redis = new RedisClient({ host: '127.0.0.1', port: ctx.redisPort });
  await redis.ping();
}, 180000);

afterAll(async () => {
  redis?.disconnect();
  await stopContainers();
}, 30000);

const PADEL_RULES = {
  score_structure: 'sets',
  best_of: 3,
  sets_to_win: 2,
  first_to: 6,
  margin: 1,
  tiebreak_at: 6,
  tiebreak_first_to: 7,
  tiebreak_win_by: 2,
  deuce_rule: 'golden_point',
  draw_allowed: false,
  terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
};
const PADEL_STANDINGS = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: [{ field: 'points', direction: 'desc' }],
};

/**
 * Create the minimal domain fixtures the journey needs. The canonical fresh
 * schema (baseline + seed 001) provides reference data (sports, users,
 * organisations, branches, resource_types) but NOT resources or the active
 * sport_format/sport_rule_set rows (their baseline INSERTs are skipped while
 * the sports table is still empty during baseline import). Those are created
 * here so the journey is self-contained and independent of seed content.
 */
async function ensureMatchFixtures(pool: any): Promise<{ orgId: number; resource: any }> {
  const { randomUUID } = await import('node:crypto');

  await pool.execute('INSERT IGNORE INTO sports (id, name, slug) VALUES (22, ?, ?)', ['Padel', 'padel']);
  await pool.execute(
    `INSERT IGNORE INTO sport_formats (id, sport_id, slug, name, format_type, description, is_default, is_active)
     VALUES (1, 22, 'standard', 'Padel Standard', 'doubles', 'Best of 3 sets', 1, 1)`,
  );
  await pool.execute(
    `INSERT IGNORE INTO sport_rule_sets (id, format_id, version, name, rules, standings_rules, is_active, is_default)
     VALUES (1, 1, 1, 'Padel Standard v1', ?, ?, 1, 1)`,
    [JSON.stringify(PADEL_RULES), JSON.stringify(PADEL_STANDINGS)],
  );

  const [orgs] = await pool.execute<any[]>('SELECT id FROM organisations ORDER BY id LIMIT 1');
  if (!orgs.length) throw new Error('seed data missing: organisation');
  const orgId = orgs[0].id;

  let [resources] = await pool.execute<any[]>('SELECT id, branch_id FROM resources ORDER BY id LIMIT 1');
  if (!resources.length) {
    const [branches] = await pool.execute<any[]>('SELECT id FROM branches ORDER BY id LIMIT 1');
    const [types] = await pool.execute<any[]>('SELECT id FROM resource_types ORDER BY id LIMIT 1');
    if (!branches.length || !types.length) throw new Error('seed data missing: branch/resource_type');
    const [res] = await pool.execute<any[]>(
      `INSERT INTO resources (public_id, branch_id, resource_type_id, sport_id, name, capacity, is_active)
       VALUES (?, ?, ?, 22, 'Integration Test Court', 1, 1)`,
      [randomUUID(), branches[0].id, types[0].id],
    );
    [resources] = await pool.execute<any[]>('SELECT id, branch_id FROM resources WHERE id = ?', [res.insertId]);
  }
  return { orgId, resource: resources[0] };
}

async function ensureUsers(pool: any, count: number): Promise<number[]> {
  // Literal LIMIT (no bound parameter) — mysql2 prepared statements reject
  // `LIMIT ?` bindings on some server configurations (ER_WRONG_ARGUMENTS).
  const [existing] = await pool.execute<any[]>('SELECT id FROM users ORDER BY id LIMIT 10');
  const ids: number[] = existing.slice(0, count).map((u: any) => u.id);
  if (ids.length >= count) return ids;
  const { randomUUID } = await import('node:crypto');
  let n = existing.length + 1;
  while (ids.length < count) {
    const [res] = await pool.execute<any[]>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
      [randomUUID(), `0100000${n}`, `+201000000${n}`, `itest${n}@courtzon.test`, `Integration Player ${n}`],
    );
    ids.push(res.insertId);
    n += 1;
  }
  return ids;
}

async function insertBookingAndMatch(opts: { endAtUtc: string; status: string; startAtUtc?: string }) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();

  const { orgId, resource } = await ensureMatchFixtures(pool);
  const [playerA, playerB] = await ensureUsers(pool, 2);

  const [booking] = await pool.execute<any[]>(
    `INSERT INTO bookings
       (user_id, organisation_id, branch_id, resource_id, booking_type, visibility,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        total_amount, tax_rate, tax_amount, tax_treatment, coach_amount,
        booking_status, payment_status)
     VALUES (?, ?, ?, ?, 'public_match', 'public',
        '2026-07-01', '2026-07-01', '08:00', '10:00', ?, ?,
        100, 0, 0, 'taxable', 0,
        'confirmed', 'paid')`,
    [playerA, orgId, resource.branch_id, resource.id, opts.startAtUtc || '2026-07-01 08:00:00', opts.endAtUtc],
  );
  const bookingId = booking.insertId;

  const [match] = await pool.execute<any[]>(
    `INSERT INTO matches (type, status, booking_id, sport_id) VALUES ('public', ?, ?, 22)`,
    [opts.status, bookingId],
  );
  const matchId = match.insertId;

  await pool.execute(
    `INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'host')`,
    [matchId, playerA],
  );
  await pool.execute(
    `INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'joiner')`,
    [matchId, playerB],
  );

  return { matchId, bookingId, playerA, playerB };
}

const VALID_PAYLOAD = {
  outcome: 'completed',
  score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }] },
};

/** Normalize a DB TIMESTAMP value (JS Date or string) to 'YYYY-MM-DD HH:mm:ss'. */
function fmtTs(v: any): string {
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19);
  return String(v).slice(0, 19);
}

describe('Match lifecycle → result eligibility journey', () => {
  it('result submission is BLOCKED before the authoritative scheduled end', async () => {
    const { matchId, playerA } = await insertBookingAndMatch({
      status: 'in_progress',
      endAtUtc: '2037-12-31 10:00:00', // far in the future (TIMESTAMP range: < 2038)
    });

    const { getPool } = await import('../../../database/mysql.js');
    await getPool().execute(
      `INSERT INTO match_sessions (match_id, status, started_at) VALUES (?, 'in_progress', NOW())`,
      [matchId],
    );

    const { matchResultService } = await import('../application/match-result.service.js');
    await expect(matchResultService.submitMatchResult(matchId, playerA, VALID_PAYLOAD))
      .rejects.toThrow(/has not ended yet/i);
  });

  it('autoCompleteScheduledMatches establishes the end and result submission succeeds after end', async () => {
    // Scheduled end just in the past so auto-complete fires AND the 72h
    // submission window (from played_at = end_at_utc) is still open.
    const endAtUtc = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const startAtUtc = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const { matchId, playerA, playerB } = await insertBookingAndMatch({
      status: 'closed',
      endAtUtc,
      startAtUtc,
    });

    // 1. The scheduled-end lifecycle produces a session + completed status.
    const { matchService } = await import('../../match/application/services/match.service.js');
    const completed = await matchService.autoCompleteScheduledMatches();
    expect(completed).toBeGreaterThan(0);

    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [matchRows] = await pool.execute<any[]>('SELECT status FROM matches WHERE id = ?', [matchId]);
    expect(matchRows[0].status).toBe('completed');

    const [sessRows] = await pool.execute<any[]>(
      'SELECT status, ended_at FROM match_sessions WHERE match_id = ?',
      [matchId],
    );
    expect(sessRows.length).toBe(1);
    expect(sessRows[0].status).toBe('completed');
    expect(fmtTs(sessRows[0].ended_at)).toBe(endAtUtc);

    // 2. getMatchContext now yields a real played_at.
    const { matchResultRepository } = await import('../infrastructure/match-result.repository.js');
    const context = await matchResultRepository.getMatchContext(matchId);
    expect(context?.playedAt).toBeTruthy();
    expect(fmtTs(context?.playedAt)).toBe(endAtUtc);

    // 3. Result submission succeeds (ended, eligible status, participants, rules).
    const { matchResultService } = await import('../application/match-result.service.js');
    const record = await matchResultService.submitMatchResult(matchId, playerA, VALID_PAYLOAD);
    expect(record.submissionStatus).toBe('pending_confirmation');
    expect(record.playedAt).toBeTruthy();

    // 4. Opponent can accept and the 72h window constants are preserved.
    const accepted = await matchResultService.acceptResult(matchId, playerB);
    expect(accepted.submissionStatus).toBe('approved');

    // Let fire-and-forget EventBus emits (published_events inserts) flush before
    // the shared pool is closed in afterAll — avoids a teardown "Pool is closed".
    await new Promise((r) => setTimeout(r, 150));
  });
});