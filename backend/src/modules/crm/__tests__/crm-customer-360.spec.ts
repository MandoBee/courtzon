import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CRM regression — authoritative schema contract.
 *
 * `database/baseline/001_courtzon_v3.sql` is the only schema authority. The CRM
 * controller must query the canonical columns:
 *   - users: full_name, phone_number, account_status (NOT first_name/last_name/phone/is_active)
 *   - orders: buyer_id, total (NOT user_id, total_amount)
 *   - bookings: booking_status (NOT status)
 *   - activity_logs: activity_type (NOT action)
 *   - league_teams: captain_id / player_ids (NOT user_id)
 *
 * These tests are mocked-DB / source-level only and touch no database. No mutating
 * endpoint is executed against a real database; the segment refresh path is exercised
 * against a fully mocked connection.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const baselinePath = resolve(repoRoot, 'database/baseline/001_courtzon_v3.sql');
const baseline = readFileSync(baselinePath, 'utf8');

const pool = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  getConnection: vi.fn(),
}));
const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

import {
  listCustomersHandler,
  getCustomerHandler,
  getCustomerTimelineHandler,
  listSegmentsHandler,
  listLeadsHandler,
  listCampaignsHandler,
  listCommunicationsHandler,
  getCRMDashboardHandler,
  refreshSegmentHandler,
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

function callsMatching(needle: string): CapturedCall[] {
  return allCalls().filter((call) => call.sql.includes(needle));
}

function registrationCalls(): CapturedCall[] {
  return allCalls().filter((call) => call.sql.includes('tournament_registrations'));
}

beforeEach(() => {
  vi.clearAllMocks();

  pool.getConnection.mockResolvedValue(conn);
  conn.beginTransaction.mockResolvedValue(undefined);
  conn.execute.mockResolvedValue([[], []]);
  conn.commit.mockResolvedValue(undefined);
  conn.rollback.mockResolvedValue(undefined);
  conn.release.mockReturnValue(undefined);

  pool.execute.mockImplementation(async (sql: string) => {
    const s = String(sql);

    if (s.includes('SELECT COUNT(*) AS total FROM users')) return [[{ total: 1 }]];
    if (s.includes('SELECT MAX(greatest(')) return [[{ last_activity: '2026-02-03 09:00:00' }]];

    // Dashboard aggregates
    if (s.includes('SELECT COUNT(*) AS total FROM marketing_campaigns')) return [[{ total: 5 }]];
    if (s.includes('SELECT COUNT(*) AS total FROM customer_segments WHERE is_active')) return [[{ total: 2 }]];
    if (s.includes('SELECT status, COUNT(*) AS count FROM leads GROUP BY status')) {
      return [[
        { status: 'new', count: 3 },
        { status: 'qualified', count: 2 },
        { status: 'converted', count: 1 },
        { status: 'lost', count: 4 },
      ]];
    }

    // Customer 360 detail
    if (s.includes('FROM users WHERE id = ? AND deleted_at IS NULL')) {
      return [[{
        id: 7, public_id: 'uuid-7', full_name: 'Nadia Ali', email: 'nadia@example.com',
        phone: '000', avatar_url: null, country_id: 1, gender: 'female', account_status: 'active',
        is_phone_verified: 1, is_email_verified: 1, has_activated_selling: 0,
        last_login_at: '2026-02-01 09:00:00', created_at: '2025-01-01 00:00:00',
        updated_at: '2026-02-01 09:00:00',
      }]];
    }
    if (s.includes('FROM bookings WHERE user_id')) return [[{ total: 3, cancelled: 1, completed: 2 }]];
    if (s.includes('FROM orders WHERE buyer_id')) return [[{ total: 2, total_spent: 150 }]];
    if (s.includes('FROM user_wallets uw')) {
      return [[{ total_deposits: 500, total_withdrawn: 100, wallet_balance: 400 }]];
    }
    if (s.includes('FROM academy_enrollments WHERE player_id')) return [[{ total: 4 }]];
    if (s.includes('FROM tournament_registrations WHERE player_id')) return [[{ total: 2 }]];
    if (s.includes('FROM league_teams')) return [[{ total: 1 }]];

    // Segment refresh construction (read + mocked transaction only)
    if (s.includes('SELECT * FROM customer_segments WHERE id')) {
      return [[{
        id: 5,
        name: 'Has Orders',
        rules_json: JSON.stringify({
          operator: 'and',
          conditions: [{ field: 'has_order' }, { field: 'is_active', value: true }],
        }),
      }]];
    }
    if (s.includes('SELECT u.id FROM users u WHERE')) return [[{ id: 1 }]];
    if (s.includes('SELECT id FROM users')) return [[{ id: 1 }]];

    // List handlers
    if (s.includes('FROM customer_segments cs')) {
      return [[{ id: 1, name: 'VIP', description: null, member_count: 3, is_active: 1, creator_full_name: 'Admin User' }]];
    }
    if (s.includes('FROM leads l')) {
      return [[{
        id: 2, full_name: 'Lead One', email: 'lead@example.com', phone: '123', source: 'manual',
        status: 'new', assigned_to: 7, assigned_full_name: 'Admin User',
        creator_full_name: 'Admin User', created_at: '2026-01-01 00:00:00',
      }]];
    }
    if (s.includes('FROM marketing_campaigns mc')) {
      return [[{
        id: 3, name: 'Spring', description: null, type: 'email', status: 'draft',
        segment_id: 1, segment_name: 'VIP', scheduled_at: null, creator_full_name: 'Admin User',
      }]];
    }
    if (s.includes('FROM communication_log cl')) {
      return [[{
        id: 4, user_id: 7, user_name: 'Nadia Ali', user_email: 'nadia@example.com',
        channel: 'email', direction: 'outbound', subject: 'Welcome', status: 'sent',
        created_at: '2026-02-01 10:00:00',
      }]];
    }

    return [[]];
  });

  pool.query.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('total_tournaments')) {
      return [[{
        id: 7, full_name: 'Nadia Ali', email: 'nadia@example.com', phone: '000',
        total_bookings: 3, total_orders: 2, total_enrollments: 4, total_tournaments: 2,
        last_activity: '2026-02-03 09:00:00',
      }]];
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

  it('queries the canonical users/orders columns and excludes soft-deleted users', async () => {
    await listCustomersHandler({ query: {} } as any, makeReply());

    const userSql = callsMatching('SELECT u.id, u.full_name')[0].sql;
    expect(userSql).toContain('u.full_name');
    expect(userSql).toContain('u.phone_number AS phone');
    expect(userSql).toContain("(u.account_status = 'active') AS is_active");
    expect(userSql).toContain('o.buyer_id = u.id');
    expect(userSql).toContain('u.deleted_at IS NULL');
    expect(userSql).not.toContain('first_name');
    expect(userSql).not.toContain('last_name');
    expect(userSql).not.toContain('u.is_active');
    expect(userSql).not.toContain('o.user_id');
  });

  it('binds the search placeholder count correctly (3 LIKE params + limit + offset)', async () => {
    await listCustomersHandler({ query: { search: 'nad' } } as any, makeReply());

    const mainCall = pool.query.mock.calls[0];
    expect(String(mainCall[0])).toContain('u.full_name LIKE ?');
    expect(String(mainCall[0])).toContain('u.phone_number LIKE ?');
    expect((mainCall[1] as unknown[]).length).toBe(5);
  });

  it('exposes the response fields consumed by CustomerListPage', async () => {
    const reply = makeReply();
    await listCustomersHandler({ query: {} } as any, reply);

    const row = reply.payload.data[0];
    expect(row.full_name).toBe('Nadia Ali');
    expect(row.phone).toBe('000');
    expect(row.total_bookings).toBe(3);
    expect(row.total_orders).toBe(2);
  });

  it('keeps the customer-list SQL ONLY_FULL_GROUP_BY safe (no outer MAX aggregate)', async () => {
    await listCustomersHandler({ query: {} } as any, makeReply());

    // Identify the main list query without relying on mock call ordering.
    const mainCall = pool.query.mock.calls.find(([sql]) => {
      const text = String(sql);
      return text.includes('FROM users u') && text.includes('LIMIT ? OFFSET ?');
    });
    expect(mainCall).toBeDefined();
    const mainSql = String(mainCall![0]);

    // last_activity uses a scalar GREATEST, not the redundant outer MAX aggregate.
    expect(mainSql).toContain('greatest(');
    expect(mainSql).not.toContain('MAX(greatest(');

    // Correlated COUNT/MAX subqueries must remain intact.
    expect(mainSql).toContain('(SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id)');
    expect(mainSql).toContain('(SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id)');
    expect(mainSql).toContain('(SELECT MAX(b.created_at) FROM bookings b WHERE b.user_id = u.id)');
    expect(mainSql).toContain('(SELECT MAX(o.created_at) FROM orders o WHERE o.buyer_id = u.id)');

    // Pagination and sorting clauses are preserved.
    expect(mainSql).toContain('ORDER BY u.created_at DESC');
    expect(mainSql).toContain('LIMIT ? OFFSET ?');
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

  it('selects only the approved users allowlist and never secrets', async () => {
    await getCustomerHandler({ params: { id: '7' } } as any, makeReply());

    const userSql = callsMatching('FROM users WHERE id = ?')[0].sql;
    expect(userSql).toContain('full_name');
    expect(userSql).toContain('phone_number AS phone');
    expect(userSql).toContain('account_status');
    expect(userSql).not.toContain('SELECT *');
    expect(userSql).not.toContain('password_hash');
    expect(userSql).not.toContain('last_login_ip');
    expect(userSql).not.toContain('full_phone');

    const allSql = allCalls().map((c) => c.sql).join('\n');
    expect(allSql).not.toContain('password_hash');
    expect(allSql).not.toContain('last_login_ip');
  });

  it('uses canonical booking/order/league-team columns', async () => {
    await getCustomerHandler({ params: { id: '7' } } as any, makeReply());

    const allSql = allCalls().map((c) => c.sql).join('\n');
    expect(allSql).toContain("booking_status = 'cancelled'");
    expect(allSql).toContain('FROM orders WHERE buyer_id = ?');
    expect(allSql).toContain('COALESCE(SUM(total), 0)');
    expect(allSql).toContain('captain_id = ?');
    expect(allSql).toContain("JSON_CONTAINS(player_ids, CAST(? AS JSON), '$')");
    expect(allSql).not.toContain('total_amount');
    expect(allSql).not.toContain('league_teams WHERE user_id');
  });

  it('returns the flat aggregate fields and phone expected by CustomerDetailPage', async () => {
    const reply = makeReply();
    await getCustomerHandler({ params: { id: '7' } } as any, reply);

    const data = reply.payload.data;
    expect(data.full_name).toBe('Nadia Ali');
    expect(data.phone).toBe('000');
    expect(data.total_bookings).toBe(3);
    expect(data.total_orders).toBe(2);
    expect(data.wallet_balance).toBe(400);
    expect(data.total_enrollments).toBe(4);
    expect(data).not.toHaveProperty('password_hash');
    expect(data).not.toHaveProperty('last_login_ip');
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

  it('uses canonical booking_status, buyer_id, total and activity_type', async () => {
    await getCustomerTimelineHandler({ params: { id: '7' }, query: {} } as any, makeReply());

    const unionSql = allCalls().find((c) => c.sql.includes("'wallet_transaction'"))!.sql;
    expect(unionSql).toContain('booking_status AS ref_status');
    expect(unionSql).toContain("'order', id, status, total FROM orders WHERE buyer_id = ?");
    expect(unionSql).toContain("'activity_log', id, activity_type, NULL FROM activity_logs WHERE user_id = ?");
    expect(unionSql).not.toContain('total_amount');
    expect(unionSql).not.toContain("id, action, NULL FROM activity_logs");
  });
});

describe('GET /admin/crm/dashboard (getCRMDashboardHandler)', () => {
  it('returns leadsByStatus in the shape consumed by CRMDashboardPage', async () => {
    const reply = makeReply();
    await getCRMDashboardHandler({} as any, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload.data.leadsByStatus).toEqual({ new: 3, qualified: 2, converted: 1, lost: 4 });
    expect(reply.payload.data.totalCustomers).toBe(1);
    expect(reply.payload.data.activeCampaigns).toBe(5);
    expect(reply.payload.data.activeSegments).toBe(2);
  });

  it('joins the assignee by full_name (no legacy name columns)', async () => {
    await getCRMDashboardHandler({} as any, makeReply());

    const recentLeadsSql = callsMatching('FROM leads l LEFT JOIN users a')[0].sql;
    expect(recentLeadsSql).toContain('a.full_name AS assigned_full_name');
    expect(recentLeadsSql).not.toContain('first_name');
    expect(recentLeadsSql).not.toContain('last_name');
  });
});

describe('GET /admin/crm/segments (listSegmentsHandler)', () => {
  it('returns the segment contract with creator full_name', async () => {
    const reply = makeReply();
    await listSegmentsHandler({} as any, reply);

    expect(reply.payload.data[0]).toMatchObject({
      id: 1, name: 'VIP', member_count: 3, is_active: 1, creator_full_name: 'Admin User',
    });

    const sql = allCalls()[0].sql;
    expect(sql).toContain('u.full_name AS creator_full_name');
    expect(sql).not.toContain('first_name');
    expect(sql).not.toContain('last_name');
  });
});

describe('GET /admin/crm/leads (listLeadsHandler)', () => {
  it('returns leads with assigned/creator full_name and canonical SQL', async () => {
    const reply = makeReply();
    await listLeadsHandler({ query: {} } as any, reply);

    expect(reply.payload.data[0]).toMatchObject({
      id: 2, full_name: 'Lead One', status: 'new', assigned_full_name: 'Admin User',
    });

    const sql = allCalls()[0].sql;
    expect(sql).toContain('a.full_name AS assigned_full_name');
    expect(sql).toContain('c.full_name AS creator_full_name');
    expect(sql).not.toContain('first_name');
    expect(sql).not.toContain('last_name');
  });
});

describe('GET /admin/crm/campaigns (listCampaignsHandler)', () => {
  it('returns campaigns with creator full_name and segment name', async () => {
    const reply = makeReply();
    await listCampaignsHandler({ query: {} } as any, reply);

    expect(reply.payload.data[0]).toMatchObject({
      id: 3, name: 'Spring', segment_name: 'VIP', creator_full_name: 'Admin User',
    });

    const sql = allCalls()[0].sql;
    expect(sql).toContain('u.full_name AS creator_full_name');
    expect(sql).not.toContain('first_name');
    expect(sql).not.toContain('last_name');
  });
});

describe('GET /admin/crm/communications (listCommunicationsHandler)', () => {
  it('returns user_name/user_email matching CommunicationsPage', async () => {
    const reply = makeReply();
    await listCommunicationsHandler({ query: {} } as any, reply);

    expect(reply.payload.data[0]).toMatchObject({
      id: 4, user_name: 'Nadia Ali', user_email: 'nadia@example.com', channel: 'email', status: 'sent',
    });

    const sql = allCalls()[0].sql;
    expect(sql).toContain('u.full_name AS user_name');
    expect(sql).toContain('u.email AS user_email');
    expect(sql).not.toContain('u.first_name');
    expect(sql).not.toContain('u.last_name');
  });
});

describe('POST /admin/crm/segments/:id/refresh (refreshSegmentHandler SQL construction)', () => {
  it('builds canonical refresh SQL without invoking a real database', async () => {
    const reply = makeReply();
    await refreshSegmentHandler({
      params: { id: '5' },
      userId: 99,
      ip: '127.0.0.1',
      headers: {},
    } as any, reply);

    const memberSql = callsMatching('SELECT u.id FROM users u WHERE')[0].sql;
    expect(memberSql).toContain('EXISTS (SELECT 1 FROM orders WHERE buyer_id = u.id)');
    expect(memberSql).toContain("u.account_status = 'active'");
    expect(memberSql).not.toContain('orders WHERE user_id');
    expect(memberSql).not.toContain('u.is_active');

    expect(reply.payload.data.memberCount).toBe(1);
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
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

  it('users exposes the canonical identity columns and NOT the legacy CRM ones', () => {
    const userStart = baseline.indexOf('CREATE TABLE `users`');
    const userEnd = baseline.indexOf(') ENGINE=InnoDB', userStart);
    const userBlock = baseline.slice(userStart, userEnd);

    expect(userBlock).toContain('`full_name`');
    expect(userBlock).toContain('`phone_number`');
    expect(userBlock).toContain('`account_status`');
    expect(userBlock).not.toContain('`first_name`');
    expect(userBlock).not.toContain('`last_name`');
    expect(userBlock).not.toContain('`is_active`');
  });
});
