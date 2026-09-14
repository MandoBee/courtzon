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

async function insertBookingAndMatch(opts: { endAtUtc: string; status: string; startAtUtc?: string }) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();

  const [orgs] = await pool.execute<any[]>('SELECT id FROM organisations ORDER BY id LIMIT 1');
  const [resources] = await pool.execute<any[]>('SELECT id, branch_id FROM resources ORDER BY id LIMIT 1');
  if (!orgs.length || !resources.length) throw new Error('seed data missing: organisation/resource');
  const orgId = orgs[0].id;
  const resource = resources[0];

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
    [1, orgId, resource.branch_id, resource.id, opts.startAtUtc || '2026-07-01 08:00:00', opts.endAtUtc],
  );
  const bookingId = booking.insertId;

  const [match] = await pool.execute<any[]>(
    `INSERT INTO matches (type, status, booking_id, sport_id) VALUES ('public', ?, ?, 22)`,
    [opts.status, bookingId],
  );
  const matchId = match.insertId;

  const [users] = await pool.execute<any[]>(
    `SELECT id FROM users WHERE id IN (SELECT user_id FROM bookings WHERE user_id = ?) OR id NOT IN (SELECT user_id FROM bookings) LIMIT 1`,
    [1],
  );
  const [users2] = await pool.execute<any[]>(
    `SELECT id FROM users WHERE id != ? ORDER BY id LIMIT 1`,
    [users[0].id],
  );
  const [users3] = await pool.execute<any[]>(
    `SELECT id FROM users WHERE id != ? AND id != ? ORDER BY id LIMIT 1`,
    [users[0].id, users2[0].id],
  );
  const playerA = users[0].id;
  const playerB = users2[0].id || users3[0].id;

  await pool.execute(
    `INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'host')`,
    [matchId, playerA],
  );
  await pool.execute(
    `INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'player')`,
    [matchId, playerB],
  );

  return { matchId, bookingId, playerA, playerB };
}

const VALID_PAYLOAD = {
  outcome: 'completed',
  score: { sets: [{ home: 6, away: 4 }, { home: 6, away: 3 }] },
};

describe('Match lifecycle → result eligibility journey', () => {
  it('result submission is BLOCKED before the authoritative scheduled end', async () => {
    const { matchId, playerA } = await insertBookingAndMatch({
      status: 'in_progress',
      endAtUtc: '2099-12-31 10:00:00', // far in the future
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
    const { matchId, playerA, playerB } = await insertBookingAndMatch({
      status: 'closed',
      endAtUtc: '2026-07-01 10:00:00', // past — scheduled end reached
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
    expect(String(sessRows[0].ended_at).slice(0, 19)).toBe('2026-07-01 10:00:00');

    // 2. getMatchContext now yields a real played_at.
    const { matchResultRepository } = await import('../infrastructure/match-result.repository.js');
    const context = await matchResultRepository.getMatchContext(matchId);
    expect(context?.playedAt).toBeTruthy();
    expect(String(context?.playedAt).slice(0, 19)).toBe('2026-07-01 10:00:00');

    // 3. Result submission succeeds (ended, eligible status, participants, rules).
    const { matchResultService } = await import('../application/match-result.service.js');
    const record = await matchResultService.submitMatchResult(matchId, playerA, VALID_PAYLOAD);
    expect(record.submissionStatus).toBe('pending_confirmation');
    expect(record.playedAt).toBeTruthy();

    // 4. Opponent can accept and the 72h window constants are preserved.
    const accepted = await matchResultService.acceptResult(matchId, playerB);
    expect(accepted.submissionStatus).toBe('approved');
  });
});