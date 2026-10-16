import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * P1-01 regression — CRM "Customer 360" tournament-registration columns.
 *
 * The authoritative schema `database/baseline/001_courtzon_v3.sql` defines
 * `tournament_registrations` with `player_id` (FK `fk_reg_player` ->
 * `users(id)`) and the registration timestamp `registered_at`. It has NO
 * `user_id` and NO `created_at` column. The CRM controller previously queried
 * `tr.user_id` / `WHERE user_id = ?` and `MAX(created_at)`, which made three
 * admin endpoints fail at runtime with MySQL ER_BAD_FIELD_ERROR (1054).
 *
 * These tests are mocked-DB / source-level only and touch no database:
 *   1. every SQL statement the three handlers issue against
 *      `tournament_registrations` uses the real schema columns;
 *   2. the handlers still return their documented response shapes and carry
 *      the registration count / timestamp through;
 *   3. the columns the handlers rely on exist in the authoritative baseline.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const baselinePath = resolve(repoRoot, 'database/baseline/001_courtzon_v3.sql');
const baseline = readFileSync(baselinePath, 'utf8');

const pool = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

import {
  listCustomersHandler,
  getCustomerHandler,
  getCustomerTimelineHandler,
} from '../presentation/crm.controller.js';

interface CapturedCall {
  sql: string;
  params: unknown[];
}

function makeReply() {
  return {
    statusCode: 200,
    payload: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: any) {
      this.payload = payload;
      return this;
    },
  };
}

function allCalls(): CapturedCall[] {
  return [...pool.execute.mock.calls, ...pool.query.mock.calls].map(([sql, params]) => ({
    sql: String(sql),
    params: (params ?? []) as unknown[],
  }));
}

function registrationCalls(): CapturedCall[] {
  return allCalls().filter((call) => call.sql.includes('tournament_registrations'));
}

beforeEach(() => {
  vi.clearAllMocks();

  pool.execute.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('SELECT COUNT(*) AS total FROM users')) return [[{ total: 1 }]];
    if (s.includes('SELECT MAX(greatest(')) return [[{ last_activity: '2026-02-03 09:00:00' }]];
    if (s.includes('FROM tournament_registrations WHERE player_id')) return [[{ total: 2 }]];
    if (s.includes('FROM users WHERE id')) {
      return [[{
        id: 7, first_name: 'Nadia', last_name: 'Ali', email: 'nadia@example.com',
        phone: '000', is_active: 1, created_at: '2025-01-01 00:00:00',
      }]];
    }
    if (s.includes('FROM bookings WHERE user_id')) return [[{ total: 3, cancelled: 1, completed: 2 }]];
    if (s.includes('FROM orders WHERE user_id')) return [[{ total: 2, total_spent: 150 }]];
    if (s.includes('FROM wallet_transactions')) return [[{ total_deposits: 500, total_withdrawn: 100 }]];
    if (s.includes('FROM academy_enrollments WHERE player_id')) return [[{ total: 4 }]];
    if (s.includes('FROM league_teams WHERE user_id')) return [[{ total: 1 }]];
    return [[]];
  });

  pool.query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('total_tournaments')) {
      return [[{ id: 7, first_name: 'Nadia', total_tournaments: 2, last_activity: '2026-02-03 09:00:00' }]];
    }
    if (s.includes("'tournament_registration'")) {
      return [[{
        created_at: '2026-01-05 08:00:00', type: 'tournament_registration',
        ref_id: 55, ref_status: 'confirmed', ref_amount: null,
      }]];
    }
    return [[]];
  });
});

describe('GET /admin/crm/customers (listCustomersHandler)', () => {
  it('returns the paginated customer list including the per-customer tournament count', async () => {
    const reply = makeReply();
    await listCustomersHandler({ query: {} } as any, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload.data).toHaveLength(1);
    expect(reply.payload.data[0].total_tournaments).toBe(2);
    expect(reply.payload.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('counts registrations by player_id (never the removed user_id column)', async () => {
    await listCustomersHandler({ query: {} } as any, makeReply());

    const calls = registrationCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('FROM tournament_registrations tr WHERE tr.player_id = u.id');
    expect(calls[0].sql).not.toContain('tr.user_id');
  });
});

describe('GET /admin/crm/customers/:id (getCustomerHandler)', () => {
  it('returns the customer summary with the registration total', async () => {
    const reply = makeReply();
    await getCustomerHandler({ params: { id: '7' } } as any, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload.data.id).toBe(7);
    expect(reply.payload.data.tournaments).toEqual({ total: 2 });
    expect(reply.payload.data.enrollments).toEqual({ total: 4 });
  });

  it('reads the count by player_id and the last activity by registered_at', async () => {
    await getCustomerHandler({ params: { id: '7' } } as any, makeReply());

    const regSqls = registrationCalls().map((call) => call.sql);
    expect(regSqls).toHaveLength(2);

    const countSql = regSqls.find((s) => s.includes('SELECT COUNT(*) AS total'))!;
    expect(countSql).toContain('FROM tournament_registrations WHERE player_id = ?');
    expect(countSql).not.toContain('user_id');

    const lastActivitySql = regSqls.find((s) => s.includes('MAX('))!;
    expect(lastActivitySql).toContain('MAX(registered_at) FROM tournament_registrations WHERE player_id = ?');
    expect(lastActivitySql).not.toContain('MAX(created_at) FROM tournament_registrations');
    expect(lastActivitySql).not.toContain('tournament_registrations WHERE user_id');
  });
});

describe('GET /admin/crm/customers/:id/timeline (getCustomerTimelineHandler)', () => {
  it('returns the timeline rows, including the tournament-registration entry', async () => {
    const reply = makeReply();
    await getCustomerTimelineHandler({ params: { id: '7' }, query: {} } as any, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload.data).toEqual([
      {
        created_at: '2026-01-05 08:00:00', type: 'tournament_registration',
        ref_id: 55, ref_status: 'confirmed', ref_amount: null,
      },
    ]);
  });

  it("selects registered_at for the tournament_registration branch and filters by player_id", async () => {
    await getCustomerTimelineHandler({ params: { id: '7' }, query: {} } as any, makeReply());

    const unionSql = registrationCalls()[0].sql;
    const regLine = unionSql.split('\n').find((line) => line.includes('tournament_registrations'))!;
    expect(regLine).toContain(
      "SELECT registered_at, 'tournament_registration', id, status, NULL FROM tournament_registrations WHERE player_id = ?",
    );
    expect(regLine).not.toContain('user_id');
    expect(regLine).not.toContain('created_at');
  });
});

describe('authoritative schema contract (database/baseline/001_courtzon_v3.sql)', () => {
  const start = baseline.indexOf('CREATE TABLE `tournament_registrations`');
  const end = baseline.indexOf(') ENGINE=InnoDB', start);
  const block = baseline.slice(start, end);

  it('tournament_registrations exposes player_id + registered_at and NOT user_id/created_at', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('`player_id`');
    expect(block).toContain('`registered_at`');
    expect(block).not.toContain('`user_id`');
    expect(block).not.toContain('`created_at`');
  });

  it('player_id is the FK to users(id) — the relationship the CRM handlers rely on', () => {
    expect(block).toContain(
      'CONSTRAINT `fk_reg_player` FOREIGN KEY (`player_id`) REFERENCES `users` (`id`)',
    );
  });
});
