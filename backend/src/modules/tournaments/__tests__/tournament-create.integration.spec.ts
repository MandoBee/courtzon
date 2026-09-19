// ============================================================================
// Tournament create — UAT blocker regression (integration, real MySQL schema).
//
// Reproduces the Super Admin platform create that returned HTTP 500:
//   ER_BAD_NULL_ERROR: Column 'registration_fee' cannot be null
//
// Proves against a THROWAWAY Testcontainers MySQL (full baseline + seeds):
//   A. Platform create (registration_fee omitted) succeeds → registration_fee
//      = 0.00, commission_rate = 0.00, organisation_id NULL.
//   B. Organisation create (registration_fee omitted) succeeds → organisation_id
//      is the authorized org, commission stays server-derived (a client-supplied
//      commission_rate can never override it).
//   C. A supplied registration_fee passes through unchanged.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, type TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool, closePool } from '../../../database/mysql.js';

let ctx: TestContext;
let pool: any;
let creatorId: number;
let orgId: number;
const stamp = Date.now().toString().slice(-8);
const createdTournamentIds: number[] = [];

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

  const { getPool } = await import('../../../database/mysql.js');
  pool = getPool();

  // The canonical fresh baseline may skip Padel sport rows while the sports
  // table is empty during import — insert idempotently to be faithful to UAT.
  await pool.execute('INSERT IGNORE INTO sports (id, name, slug) VALUES (22, ?, ?)', ['Padel', 'padel']);

  const [u] = await pool.execute(
    `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, 1, ?, ?, ?, 'x', ?, 'male')`,
    [randomUUID(), `5${stamp}`, `+9715${stamp}`, `tc_${stamp}@test.com`, `Tournament Creator ${stamp}`],
  );
  creatorId = (u as any).insertId;

  const [orgs] = await pool.execute<any[]>('SELECT id FROM organisations ORDER BY id LIMIT 1');
  if (!orgs.length) throw new Error('seed data missing: organisation');
  orgId = orgs[0].id;
}, 180000);

afterAll(async () => {
  try {
    if (createdTournamentIds.length) {
      await pool.query(`DELETE FROM tournaments WHERE id IN (${createdTournamentIds.map(() => '?').join(',')})`, createdTournamentIds);
    }
    if (creatorId) await pool.query('DELETE FROM users WHERE id = ?', [creatorId]);
  } finally {
    await closePool();
    await stopContainers();
  }
}, 30000);

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    bracket_type_id: 1, // Single Elimination
    format: 'knockout',
    sport_id: 22, // Padel
    name: `UAT Padel ${stamp}`,
    max_participants: 16,
    min_participants: 2,
    entry_fee: 800,
    currency_code: 'AED',
    price_type: 'FIXED',
    start_date: '2026-10-01',
    end_date: '2026-10-05',
    // registration_fee intentionally omitted — the reported UAT path.
    ...overrides,
  };
}

describe('Tournament create — registration_fee NOT NULL contract (UAT blocker)', () => {
  it('A. platform/super-admin create with registration_fee omitted succeeds (was HTTP 500)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const t = await tournamentService.create(basePayload(), creatorId);
    createdTournamentIds.push(t.id!);

    expect(t.id).toBeGreaterThan(0);
    const [rows] = await pool.query<any[]>('SELECT * FROM tournaments WHERE id = ?', [t.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].registration_fee).toBe('0.00');
    expect(rows[0].commission_rate).toBe('0.00');
    expect(rows[0].organisation_id).toBeNull();
    expect(rows[0].bracket_type_id).toBe(1);
    const sd = new Date(rows[0].start_date);
    const isoDate = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`;
    expect(isoDate).toBe('2026-10-01');
  });

  it('B. organisation create succeeds; commission stays server-derived (client cannot override)', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    // commission_rate: 99 is a client override attempt — the service must derive
    // it server-side (0 here because the seeded org has no subscription).
    const t = await tournamentService.create(
      basePayload({ organisation_id: orgId, commission_rate: 99 }),
      creatorId,
    );
    createdTournamentIds.push(t.id!);

    expect(t.id).toBeGreaterThan(0);
    const [rows] = await pool.query<any[]>('SELECT * FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].organisation_id).toBe(orgId);
    expect(rows[0].registration_fee).toBe('0.00');
    expect(rows[0].commission_rate).not.toBe('99.00');
    expect(rows[0].commission_rate).toBe('0.00');
  });

  it('C. a supplied registration_fee passes through unchanged', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const t = await tournamentService.create(basePayload({ registration_fee: 25 }), creatorId);
    createdTournamentIds.push(t.id!);

    const [rows] = await pool.query<any[]>('SELECT registration_fee FROM tournaments WHERE id = ?', [t.id]);
    expect(rows[0].registration_fee).toBe('25.00');
  });

  it('D. detail endpoint shape: enriched management detail (sport_name/max_players/type) on the real schema', async () => {
    const { tournamentService } = await import('../application/tournament.service.js');

    const t = await tournamentService.create(basePayload(), creatorId);
    createdTournamentIds.push(t.id!);

    const detail = await tournamentService.getByIdDetailed(t.id!);
    expect(detail.id).toBe(t.id);
    expect(detail.sport_name).toBe('Padel');
    expect(detail.max_players).toBe(16);
    expect(detail.max_participants).toBe(16);
    expect(detail.type).toBe('platform');
    expect(detail.organisation_name).toBeNull();
  });
});