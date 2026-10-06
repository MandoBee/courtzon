import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * G11.16 — Public / anonymous tournament discovery (NON-FINANCIAL).
 *
 * Proves (against the real schema, isolated data, no production):
 *   1. anonymous public list returns ONLY is_public=1 tournaments;
 *   2. private tournaments never appear;
 *   3. anonymous public detail works;
 *   4. anonymous access to a private tournament fails safely (404);
 *   5. public response contains NO financial fields;
 *   6. public response contains NO private tenant/member/internal-identity data;
 *   7. public bracket/standings appear ONLY when legitimately available;
 *   8. tenant isolation preserved;
 *   9. the global auth middleware short-circuits /public/… (no token required);
 *  10. the public router registers the endpoints WITHOUT any permission guard.
 */

const ORG = 2680001;
const ACTOR = 2680009;
const U1 = 2680011;
const U2 = 2680012;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
const prizeIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);

async function createTournament(name: string, opts: { isPublic?: number; status?: string; format?: string }): Promise<number> {
  const [res] = await exec<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, ?, ?, 8, 2, 0, 0, 'EGP', 'FREE', 'community', 0, ?, ?, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [ACTOR, ORG, opts.format ?? 'knockout', name, opts.status ?? 'registration_open', opts.isPublic ?? 1],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  await exec(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`, [tid]);
  return tid;
}

async function mkUser(id: number) {
  await exec(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'G11.16 User', 'male', 'active')`,
    [id, `020${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, `g1116-${id}@test.com`],
  );
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 4 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${ORG}, UUID(), ?, 1, 'G11.16 Org', 'g1116-org', 1)`, [otId]);
  for (const u of [ACTOR, U1, U2]) await mkUser(u);
  // A public tournament (registration_open) with a bracket + standings.
  const pubWithData = await createTournament('Public Cup', { isPublic: 1, status: 'registration_open', format: 'round_robin' });
  const reg1 = Number((await exec(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'confirmed')`, [pubWithData, U1]))[0].insertId);
  const reg2 = Number((await exec(`INSERT INTO tournament_registrations (tournament_id, player_id, payment_status, status) VALUES (?, ?, 'paid', 'confirmed')`, [pubWithData, U2]))[0].insertId);
  const p1 = Number((await exec(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', ?)`, [pubWithData, reg1, JSON.stringify([U1])]))[0].insertId);
  const p2 = Number((await exec(`INSERT INTO tournament_participants (tournament_id, registration_id, participant_type, status, member_user_ids) VALUES (?, ?, 'individual', 'active', ?)`, [pubWithData, reg2, JSON.stringify([U2])]))[0].insertId);
  await exec(
    `INSERT INTO tournament_matches (tournament_id, round, match_number, bracket_position, participant1_id, participant2_id, player1_id, player2_id, status, progression_state, progression_meta)
     VALUES (?, 1, 1, 0, ?, ?, ?, ?, 'scheduled', 'pending', '{"is_bracket":false}')`,
    [pubWithData, p1, p2, U1, U2],
  );
  await exec(
    `INSERT INTO tournament_standings (tournament_id, registration_id, wins, losses, draws, points, games_won, games_lost, sets_won, sets_lost, rank_position)
     VALUES (?, ?, 1, 0, 0, 3, 6, 3, 2, 1, 1)`, [pubWithData, reg1],
  );
  await createTournament('Public Open', { isPublic: 1, status: 'published' }); // public, no matches/standings
  await createTournament('Private Only', { isPublic: 0, status: 'registration_open' }); // private
  await createTournament('Public Draft', { isPublic: 1, status: 'draft' }); // public but draft → hidden
}, 60000);

afterAll(async () => {
  if (!pool) return;
  const idList = tournamentIds.length ? tournamentIds.join(',') : '0';
  const pidList = prizeIds.length ? prizeIds.join(',') : '0';
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  await pool.execute(`DELETE FROM tournament_placements WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_standings WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_matches WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_participants WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_registrations WHERE tournament_id IN (${idList})`);
  await pool.execute(`DELETE FROM tournament_prizes WHERE tournament_id IN (${idList}) OR id IN (${pidList})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${idList})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ACTOR}, ${U1}, ${U2})`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  await pool.execute(`SET FOREIGN_KEY_CHECKS = 1`);
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 60000);

beforeEach(() => { vi.restoreAllMocks(); });

describe('G11.16 public tournament discovery', () => {
  it('1. anonymous public list returns ONLY is_public=1, non-draft tournaments', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const list = await tournamentService.listPublic();
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const t of list as any[]) {
      expect(Number(t.is_public)).toBe(1);
      expect(['draft', 'cancelled', 'archived']).not.toContain(t.status);
    }
    expect(list.some((t: any) => t.name === 'Public Cup')).toBe(true);
    expect(list.some((t: any) => t.name === 'Public Open')).toBe(true);
    // Private + draft NEVER appear.
    expect(list.some((t: any) => t.name === 'Private Only')).toBe(false);
    expect(list.some((t: any) => t.name === 'Public Draft')).toBe(false);
  });

  it('2 & 5 & 6. absolute exclusions: never private, never financial, never internal identity', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const list = await tournamentService.listPublic();
    const sample = list[0] as Record<string, unknown>;
    for (const key of ['created_at', 'updated_at', 'prizes', 'sponsors', 'entry_fee', 'registration_fee', 'currency_code', 'price_type', 'registration_payment_methods', 'commission_rate', 'creator_id', 'deleted_at', 'winner_id', 'participantUserIds', 'branch_id']) {
      expect(Object.prototype.hasOwnProperty.call(sample, key), `financial/internal key leaked: ${key}`).toBe(false);
    }
  });

  it('3. anonymous public detail works for a public tournament', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const list = await tournamentService.listPublic();
    const pub = list.find((t: any) => t.name === 'Public Cup') as any;
    const d = await tournamentService.getPublicTournament(Number(pub.id));
    expect(d.name).toBe('Public Cup');
    expect(d.status).toBe('registration_open');
    expect(d.organisation).toBe('G11.16 Org');
    expect(Number(d.is_public)).toBe(1);
  });

  it('4. anonymous access to a PRIVATE tournament fails safely (404, indistinguishable)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const { NotFoundError } = await import('../../../shared/errors/app-error.js');
    const [rows] = await pool.execute<RowData>(`SELECT id FROM tournaments WHERE name = 'Private Only' LIMIT 1`);
    await expect(tournamentService.getPublicTournament(Number((rows as any[])[0].id))).rejects.toBeInstanceOf(NotFoundError);
    // F-02 — the private 404 carries the TOURNAMENT code, never the academy one.
    await expect(tournamentService.getPublicTournament(Number((rows as any[])[0].id))).rejects.toMatchObject({
      statusCode: 404, errorCode: 'NOT_FOUND', code: 'TOURNAMENT_NOT_FOUND',
    });
  });

  it('4c. a NONEXISTENT public tournament id → 404 TOURNAMENT_NOT_FOUND (never ACADEMY_PROGRAM_NOT_FOUND)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const { NotFoundError } = await import('../../../shared/errors/app-error.js');
    const err: any = await tournamentService.getPublicTournament(999999999).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe('NOT_FOUND');
    expect(err.code).toBe('TOURNAMENT_NOT_FOUND');
    expect(err.code).not.toBe('ACADEMY_PROGRAM_NOT_FOUND');
    expect(err.message).toBe('Tournament not found');
    expect(err.message).not.toContain('999999999');
  });

  it('4b. a public but DRAFT / CANCELLED / ARCHIVED tournament is NOT publicly visible (404)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const { NotFoundError } = await import('../../../shared/errors/app-error.js');
    const [rows] = await pool.execute<RowData>(`SELECT id FROM tournaments WHERE name = 'Public Draft' LIMIT 1`);
    await expect(tournamentService.getPublicTournament(Number((rows as any[])[0].id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(tournamentService.getPublicTournament(Number((rows as any[])[0].id))).rejects.toMatchObject({
      statusCode: 404, code: 'TOURNAMENT_NOT_FOUND',
    });
    // A cancelled public tournament must also 404 (regression guard).
    const cancelled = await createTournament('Public Cancelled', { isPublic: 1, status: 'cancelled' });
    await expect(tournamentService.getPublicTournament(cancelled)).rejects.toBeInstanceOf(NotFoundError);
    await expect(tournamentService.getPublicTournament(cancelled)).rejects.toMatchObject({
      statusCode: 404, code: 'TOURNAMENT_NOT_FOUND',
    });
  });

  it('7. public bracket/standings appear ONLY when legitimately available', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const list = await tournamentService.listPublic();
    const withData = list.find((t: any) => t.name === 'Public Cup') as any;
    const d1 = await tournamentService.getPublicTournament(Number(withData.id));
    expect(Array.isArray(d1.bracket)).toBe(true);
    expect((d1.bracket as any[]).length).toBe(1);
    expect(Array.isArray(d1.standings)).toBe(true);
    expect((d1.standings as any[]).length).toBe(1);
    // Safety of bracket rows: display names only, no ids/referee/resource.
    const m = (d1.bracket as any[])[0];
    for (const key of ['match_id', 'participant1_id', 'participant2_id', 'player1_id', 'player2_id', 'winner_id', 'referee_id', 'resource_id']) {
      expect(Object.prototype.hasOwnProperty.call(m, key), `bracket leaked: ${key}`).toBe(false);
    }
    const s = (d1.standings as any[])[0];
    expect(Object.prototype.hasOwnProperty.call(s, 'registration_id')).toBe(false);
    // A public tournament with NO matches/standings has neither key.
    const empty = list.find((t: any) => t.name === 'Public Open') as any;
    const d2 = await tournamentService.getPublicTournament(Number(empty.id));
    expect(Object.prototype.hasOwnProperty.call(d2, 'bracket')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(d2, 'standings')).toBe(false);
  });

  it('8. tenant isolation preserved (private org tournament, list + detail both hidden)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');
    const list = await tournamentService.listPublic();
    expect(list.some((t: any) => t.name === 'Private Only')).toBe(false);
    const [rows] = await pool.execute<RowData>(`SELECT id FROM tournaments WHERE name = 'Private Only' LIMIT 1`);
    await expect(tournamentService.getPublicTournament(Number((rows as any[])[0].id))).rejects.toThrow();
  });

  it('9. global auth middleware short-circuits /public/… (no token required)', async () => {
    const { authMiddleware } = await import('../../../shared/middleware/auth.middleware.js');
    const reply: any = { status: vi.fn(() => ({ send: vi.fn() })) };
    const result = await authMiddleware({ url: '/public/tournaments' } as any, reply);
    expect(result).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('10. public router registers the endpoints with NO permission guard', async () => {
    const { publicTournamentRoutes } = await import('../presentation/public-tournament.routes.js');
    const calls: Array<{ path: string; opts: any }> = [];
    const fakeApp: any = { get: (path: string, opts: any, handler?: any) => calls.push({ path, opts: opts?.preHandler }) };
    await publicTournamentRoutes(fakeApp);
    expect(calls.map((c) => c.path).sort()).toEqual(['/public/tournaments', '/public/tournaments/:id']);
    for (const c of calls) expect(c.opts).toBeUndefined(); // no requirePermission preHandler
  });
});