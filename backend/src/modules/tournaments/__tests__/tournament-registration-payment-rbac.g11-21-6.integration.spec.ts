import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3001';
  process.env.ENABLE_API_DOCS = 'false';
});

import { createPool, getPool } from '../../../database/mysql.js';
import { randomUUID } from 'node:crypto';

/**
 * G11.21.6 — REAL-HTTP + RBAC-DENIED + payment_transactions regression for the
 * ADMIN tournament registration pipeline (register / confirm / cancel).
 *
 * This is a TEST-ONLY phase. The production protections came from G11.21.4
 * (`params.id` authoritative + the org-aware guard on the three admin register
 * routes). This suite proves, over the REAL HTTP application against the local
 * Docker MySQL (127.0.0.1:3307 / courtzon_v3):
 *
 *   P1 — a legal same-org CASH registration actually creates a real
 *        `payment_transactions` row (reference_type='tournament', method='cash',
 *        amount=100, currency='EGP', payment_status='paid', idempotency key).
 *   P2 — an unpaid registration on a PAID tournament cannot be confirmed (409).
 *   P3 — a paid registration CAN be confirmed (200).
 *   R1 — confirm/cancel without `tournament.register` → 403 (before org
 *        resolution).
 *   R2 — cross-org confirm/cancel → 404 REGISTRATION_NOT_FOUND, byte-identical
 *        to a NONEXISTENT registration (no existence leak); foreign row
 *        unchanged.
 *   R3 — same-org confirm/cancel still succeed (200).
 *   REGISTER REGRESSION — a C1-style same-org register stays functional.
 *
 * Payment uses the EXISTING real cash-payment implementation
 * (`createCashPaymentTransaction` + `payment:succeeded`). No mocks, no
 * gateway. Fixtures use unique ids/phones and are fully cleaned (like g11-1 /
 * g11-2, including the financial rows a tournament posting may touch).
 */

let app: FastifyInstance;

const BRACKET = 9730100;
const SPORT = 9730101;
const FORMAT = 9730102;
const ORG_A = 2735201;
const ORG_B = 2735202;

let tidPaid = 0; // ORG_A, entry_fee 100, EGP
let tidFree = 0;  // ORG_A, entry_fee 0, EGP

const myUserIds: number[] = [];
const regIds: number[] = [];
const paymentIds: number[] = [];
const phoneFor = (i: number) => `0109134${String(i).padStart(4, '0')}`;

// G11.21.6 — the system org-admin role should carry tournament.register (per the
// role-permission templates); mirror that for the test window if the dev DB lags.
let fixtureOrgAdminRoleId = 0;
let fixturePermTournamentRegisterId = 0;
let orgAdminPermInserted = false;

const run = (sql: string, params: unknown[] = []) => getPool().execute(sql, params);

function expandIds(values: number[]): { sql: string; params: number[] } {
  return { sql: values.map(() => '?').join(','), params: values };
}

async function registerPlayer(phone: string, email: string, name: string): Promise<number> {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register-player',
    payload: {
      countryId: 1,
      phoneNumber: phone,
      password: 'test123456',
      fullName: name,
      email,
      gender: 'male',
      timezone: 'UTC',
      darkMode: 'system',
    },
  });
  expect([200, 201]).toContain(reg.statusCode);
  const id = await userIdFor(phone);
  myUserIds.push(id);
  return id;
}

function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'session_token');
  if (!c) throw new Error('session_token cookie missing');
  return c.value;
}

async function login(phone: string): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { phoneNumber: phone, countryCode: '+20', password: 'test123456' },
  });
  expect(login.statusCode).toBe(200);
  return sessionCookie(login);
}

async function userIdFor(phone: string): Promise<number> {
  const [rows] = await getPool().execute(
    `SELECT u.id FROM users u WHERE u.phone_number = ? ORDER BY u.id DESC LIMIT 1`,
    [phone],
  );
  return (rows as { id: number }[])[0].id;
}

async function roleIdFor(slug: string): Promise<number> {
  await run(`INSERT IGNORE INTO roles (name, slug, is_system, is_active) VALUES (?, ?, 1, 1)`, [slug, slug]);
  const [rows] = await run(`SELECT id FROM roles WHERE slug = ? LIMIT 1`, [slug]);
  return (rows as { id: number }[])[0].id;
}

async function assignRole(userId: number, roleId: number): Promise<number> {
  await run(`INSERT IGNORE INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`, [userId, roleId]);
  const [rows] = await run(`SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1`, [userId, roleId]);
  return (rows as { id: number }[])[0].id;
}

async function scopeRole(userRoleId: number, orgId: number): Promise<void> {
  await run(
    `INSERT IGNORE INTO user_role_scopes (user_role_id, scope_type, scope_id) VALUES (?, 'organisation', ?)`,
    [userRoleId, orgId],
  );
}

async function createOrg(ownerId: number, name: string, id: number): Promise<void> {
  await run(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
     VALUES (?, ?, 1, ?, ?, ?, TRUE)`,
    [id, randomUUID(), ownerId, name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomUUID().slice(0, 4)],
  );
}

async function createTournament(orgId: number, creatorId: number, entryFee: number, currency = 'EGP'): Promise<number> {
  const [r] = await run(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, sport_id,
        name, max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, waitlist_enabled, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, ?, 'knockout', ?, ?, 64, 2, ?, ?, ?, 'FIXED', 1, 'community', 0, 'registration_open', 1,
             DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_ADD(NOW(), INTERVAL 45 DAY),
             DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 25 DAY))`,
    [creatorId, orgId, BRACKET, SPORT, `G11216 Cup ${randomUUID().slice(0, 4)}`, entryFee, entryFee, currency],
  );
  const tid = Number((r as { insertId: number }).insertId);
  await run(
    `INSERT INTO tournament_competitions
       (public_id, tournament_id, competition_type, name, match_format_id, rule_set_id, bracket_type_id, sport_id,
        entry_fee, registration_fee, currency_code, price_type, max_participants, min_participants, waitlist_enabled, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', ?, NULL, ?, ?, ?, ?, ?, ?, NULL, 2, 1, 1)`,
    [tid, FORMAT, BRACKET, SPORT, entryFee, entryFee, currency, entryFee > 0 ? 'FIXED' : 'FREE'],
  );
  return tid;
}

async function registerViaHttp(cookie: string, tid: number, paymentMethod?: 'cash'): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: `/admin/tournaments/${tid}/register`,
    headers: { cookie: `session_token=${cookie}` },
    payload: paymentMethod ? { payment_method: paymentMethod } : {},
  });
  return { status: res.statusCode, body: res.json() };
}

async function confirmViaHttp(cookie: string, regId: number): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: `/admin/tournaments/registrations/${regId}/confirm`,
    headers: { cookie: `session_token=${cookie}` },
    payload: {},
  });
  return { status: res.statusCode, body: res.json() };
}

async function cancelViaHttp(cookie: string, regId: number): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'POST',
    url: `/admin/tournaments/registrations/${regId}/cancel`,
    headers: { cookie: `session_token=${cookie}` },
    payload: {},
  });
  return { status: res.statusCode, body: res.json() };
}

async function fetchPayment(id: number): Promise<any> {
  const [rows] = await run(
    `SELECT reference_type, payment_method, amount, currency, payment_status, idempotency_key
     FROM payment_transactions WHERE id = ? LIMIT 1`,
    [id],
  );
  return (rows as any[])[0];
}

async function fetchRegistrationPaymentStatus(regId: number): Promise<string> {
  const [rows] = await run(
    `SELECT payment_status FROM tournament_registrations WHERE id = ? LIMIT 1`,
    [regId],
  );
  return (rows as { payment_status: string }[])[0]?.payment_status;
}

beforeAll(async () => {
  // Clean residue from a previous (possibly interrupted) run of this spec.
  const myth = `(SELECT id FROM users WHERE phone_number LIKE '010913%')`;
  await run(
    `DELETE pt FROM payment_transactions pt JOIN tournament_registrations r ON r.id = pt.reference_id AND pt.reference_type = 'tournament'
     WHERE r.tournament_id IN (SELECT id FROM tournaments WHERE creator_id IN ${myth})`,
  );
  for (const table of ['tournament_participants', 'tournament_registrations', 'tournament_seeds', 'tournament_competitions']) {
    await run(`DELETE FROM ${table} WHERE tournament_id IN (SELECT id FROM tournaments WHERE creator_id IN ${myth})`);
  }
  await run(`DELETE FROM tournaments WHERE creator_id IN ${myth}`);
  await run(`DELETE FROM organisations WHERE id IN (?, ?)`, [ORG_A, ORG_B]);
  await run(`DELETE FROM users WHERE phone_number LIKE '010913%'`);
  await run(`DELETE FROM tournament_bracket_types WHERE id = ?`, [BRACKET]);
  await run(`DELETE FROM sports WHERE id = ?`, [SPORT]);
  await run(`DELETE FROM sport_formats WHERE id = ?`, [FORMAT]);

  createPool({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'courtzon2026',
    database: 'courtzon_v3',
  });
  vi.resetModules();

  const orgAdminRole = await roleIdFor('org-admin');

  // Fixture: the system org-admin role carries `tournament.register` for the
  // test window (templates grant it; the dev DB may lag).
  const [permRows] = await run(
    `SELECT id FROM permissions WHERE permission_key = 'tournament.register' LIMIT 1`,
  );
  fixturePermTournamentRegisterId = (permRows as { id: number }[])[0].id;
  fixtureOrgAdminRoleId = orgAdminRole;
  const [existingPerm] = await run(
    `SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1`,
    [orgAdminRole, fixturePermTournamentRegisterId],
  );
  if (!(existingPerm as { 1: number }[]).length) {
    await run(`INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [
      orgAdminRole,
      fixturePermTournamentRegisterId,
    ]);
    orgAdminPermInserted = true;
  }

  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();

  // Users (real auth flow → sessions + auto-assigned player role).
  const ownerA = await registerPlayer(phoneFor(60), 'g11216-owner-a@t.local', 'Owner A');
  const ownerB = await registerPlayer(phoneFor(61), 'g11216-owner-b@t.local', 'Owner B');
  const orgAOp = await registerPlayer(phoneFor(62), 'g11216-opa@t.local', 'OpA');
  const orgAOp2 = await registerPlayer(phoneFor(63), 'g11216-opa2@t.local', 'OpA2');
  const orgAOp4 = await registerPlayer(phoneFor(64), 'g11216-opa4@t.local', 'OpA4');
  const orgAOp5 = await registerPlayer(phoneFor(65), 'g11216-opa5@t.local', 'OpA5');
  const orgAOp6 = await registerPlayer(phoneFor(66), 'g11216-opa6@t.local', 'OpA6');
  const orgBOp = await registerPlayer(phoneFor(67), 'g11216-opb@t.local', 'OpB');
  const noPermUser = await registerPlayer(phoneFor(68), 'g11216-noperm@t.local', 'NoPerm');

  // operator roles: ORG-A scoped for orgAOp/orgAOp2/orgAOp4/orgAOp5/orgAOp6,
  // ORG-B scoped for orgBOp.
  const scopePairs: Array<[number, number]> = [
    [orgAOp, ORG_A],
    [orgAOp2, ORG_A],
    [orgAOp4, ORG_A],
    [orgAOp5, ORG_A],
    [orgAOp6, ORG_A],
    [orgBOp, ORG_B],
  ];
  for (const [uid, orgId] of scopePairs) {
    const ur = await assignRole(uid, orgAdminRole);
    await scopeRole(ur, orgId);
  }

  // noPermUser must NOT hold tournament.register → revoke the auto player role.
  const playerRoleId = await roleIdFor('player');
  await run(`DELETE FROM user_roles WHERE user_id = ? AND role_id = ?`, [noPermUser, playerRoleId]);

  await createOrg(ownerA, 'G11216 Org A', ORG_A);
  await createOrg(ownerB, 'G11216 Org B', ORG_B);

  await run(
    `INSERT IGNORE INTO tournament_bracket_types (id, name, slug, is_active) VALUES (?, 'Knockout', 'ko', 1)`,
    [BRACKET],
  );
  await run(
    `INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (?, 'G11216 Sport', 'g11216-sport', 1, 1, 0)`,
    [SPORT],
  );
  await run(
    `INSERT IGNORE INTO sport_formats (id, sport_id, slug, name, format_type, players_per_side, is_default, is_active)
     VALUES (?, ?, 'g11216-singles', 'G11216 Singles', 'singles', 1, 1, 1)`,
    [FORMAT, SPORT],
  );

  tidPaid = await createTournament(ORG_A, ownerA, 100, 'EGP');
  tidFree = await createTournament(ORG_A, ownerA, 0, 'EGP');
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  try {
    await run('SET FOREIGN_KEY_CHECKS = 0');
    if (regIds.length) {
      const r = expandIds(regIds);
      await run(
        `DELETE FROM payment_transactions WHERE reference_type = 'tournament' AND reference_id IN (${r.sql})`,
        r.params,
      );
    }
    if (paymentIds.length) {
      const p = expandIds(paymentIds);
      await run(`DELETE FROM payment_transactions WHERE id IN (${p.sql})`, p.params);
    }
    if (tidPaid || tidFree) {
      const ids = [tidPaid, tidFree].filter(Boolean);
      const t = expandIds(ids);
      for (const table of ['tournament_participants', 'tournament_registrations', 'tournament_seeds', 'tournament_competitions']) {
        await run(`DELETE FROM ${table} WHERE tournament_id IN (${t.sql})`, t.params);
      }
      await run(`DELETE FROM tournaments WHERE id IN (${t.sql})`, t.params);
    }
    // Financial side effects of `payment:succeeded` (per g11-2 convention) —
    // guarded so a schema gap never aborts cleanup of an unconfigured test org.
    for (const table of ['journal_lines', 'financial_journal_entries', 'ledger_entries', 'general_ledger', 'chart_of_accounts']) {
      try {
        await run(`DELETE FROM ${table} WHERE organisation_id IN (?, ?)`, [ORG_A, ORG_B]);
      } catch {
        /* column/table absent in this environment — nothing to clean */
      }
    }
    await run(`DELETE FROM organisations WHERE id IN (?, ?)`, [ORG_A, ORG_B]);
    if (myUserIds.length) {
      const uids = [...new Set(myUserIds)];
      const u = expandIds(uids);
      await run(`DELETE FROM user_role_scopes WHERE user_role_id IN (SELECT id FROM user_roles WHERE user_id IN (${u.sql}))`, u.params);
      await run(`DELETE FROM user_roles WHERE user_id IN (${u.sql})`, u.params);
      await run(`DELETE FROM user_sessions WHERE user_id IN (${u.sql})`, u.params);
      await run(`DELETE FROM user_wallets WHERE user_id IN (${u.sql})`, u.params);
      await run(`DELETE FROM player_profiles WHERE user_id IN (${u.sql})`, u.params);
      await run(`DELETE FROM users WHERE id IN (${u.sql})`, u.params);
    }
    await run(`DELETE FROM sport_formats WHERE id = ?`, [FORMAT]);
    await run(`DELETE FROM sports WHERE id = ?`, [SPORT]);
    await run(`DELETE FROM tournament_bracket_types WHERE id = ?`, [BRACKET]);
    if (orgAdminPermInserted) {
      await run(`DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`, [
        fixtureOrgAdminRoleId,
        fixturePermTournamentRegisterId,
      ]);
    }
    await run('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
  }
}, 30000);

describe('G11.21.6 — admin registration pipeline: real HTTP + RBAC + payment_transactions', () => {
  let opA = '';
  let opA2 = '';
  let opA4 = '';
  let opA5 = '';
  let opA6 = '';
  let opB = '';
  let noPerm = '';

  beforeAll(async () => {
    opA = await login(phoneFor(62));
    opA2 = await login(phoneFor(63));
    opA4 = await login(phoneFor(64));
    opA5 = await login(phoneFor(65));
    opA6 = await login(phoneFor(66));
    opB = await login(phoneFor(67));
    noPerm = await login(phoneFor(68));
  });

  it('REGISTER REGRESSION — same-org register remains functional (free tournament, 201)', async () => {
    const r = await registerViaHttp(opA, tidFree);
    expect(r.status).toBe(201);
  });

  it('P1 — a legal same-org CASH registration creates a real payment_transactions row', async () => {
    const r = await registerViaHttp(opA, tidPaid, 'cash');
    expect(r.status).toBe(201);
    // Response contract: payment method/status/id are returned.
    expect(r.body.payment.method).toBe('cash');
    expect(r.body.payment.status).toBe('paid');
    expect(typeof r.body.payment.paymentId).toBe('number');
    const regId = Number(r.body.id);
    const payId = Number(r.body.payment.paymentId);
    expect(regId).toBeGreaterThan(0);
    expect(payId).toBeGreaterThan(0);
    regIds.push(regId);
    paymentIds.push(payId);

    // Exact payment_transactions row.
    const pay = await fetchPayment(payId);
    expect(pay).toBeTruthy();
    expect(pay.reference_type).toBe('tournament');
    expect(pay.payment_method).toBe('cash');
    expect(Number(pay.amount)).toBe(100);
    expect(pay.currency).toBe('EGP');
    expect(pay.payment_status).toBe('paid');
    expect(pay.idempotency_key).toBe(`tournament_cash_payment_${regId}`);

    // The registration itself is marked PAID.
    expect(await fetchRegistrationPaymentStatus(regId)).toBe('paid');
  });

  it('P2 — an unpaid registration on a PAID tournament cannot be confirmed (409)', async () => {
    const r = await registerViaHttp(opA2, tidPaid); // no payment_method → unpaid
    expect(r.status).toBe(201);
    const regId = Number(r.body.id);
    regIds.push(regId);
    expect(await fetchRegistrationPaymentStatus(regId)).toBe('unpaid');

    const c = await confirmViaHttp(opA2, regId);
    expect(c.status).toBe(409);
    // The existing "entry fee must be paid" contract is preserved.
    expect(JSON.stringify(c.body)).toMatch(/Entry fee must be paid/i);
  });

  it('P3 — the PAID registration from P1 can be confirmed (200)', async () => {
    // regIds[0] is the P1 registration (paid).
    const paidRegId = regIds[0];
    expect(paidRegId).toBeGreaterThan(0);
    const c = await confirmViaHttp(opA, paidRegId);
    expect(c.status).toBe(200);
    expect(c.body.message).toMatch(/confirmed/i);
  });

  it('R1 — confirm/cancel without tournament.register return 403 before org resolution', async () => {
    const targetRegId = regIds[0]; // a valid, existing registration
    const confirmRes = await confirmViaHttp(noPerm, targetRegId);
    expect(confirmRes.status).toBe(403);
    const cancelRes = await cancelViaHttp(noPerm, targetRegId);
    expect(cancelRes.status).toBe(403);
    // The registration was not mutated by the RBAC-denied attempts.
    expect(await fetchRegistrationPaymentStatus(targetRegId)).toBe('paid');
  });

  it('R2 — cross-org confirm/cancel are denied with 404, identical to a nonexistent registration, row unchanged', async () => {
    // A fresh SAME-ORG registration that the ORG-B operator must not touch.
    const r = await registerViaHttp(opA4, tidPaid);
    expect(r.status).toBe(201);
    const regId = Number(r.body.id);
    regIds.push(regId);
    const before = await fetchRegistrationPaymentStatus(regId);
    expect(before).toBe('unpaid');

    const foreignConfirm = await confirmViaHttp(opB, regId);
    const foreignCancel = await cancelViaHttp(opB, regId);
    expect(foreignConfirm.status).toBe(404);
    expect(foreignCancel.status).toBe(404);
    expect(foreignConfirm.body.error).toBe('REGISTRATION_NOT_FOUND');
    expect(foreignCancel.body.error).toBe('REGISTRATION_NOT_FOUND');

    // A nonexistent registration returns the SAME shape (status + error body).
    const none = await app.inject({
      method: 'POST',
      url: '/admin/tournaments/registrations/999999999/confirm',
      headers: { cookie: `session_token=${opB}` },
      payload: {},
    });
    expect(none.statusCode).toBe(404);
    const n = none.json();
    expect(none.statusCode).toBe(foreignConfirm.status);
    expect(n.error).toBe(foreignConfirm.body.error);
    expect(n.message).toBe(foreignConfirm.body.message);

    // The foreign registration is unchanged.
    expect(await fetchRegistrationPaymentStatus(regId)).toBe(before);
  });

  it('R3 — same-org confirm and cancel still succeed (fresh registrations)', async () => {
    // confirm: a fresh paid registration.
    const rc = await registerViaHttp(opA5, tidPaid, 'cash');
    expect(rc.status).toBe(201);
    const paidRegId = Number(rc.body.id);
    const paidPayId = Number(rc.body.payment.paymentId);
    regIds.push(paidRegId);
    paymentIds.push(paidPayId);
    const cc = await confirmViaHttp(opA5, paidRegId);
    expect(cc.status).toBe(200);

    // cancel: a fresh registration (different user, never confirmed/cancelled).
    const rx = await registerViaHttp(opA6, tidPaid);
    expect(rx.status).toBe(201);
    const cancelRegId = Number(rx.body.id);
    regIds.push(cancelRegId);
    const cx = await cancelViaHttp(opA6, cancelRegId);
    expect(cx.status).toBe(200);
    expect(cx.body.message).toMatch(/cancelled/i);
  });
});