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
  score_structure: 'sets', best_of: 3, sets_to_win: 2, first_to: 6, margin: 1,
  tiebreak_at: 6, tiebreak_first_to: 7, tiebreak_win_by: 2,
  deuce_rule: 'golden_point', draw_allowed: false,
  terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
};
const PADEL_STANDINGS = { points: { win: 3, draw: 1, loss: 0 }, tiebreakers: [{ field: 'points', direction: 'desc' }] };

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
       VALUES (?, ?, ?, 22, 'Integration UAT Court', 4, 1)`,
      [randomUUID(), branches[0].id, types[0].id],
    );
    [resources] = await pool.execute<any[]>('SELECT id, branch_id FROM resources WHERE id = ?', [res.insertId]);
  }
  return { orgId, resource: resources[0] };
}

async function ensureUsers(pool: any, count: number): Promise<number[]> {
  const [existing] = await pool.execute<any[]>('SELECT id FROM users ORDER BY id LIMIT 20');
  const ids: number[] = existing.slice(0, count).map((u: any) => u.id);
  if (ids.length >= count) return ids;
  const { randomUUID } = await import('node:crypto');
  let n = existing.length + 1;
  while (ids.length < count) {
    const [res] = await pool.execute<any[]>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
      [randomUUID(), `0110000${n}`, `+201100000${n}`, `uat${n}@courtzon.test`, `UAT Player ${n}`],
    );
    ids.push(res.insertId);
    n += 1;
  }
  return ids;
}

/** Builds an open public match with host participant, pmd, and past deadline (eligible for close). */
async function createOpenMatch(pool: any, hostId: number) {
  const { orgId, resource } = await ensureMatchFixtures(pool);
  const start = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const end = new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const deadline = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

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
    [hostId, orgId, resource.branch_id, resource.id, start, end],
  );
  const bookingId = booking.insertId;

  const [match] = await pool.execute<any[]>(
    `INSERT INTO matches (type, status, booking_id, sport_id) VALUES ('public', 'open', ?, 22)`,
    [bookingId],
  );
  const matchId = match.insertId;

  await pool.execute(
    `INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, 'host')`,
    [matchId, hostId],
  );

  await pool.execute(
    `INSERT INTO public_match_details (match_id, creator_id, visibility, auto_accept, max_players, deadline)
     VALUES (?, ?, 'public', 0, 4, ?)`,
    [matchId, hostId, deadline],
  );

  return { matchId, bookingId, hostId, start, end };
}

describe('Match player journey (K1/K2/K4): invitation → join → start → result', () => {
  it('host invites, joiner is approved, invitation resolves; match stays reachable after start/end', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [host, joiner] = await ensureUsers(pool, 2);

    // ── step 1: host creates an open public match (deadline already passed) ──
    const { matchId, start } = await createOpenMatch(pool, host);

    // ── step 2: host invites the joiner (production invitation state) ──
    const { invitationService } = await import('../../match/application/services/invitation.service.js');
    await invitationService.send(matchId, joiner, null);

    // ── step 3: joiner applies via a join request ──
    const { joinRequestService } = await import('../../match/application/services/join-request.service.js');
    const applied = await joinRequestService.submit(matchId, joiner);
    expect(applied.status).toBe('submitted');

    // ── step 4: host approves → joiner becomes participant AND invitation expires atomically ──
    await joinRequestService.approve(applied.requestId!, host);
    const [invRows] = await pool.execute<any[]>(
      'SELECT status FROM invitations WHERE match_id = ? AND user_id = ?', [matchId, joiner],
    );
    expect(invRows.length).toBeGreaterThan(0);
    for (const r of invRows) expect(r.status).toBe('expired');

    const [partRows] = await pool.execute<any[]>(
      'SELECT role FROM match_participants WHERE match_id = ? AND user_id = ?', [matchId, joiner],
    );
    expect(partRows.length).toBe(1);
    expect(partRows[0].role).toBe('joiner');

    // ── step 5: K1 badge — the joiner's expired invitation is NOT counted ──
    const { playerService } = await import('../../../modules/player-experience/application/player.service.js');
    const nav = await playerService.getNavSummary(joiner);
    expect(nav.matches).toBe(0);

    // ── step 6: /matches/my still surfaces the match while it is OPEN ──
    const { getMyMatchesHandler, getMatchesHandler } = await import('../../match/presentation/match.controller.js');
    function collect(handler: any, req: any): Promise<any[]> {
      const rows: any[] = [];
      const reply = { send: (b: any) => rows.push(...b.data), status: () => reply } as any;
      return handler(req, reply).then(() => rows);
    }
    expect((await collect(getMyMatchesHandler, { userId: joiner, query: {}, params: {} })).some((r) => r.id === matchId)).toBe(true);

    // ── step 7: deadline close (K2B path) — invitation is no longer actionable ──
    const { deadlineService } = await import('../../match/application/services/deadline.service.js');
    const closed = await deadlineService.closeExpiredMatches();
    expect(closed).toBeGreaterThan(0);
    const [closedRow] = await pool.execute<any[]>('SELECT status FROM matches WHERE id = ?', [matchId]);
    expect(closedRow[0].status).toBe('closed');

    // ── step 8: auto-start (K2C path) fires because start_at_utc passed + 2 participants ──
    const { matchService } = await import('../../match/application/services/match.service.js');
    const started = await matchService.autoStartScheduledMatches();
    expect(started).toBeGreaterThan(0);
    const [inProgressRow] = await pool.execute<any[]>('SELECT status FROM matches WHERE id = ?', [matchId]);
    expect(inProgressRow[0].status).toBe('in_progress');

    // ── step 9: discover list EXCLUDES in_progress, /matches/my still SHOWS it ──
    const discover = await collect(getMatchesHandler, { userId: joiner, query: { visibility: 'public' }, params: {} });
    expect(discover.some((r) => r.id === matchId)).toBe(false);

    const mineAfterStart = await collect(getMyMatchesHandler, { userId: joiner, query: {}, params: {} });
    expect(mineAfterStart.some((r) => r.id === matchId)).toBe(true);

    // ── step 10: auto-complete establishes the result window for start (already past) ──
    const completed = await matchService.autoCompleteScheduledMatches();
    expect(completed).toBeGreaterThan(0);
    const [completedRow] = await pool.execute<any[]>('SELECT status FROM matches WHERE id = ?', [matchId]);
    expect(completedRow[0].status).toBe('completed');

    // /matches/my still surfaces completed matches so the Joined tab entry point survives
    const mineAfterEnd = await collect(getMyMatchesHandler, { userId: joiner, query: {}, params: {} });
    expect(mineAfterEnd.some((r) => r.id === matchId)).toBe(true);

    // Let fire-and-forget EventBus emits flush before teardown.
    await new Promise((r) => setTimeout(r, 200));
  });

  it('detail /matches/:id succeeds on the real schema and exposes phone only to participants/creators (schema-drift guard)', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [host, participant, outsider] = await ensureUsers(pool, 3);

    const { matchId } = await createOpenMatch(pool, host);
    await pool.execute(
      'INSERT INTO match_participants (match_id, user_id, role) VALUES (?, ?, ?)',
      [matchId, participant, 'joiner'],
    );

    const { getMatchHandler } = await import('../../match/presentation/match.controller.js');
    async function callDetail(actingUserId: number) {
      let sent: any;
      const reply = { send: (b: any) => { sent = b; }, status: () => reply } as any;
      await getMatchHandler({ userId: actingUserId, query: {}, params: { id: String(matchId) } } as any, reply);
      return sent;
    }

    // participant: roster renders with phone numbers (query must not raise ER_BAD_FIELD_ERROR)
    const asParticipant = await callDetail(participant);
    expect(asParticipant.data.id).toBe(matchId);
    const rosterForParticipant = JSON.parse(asParticipant.data.participants_json);
    expect(rosterForParticipant.length).toBe(2);
    for (const member of rosterForParticipant) {
      expect(typeof member.phone).toBe('string');
      expect((member.phone as string).length).toBeGreaterThan(0);
    }

    // outsider (no relationship to the match): same roster, phone redacted
    const asOutsider = await callDetail(outsider);
    expect(asOutsider.data.id).toBe(matchId);
    const rosterForOutsider = JSON.parse(asOutsider.data.participants_json);
    expect(rosterForOutsider.length).toBe(2);
    for (const member of rosterForOutsider) {
      expect(member.phone).toBeNull();
    }

    // creator: full visibility via the pmd.creator_id branch
    const [hostPhoneRows] = await pool.execute<any[]>(
      'SELECT phone_number FROM users WHERE id = ?', [host],
    );
    const asHost = await callDetail(host);
    const rosterForHost = JSON.parse(asHost.data.participants_json);
    expect(rosterForHost.some((m: any) => Number(m.userId) === host && m.phone === hostPhoneRows[0].phone_number)).toBe(true);
  });
});