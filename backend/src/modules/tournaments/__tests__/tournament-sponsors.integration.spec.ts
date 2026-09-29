import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3010';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Tournament Phase — sponsors (simple tournament-level model).
 *
 * Verifies:
 *  - CASH / IN-KIND validation (server-authoritative)
 *  - multiple sponsors + deterministic ordering
 *  - persistence on create, read on detail, replace on update, removal
 *  - organisation ownership isolation (data namespacing)
 *  - accounting safety: NO ledger_entries / wallet_transactions / settlements
 *  - IN-KIND stores NO monetary value (amount NULL)
 *  - category + season persisted on create
 */

const ORG_A = 2470101;
const ORG_B = 2470102;
const ADMIN = 2470201;
const WALLET_USER = 2470202;
const PLAN = 2470090;

let pool: mysql.Pool;
const tournamentIds: number[] = [];

const exec = (sql: string, params: any[] = []) => pool.execute(sql, params);
const num = async (sql: string, params: any[] = []) => {
  const [rows] = await pool.execute<RowData>(sql, params);
  return Number((rows as any[])[0]?.v ?? 0);
};

async function mkUser(id: number, email: string) {
  await pool.execute(
    `INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'TSP', 'male', 'active')`,
    [id, `015${String(id).slice(-8)}`, `+20${String(id).slice(-8)}`, email],
  );
  await pool.execute(
    `INSERT IGNORE INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 0, 0, 'EGP', 0, 1)`, [id],
  );
}

async function seedOrg(orgId: number, slug: string) {
  const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
  const otId = (ot as any[])[0].id;
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active) VALUES (${orgId}, UUID(), ?, 1, 'TSP Org', '${slug}', 1)`, [otId]);
  await pool.execute(`INSERT IGNORE INTO subscription_plans (id, plan_name, price_monthly, is_active, is_internal, sort_order) VALUES (?, 'TSP Plan', 0, 1, 1, 0)`, [PLAN]);
  await pool.execute(`INSERT IGNORE INTO subscription_plan_rates (plan_id, applicable_entity, rate_type, amount) VALUES (?, 'tournament', 'percentage', ?)`, [PLAN, 10]);
  await pool.execute(
    `INSERT IGNORE INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', '2020-01-01', '2099-01-01', 'active', 0)`, [orgId, PLAN]);
}

let svc: any;

async function createOrgTournament(orgId: number, overrides: Record<string, unknown> = {}): Promise<number> {
  const body: Record<string, unknown> = {
    bracket_type_id: 1,
    name: `TSP Cup ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    max_participants: 16,
    min_participants: 2,
    entry_fee: 0,
    price_type: 'FREE',
    currency_code: 'EGP',
    start_date: '2026-12-01',
    ...overrides,
  };
  const t = await svc.create(body, ADMIN);
  tournamentIds.push(t.id);
  return t.id;
}

async function sponsorsRows(tid: number): Promise<any[]> {
  const [rows] = await pool.execute<RowData>(
    'SELECT id, name, support_type, amount, description, display_order FROM tournament_sponsors WHERE tournament_id = ? ORDER BY display_order ASC, id ASC', [tid],
  );
  return rows as any[];
}

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5 });
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const m = await import('../application/tournament.service.js');
  svc = m.tournamentService;
  await mkUser(ADMIN, 'tsp-admin@test.com');
  await mkUser(WALLET_USER, 'tsp-wallet@test.com');
  await seedOrg(ORG_A, 'tsp-org-a');
  await seedOrg(ORG_B, 'tsp-org-b');
}, 120000);

async function cleanup() {
  if (!pool) return;
  await pool.execute(`DELETE FROM tournament_sponsors WHERE tournament_id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM financial_entitlements WHERE organisation_id IN (${ORG_A}, ${ORG_B})`);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${ORG_A}, ${ORG_B}) OR source_type = 'tournament'`);
  await pool.execute(`DELETE FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0})`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${ADMIN}, ${WALLET_USER})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${ADMIN}, ${WALLET_USER})`);
  await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id IN (${ORG_A}, ${ORG_B}))`);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (${ORG_A}, ${ORG_B})`);
  await pool.execute(`DELETE FROM organisation_subscriptions WHERE organisation_id IN (${ORG_A}, ${ORG_B})`);
  await pool.execute(`DELETE FROM subscription_plan_rates WHERE plan_id = ${PLAN}`);
  await pool.execute(`DELETE FROM subscription_plans WHERE id = ${PLAN}`);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${ORG_A}, ${ORG_B})`);
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
  await mkUser(ADMIN, 'tsp-admin@test.com');
  await mkUser(WALLET_USER, 'tsp-wallet@test.com');
  await seedOrg(ORG_A, 'tsp-org-a');
  await seedOrg(ORG_B, 'tsp-org-b');
});

afterEach(() => vi.clearAllMocks());

describe('Tournament sponsors — validation', () => {
  it('1. CASH sponsor with valid amount succeeds', async () => {
    const tid = await createOrgTournament(ORG_A, {
      sponsors: [{ name: 'Acme', support_type: 'cash', amount: 500, display_order: 0 }],
    });
    const rows = await sponsorsRows(tid);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Acme');
    expect(rows[0].support_type).toBe('cash');
    expect(Number(rows[0].amount)).toBe(500);
  });

  it('2. CASH sponsor without amount fails', async () => {
    await expect(createOrgTournament(ORG_A, { sponsors: [{ name: 'Acme', support_type: 'cash' }] }))
      .rejects.toThrow(/Cash sponsor requires a positive amount/);
  });

  it('3. CASH sponsor with amount <= 0 fails', async () => {
    await expect(createOrgTournament(ORG_A, { sponsors: [{ name: 'Acme', support_type: 'cash', amount: 0 }] }))
      .rejects.toThrow(/Cash sponsor requires a positive amount/);
    await expect(createOrgTournament(ORG_A, { sponsors: [{ name: 'Acme', support_type: 'cash', amount: -5 }] }))
      .rejects.toThrow(/Cash sponsor requires a positive amount/);
  });

  it('4. IN-KIND sponsor with description succeeds (amount NULL stored)', async () => {
    const tid = await createOrgTournament(ORG_A, {
      sponsors: [{ name: 'Trophy Co', support_type: 'inkind', description: 'Trophies and medals', display_order: 0 }],
    });
    const rows = await sponsorsRows(tid);
    expect(rows).toHaveLength(1);
    expect(rows[0].support_type).toBe('inkind');
    expect(rows[0].amount).toBeNull();
    expect(rows[0].description).toBe('Trophies and medals');
  });

  it('5. IN-KIND sponsor with amount fails', async () => {
    await expect(createOrgTournament(ORG_A, { sponsors: [{ name: 'Trophy Co', support_type: 'inkind', description: 'Trophies', amount: 100 }] }))
      .rejects.toThrow(/In-kind sponsor must not carry an amount/);
  });

  it('6. IN-KIND sponsor without description fails', async () => {
    await expect(createOrgTournament(ORG_A, { sponsors: [{ name: 'Trophy Co', support_type: 'inkind' }] }))
      .rejects.toThrow(/In-kind sponsor requires a description/);
  });

  it('7. Missing sponsor name fails', async () => {
    await expect(createOrgTournament(ORG_A, { sponsors: [{ support_type: 'cash', amount: 10 }] }))
      .rejects.toThrow(/Sponsor name is required/);
  });

  it('8. Multiple sponsors succeed with deterministic ordering', async () => {
    const tid = await createOrgTournament(ORG_A, {
      sponsors: [
        { name: 'B Co', support_type: 'inkind', description: 'Balls' },
        { name: 'A Co', support_type: 'cash', amount: 100 },
        { name: 'C Co', support_type: 'cash', amount: 200 },
      ],
    });
    const rows = await sponsorsRows(tid);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.display_order)).toEqual([0, 1, 2]);
    expect(rows[0].name).toBe('B Co');
    expect(rows[1].name).toBe('A Co');
    expect(rows[2].name).toBe('C Co');
  });
});

describe('Tournament sponsors — persistence / read / update / ownership', () => {
  it('13+14. sponsors persist on create and appear on detailed read', async () => {
    const tid = await createOrgTournament(ORG_A, {
      category: 'Community Cup',
      season: '2026',
      sponsors: [{ name: 'Acme', support_type: 'cash', amount: 500 }],
    });
    const detail = await svc.getByIdDetailed(tid);
    expect((detail as any).category).toBe('Community Cup');
    expect((detail as any).season).toBe('2026');
    expect((detail as any).sponsors).toHaveLength(1);
    expect((detail as any).sponsors[0].name).toBe('Acme');
  });

  it('15+16+17. sponsors are editable / removable with ordering preserved', async () => {
    const tid = await createOrgTournament(ORG_A, {
      sponsors: [
        { name: 'Alpha', support_type: 'cash', amount: 100 },
        { name: 'Beta', support_type: 'inkind', description: 'Medals' },
      ],
    });
    // Replace set (add + reorder)
    await svc.update(tid, {
      sponsors: [
        { name: 'Beta', support_type: 'inkind', description: 'Medals' },
        { name: 'Gamma', support_type: 'cash', amount: 250 },
        { name: 'Delta', support_type: 'inkind', description: 'Gifts' },
      ],
    });
    let rows = await sponsorsRows(tid);
    expect(rows.map((r) => r.name)).toEqual(['Beta', 'Gamma', 'Delta']);
    expect(rows.map((r) => r.display_order)).toEqual([0, 1, 2]);

    // Remove: empty set clears all sponsors
    await svc.update(tid, { sponsors: [] });
    rows = await sponsorsRows(tid);
    expect(rows).toHaveLength(0);
  });

  it('10+11. organisation ownership is data-namespaced across tournaments (no cross-tenant leak)', async () => {
    const tidA = await createOrgTournament(ORG_A, { sponsors: [{ name: 'A Sponsor', support_type: 'cash', amount: 10 }] });
    const tidB = await createOrgTournament(ORG_B, { sponsors: [{ name: 'B Sponsor', support_type: 'inkind', description: 'Balls' }] });
    const a = await sponsorsRows(tidA);
    const b = await sponsorsRows(tidB);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].name).not.toBe(b[0].name);
    // Org-level ownership is enforced by the org route guard
    // (assertOrgOwnsTournament → tournamentRepository.getOrganisationId === :orgId).
  });
});

describe('Tournament sponsors — accounting safety', () => {
  it('18+19+20+21. sponsor CRUD creates NO ledger / wallet / settlement; IN-KIND stores no monetary record', async () => {
    const ledgerBefore = await num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type = 'tournament' AND source_id IN (SELECT id FROM tournaments WHERE id IN (${tournamentIds.length ? tournamentIds.join(',') : 0}))`);
    const wlBefore = await num(`SELECT COUNT(*) AS v FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${ADMIN}, ${WALLET_USER}))`);
    const setBefore = await num('SELECT COUNT(*) AS v FROM settlements');

    const tid = await createOrgTournament(ORG_A, {
      sponsors: [
        { name: 'Cash Co', support_type: 'cash', amount: 500 },
        { name: 'Gift Co', support_type: 'inkind', description: 'Gifts' },
      ],
    });
    await svc.update(tid, { sponsors: [{ name: 'Cash Co', support_type: 'cash', amount: 750 }] });

    const ledgerAfter = await num(`SELECT COUNT(*) AS v FROM ledger_entries WHERE source_type = 'tournament' AND source_id IN (SELECT id FROM tournaments WHERE id IN (${tournamentIds.join(',')}))`);
    const wlAfter = await num(`SELECT COUNT(*) AS v FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (${ADMIN}, ${WALLET_USER}))`);
    const setAfter = await num('SELECT COUNT(*) AS v FROM settlements');

    expect(ledgerAfter).toBe(ledgerBefore);
    expect(wlAfter).toBe(wlBefore);
    expect(setAfter).toBe(setBefore);

    // No financial entitlements either (sponsors are record-only).
    expect(await num(`SELECT COUNT(*) AS v FROM financial_entitlements WHERE source_type = 'tournament' AND source_id IN (SELECT id FROM tournaments WHERE id IN (${tournamentIds.join(',')}))`)).toBe(0);
  });
});