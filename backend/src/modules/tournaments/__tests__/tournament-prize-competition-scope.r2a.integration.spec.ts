import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3012';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
type RowData = RowDataPacket[];

/**
 * R2-a — competition-scoped tournament prizes (integration).
 *
 * Verifies the AUTHORITATIVE write path + schema, not the service:
 *   * an explicitly supplied competition_id is persisted verbatim;
 *   * an omitted competition_id is defaulted by the BEFORE-INSERT trigger to
 *     the tournament's default competition (legacy behavior preserved);
 *   * the SAME ranked cash placement is allowed in two different competitions
 *     (mirrors `uk_tprize_cash_competition_placement`);
 *   * a duplicate ranked cash placement within the SAME competition is rejected
 *     by the DB unique rule (the service surfaces this as a clean 4xx first).
 */

const ORG = 2680001;
const OWNER = 2680029;
let pool: mysql.Pool;
const tournamentIds: number[] = [];

async function seedBase() {
  const [ot] = await pool.query<RowData>('SELECT id FROM organisation_types ORDER BY id LIMIT 1');
  const otId = Number((ot as any[])[0]?.id ?? 1);
  await pool.execute(
    `INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, UUID(), ?, 1, 'R2a Org', 'r2a-org', 1)`,
    [ORG, otId],
  );
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, '01090000028', '+201090000028', 'r2a-owner@test.com', '$2b$10$x', 'R2a Owner', 'male', 'active')`,
    [OWNER],
  );
}

async function createTournament(): Promise<{ tid: number; def: number; second: number }> {
  const [res] = await pool.execute<RowData>(
    `INSERT INTO tournaments
       (public_id, creator_id, organisation_id, bracket_type_id, format, name, max_participants,
        min_participants, entry_fee, registration_fee, currency_code, price_type, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, 1, 'knockout', 'R2a Prize', 8, 2, 0, 0, 'EGP', 'FREE', 'community',
        0, 'draft', 1, '2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30')`,
    [OWNER, ORG],
  );
  const tid = Number((res as any).insertId);
  tournamentIds.push(tid);
  const [d] = await pool.execute<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', 'EGP', 1)`,
    [tid],
  );
  const [s] = await pool.execute<RowData>(
    `INSERT INTO tournament_competitions (public_id, tournament_id, competition_type, name, currency_code, is_default)
     VALUES (UUID(), ?, 'doubles', 'Second', 'EGP', 0)`,
    [tid],
  );
  return { tid, def: Number((d as any).insertId), second: Number((s as any).insertId) };
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 4 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await seedBase();
}, 60000);

afterAll(async () => {
  for (const tid of tournamentIds) {
    try { await pool.execute('DELETE FROM tournaments WHERE id = ?', [tid]); } catch { /* best-effort cleanup */ }
  }
  try { await pool.execute('DELETE FROM organisations WHERE id = ?', [ORG]); } catch { /* best-effort cleanup */ }
  try { await pool.execute('DELETE FROM users WHERE id = ?', [OWNER]); } catch { /* best-effort cleanup */ }
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 60000);

describe('R2-a — tournament prize competition scope (integration)', () => {
  it('persists explicit competition_id and defaults omitted rows to the default competition (trigger)', async () => {
    const { tid, def, second } = await createTournament();
    await tournamentRepository.replacePrizes(tid, [
      { placement: 1, prize_type: 'cash', amount: 100, currency_code: 'EGP', competition_id: second },
      { placement: 3, prize_type: 'cash', amount: 50, currency_code: 'EGP' },
    ]);
    const [rows] = await pool.execute<RowData>(
      'SELECT placement, competition_id FROM tournament_prizes WHERE tournament_id = ? ORDER BY placement',
      [tid],
    );
    const map = Object.fromEntries((rows as any[]).map((r) => [Number(r.placement), Number(r.competition_id)]));
    expect(map[1]).toBe(second);
    expect(map[3]).toBe(def);
  });

  it('allows the same cash placement in two different competitions', async () => {
    const { tid, def, second } = await createTournament();
    await tournamentRepository.replacePrizes(tid, [
      { placement: 1, prize_type: 'cash', amount: 100, currency_code: 'EGP', competition_id: def },
      { placement: 1, prize_type: 'cash', amount: 200, currency_code: 'EGP', competition_id: second },
    ]);
    const [rows] = await pool.execute<RowData>(
      'SELECT competition_id FROM tournament_prizes WHERE tournament_id = ? AND placement = 1',
      [tid],
    );
    expect((rows as any[]).length).toBe(2);
  });

  it('rejects a duplicate cash placement within the same competition (DB unique rule)', async () => {
    const { tid, second } = await createTournament();
    await expect(tournamentRepository.replacePrizes(tid, [
      { placement: 2, prize_type: 'cash', amount: 100, currency_code: 'EGP', competition_id: second },
      { placement: 2, prize_type: 'cash', amount: 200, currency_code: 'EGP', competition_id: second },
    ])).rejects.toThrow();
  });
});
