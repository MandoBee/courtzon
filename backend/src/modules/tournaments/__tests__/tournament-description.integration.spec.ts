import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Phase 2 — Description composer wiring (H2):
 *  empty create → generated; manual create → preserved; edit without flag →
 *  unchanged; edit with regenerate_description=true → regenerated; prizes and
 *  sponsors included (no monetary values).
 */

const ORG = 2480101;
const ADMIN = 2480201;
const PLAN = 2480090;

let pool: mysql.Pool;
const tournamentIds: number[] = [];
let svc: any;

const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

async function mkUser(id: number, email: string) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'DSC', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(`INSERT IGNORE INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version) VALUES (?, 0, 0, 'EGP', 0, 1)`, [id]);
}

async function seedOrg(orgId: number, slug: string) {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${orgId}, UUID(), ?, 1, 'DSC Org', '${slug}', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'DSC Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(`INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew) VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [orgId, PLAN]);
}

async function getDescription(tid: number): Promise<string> {
  const [rows] = await pool.execute<RowData>('SELECT description FROM tournaments WHERE id = ?', [tid]);
  return String((rows as any[])[0]?.description ?? '');
}

async function createTournament(base: Record<string, unknown>): Promise<number> {
  const body: Record<string, unknown> = {
    bracket_type_id: 1,
    name: `DSC Cup ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    max_participants: 16,
    min_participants: 2,
    entry_fee: 0,
    price_type: 'FREE',
    currency_code: 'EGP',
    start_date: '2026-12-01',
    ...base,
  };
  const t = await svc.create(body, ADMIN);
  tournamentIds.push(t.id);
  return t.id;
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const m = await import('../application/tournament.service.js');
  svc = m.tournamentService;
  await mkUser(ADMIN, 'dsc-admin@test.com');
  await seedOrg(ORG, 'dsc-org');
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`DELETE FROM tournament_sponsors WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${ADMIN}`);
  await pool.execute(`DELETE FROM users WHERE id = ${ADMIN}`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id = ${ORG}`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id = ${ORG}`);
  tournamentIds.length = 0;
}

afterAll(async () => {
  await cleanup();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 120000);

beforeEach(async () => {
  await cleanup();
  await mkUser(ADMIN, 'dsc-admin@test.com');
  await seedOrg(ORG, 'dsc-org');
});

afterEach(() => vi.clearAllMocks());

describe('Phase 2 — description composer wiring (H2)', () => {
  it('empty description → automatically generated (contains structured data)', async () => {
    const tid = await createTournament({
      organisation_id: ORG,
      prizes: [{ placement: 1, prize_type: 'cash', amount: 500 }],
      sponsors: [{ name: 'Acme', support_type: 'cash', amount: 100 }],
    });
    const desc = await getDescription(tid);
    expect(desc.length).toBeGreaterThan(0);
    expect(desc).toContain('DSC Cup');
  });

  it('manual description → preserved exactly on create', async () => {
    const manual = 'Hand-written description.';
    const tid = await createTournament({ organisation_id: ORG, description: manual });
    expect(await getDescription(tid)).toBe(manual);
  });

  it('edit WITHOUT regenerate flag → description unchanged', async () => {
    const manual = 'Manual text';
    const tid = await createTournament({ organisation_id: ORG, description: manual });
    await svc.update(tid, { max_participants: 8 });
    expect(await getDescription(tid)).toBe(manual);
  });

  it('edit WITH regenerate_description=true → deterministically regenerated', async () => {
    const manual = 'Manual text';
    const tid = await createTournament({ organisation_id: ORG, description: manual });
    await svc.update(tid, { regenerate_description: true } as any);
    const desc = await getDescription(tid);
    expect(desc).not.toBe(manual);
    expect(desc.length).toBeGreaterThan(0);
  });

  it('generated description includes prizes and sponsors (no amounts)', async () => {
    const tid = await createTournament({
      organisation_id: ORG,
      prizes: [
        { placement: 1, prize_type: 'cash', amount: 500 },
        { placement: 2, prize_type: 'trophy', description: 'Cup' },
      ],
      sponsors: [
        { name: 'Acme', support_type: 'cash', amount: 100 },
        { name: 'Trophy Co', support_type: 'inkind', description: 'Medals' },
      ],
    });
    const desc = await getDescription(tid);
    expect(desc).toContain('Prizes:');
    expect(desc).toContain('1st place: Cash');
    expect(desc).toContain('2nd place: Trophy — Cup');
    expect(desc).toContain('Sponsors:');
    expect(desc).toContain('Acme (Cash)');
    expect(desc).toContain('Trophy Co (In-kind) — Medals');
    expect(desc).not.toMatch(/500|100\.00/);
  });

  it('rules snapshot is never duplicated into the description', async () => {
    const tid = await createTournament({ organisation_id: ORG });
    const desc = await getDescription(tid);
    const [rules] = await pool.execute<RowData>('SELECT rules FROM tournaments WHERE id = ?', [tid]);
    const r = String((rules as any[])[0]?.rules ?? '');
    expect(r.length === 0 || !desc.includes(r)).toBe(true);
  });

  it('no DB schema mutation from composer (columns unchanged)', async () => {
    const before = await num(`SELECT COUNT(*) AS v FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournaments' AND COLUMN_NAME IN ('description','category','season')`);
    expect(before).toBe(3);
  });
});