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
 * G11.21.4 — IDOR regression, REAL HTTP + REAL local MySQL (Docker stack,
 * port 3307, same convention as the other tournament integration specs).
 *
 * SRC: `registerHandler` (`tournament.controller.ts:309`) trusted a client
 * `body.tournament_id` that overrode the guarded route param, on an admin
 * route gated only by the GLOBAL `tournament.register` key (granted to every
 * `player`) into a service with no tenancy check. A player/org operator could
 * register (eligibility BYPASSED) into — and trigger payments against — any
 * other organisation's tournament.
 *
 * FIX under test (route + controller):
 *   • `params.id` is authoritative (body tournament_id ignored);
 *   • the three admin registration routes carry an organisation-aware guard
 *     (foreign / nonexistent → identical 404; org-scope holders + platform
 *     admins super/master may operate); the public self-registration and the
 *     org-portal routes are UNCHANGED.
 */

let app: FastifyInstance;

const BRACKET = 9730000;
const SPORT = 9730001;
const FORMAT = 9730002;
const ORG_A = 2734111;
const ORG_B = 2734112;

let tidA = 0;
let tidB = 0;
const myUserIds: number[] = [];
const phoneFor = (i: number) => `0109134${String(i).padStart(4, '0')}`;

// G11.21.4 — the system org-admin role should carry `tournament.register`
// (per the role-permission templates). The dev DB may lag, so mirror the
// intended matrix for the test window and remove it afterwards.
let fixtureOrgAdminRoleId = 0;
let fixturePermTournamentRegisterId = 0;
let orgAdminPermInserted = false;

const run = (sql: string, params: unknown[] = []) => getPool().execute(sql, params);

/** Expand an id array into `IN (?,?,…)` with flat params (mysql2 cannot bind an array to one placeholder). */
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

async function createTournament(orgId: number, creatorId: number, entryFee: number): Promise<number> {
  const [r] = await run(
    `INSERT INTO tournaments (public_id, creator_id, organisation_id, bracket_type_id, format, sport_id,
        name, max_participants, min_participants, entry_fee, registration_fee, currency_code, price_type, waitlist_enabled, tournament_type,
        commission_rate, status, is_public, start_date, end_date, registration_opens, registration_closes)
     VALUES (UUID(), ?, ?, ?, 'knockout', ?, ?, 64, 2, ?, ?, 'EGP', 'FIXED', 1, 'community', 0, 'registration_open', 1,
             DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_ADD(NOW(), INTERVAL 45 DAY),
             DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 25 DAY))`,
    [creatorId, orgId, BRACKET, SPORT, `IDOR Cup ${randomUUID().slice(0, 4)}`, entryFee, entryFee],
  );
  const tid = Number((r as { insertId: number }).insertId);
  await run(
    `INSERT INTO tournament_competitions
       (public_id, tournament_id, competition_type, name, match_format_id, rule_set_id, bracket_type_id, sport_id,
        entry_fee, registration_fee, currency_code, price_type, max_participants, min_participants, waitlist_enabled, is_default)
     VALUES (UUID(), ?, 'singles', 'Default', ?, NULL, ?, ?, ?, ?, 'EGP', ?, NULL, 2, 1, 1)`,
    [tid, FORMAT, BRACKET, SPORT, entryFee, entryFee, entryFee > 0 ? 'FIXED' : 'FREE'],
  );
  return tid;
}

async function countRegistrations(tid: number): Promise<number> {
  const [r] = await run(`SELECT COUNT(*) AS c FROM tournament_registrations WHERE tournament_id = ?`, [tid]);
  return Number((r as { c: number }[])[0].c);
}
async function countParticipants(tid: number): Promise<number> {
  const [r] = await run(`SELECT COUNT(*) AS c FROM tournament_participants WHERE tournament_id = ?`, [tid]);
  return Number((r as { c: number }[])[0].c);
}
async function countPaymentsForTournament(tid: number): Promise<number> {
  const [r] = await run(
    `SELECT COUNT(*) AS c FROM payment_transactions pt
     WHERE pt.reference_type = 'tournament' AND pt.reference_id IN
       (SELECT id FROM tournament_registrations WHERE tournament_id = ?)`,
    [tid],
  );
  return Number((r as { c: number }[])[0].c);
}

beforeAll(async () => {
  // Clean any residue from a previous (possibly interrupted) run of this spec.
  // Clean any residue from a previous (possibly interrupted) run of this spec.
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
  const masterAdminRole = await roleIdFor('master-admin');
  const superAdminRole = await roleIdFor('super_admin');

  // Fixture: ensure the system org-admin role carries `tournament.register` for
  // the test window (the templates grant it; the dev DB may lag).
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
    await run(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [orgAdminRole, fixturePermTournamentRegisterId],
    );
    orgAdminPermInserted = true;
  }

  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();

  // Users (real auth flow → sessions + auto-assigned player role).
  const ownerA = await registerPlayer(phoneFor(4), 'idor-owner-a@t.local', 'Owner A');
  const ownerB = await registerPlayer(phoneFor(5), 'idor-owner-b@t.local', 'Owner B');
  const operator1 = await registerPlayer(phoneFor(6), 'idor-op1@t.local', 'Op 1');
  const operator2 = await registerPlayer(phoneFor(7), 'idor-op2@t.local', 'Op 2');
  const platformMaster = await registerPlayer(phoneFor(8), 'idor-master@t.local', 'Master');
  const platformSuper = await registerPlayer(phoneFor(9), 'idor-super@t.local', 'Super');
  const publicPlayer = await registerPlayer(phoneFor(40), 'idor-player@t.local', 'Public P');
  const noPermUser = await registerPlayer(phoneFor(41), 'idor-noperm@t.local', 'No Perm');

  // Eligibility safety for the public (non-bypass) path.
  await run(`UPDATE users SET birth_date = '1995-01-01' WHERE id = ?`, [publicPlayer]);

  // operator1/2: org-admin scoped to ORG_A only; platform roles unscoped.
  const ur1 = await assignRole(operator1, orgAdminRole);
  const ur2 = await assignRole(operator2, orgAdminRole);
  await assignRole(platformMaster, masterAdminRole);
  await assignRole(platformSuper, superAdminRole);
  await scopeRole(ur1, ORG_A);
  await scopeRole(ur2, ORG_A);

  // noPermUser must NOT hold tournament.register → revoke the auto player role.
  const playerRoleId = await roleIdFor('player');
  await run(`DELETE FROM user_roles WHERE user_id = ? AND role_id = ?`, [noPermUser, playerRoleId]);

  await createOrg(ownerA, 'Idor Org A', ORG_A);
  await createOrg(ownerB, 'Idor Org B', ORG_B);

  await run(
    `INSERT IGNORE INTO tournament_bracket_types (id, name, slug, is_active) VALUES (?, 'Knockout', 'ko', 1)`,
    [BRACKET],
  );
  await run(
    `INSERT IGNORE INTO sports (id, name, slug, is_active, show_in_marketplace, sort_order) VALUES (?, 'Idor Sport', 'idor-sport', 1, 1, 0)`,
    [SPORT],
  );
  await run(
    `INSERT IGNORE INTO sport_formats (id, sport_id, slug, name, format_type, players_per_side, is_default, is_active)
     VALUES (?, ?, 'idor-singles', 'Idor Singles', 'singles', 1, 1, 1)`,
    [FORMAT, SPORT],
  );

  tidA = await createTournament(ORG_A, ownerA, 0);
  tidB = await createTournament(ORG_B, ownerB, 100);
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  try {
    await run('SET FOREIGN_KEY_CHECKS = 0');
    if (tidA || tidB) {
      const ids = [tidA, tidB].filter(Boolean);
      const t = expandIds(ids);
      await run(
        `DELETE pt FROM payment_transactions pt JOIN tournament_registrations r ON r.id = pt.reference_id AND pt.reference_type = 'tournament' WHERE r.tournament_id IN (${t.sql})`,
        t.params,
      );
      for (const table of ['tournament_participants', 'tournament_registrations', 'tournament_seeds', 'tournament_competitions']) {
        await run(`DELETE FROM ${table} WHERE tournament_id IN (${t.sql})`, t.params);
      }
      await run(`DELETE FROM tournaments WHERE id IN (${t.sql})`, t.params);
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
      await run(
        `DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
        [fixtureOrgAdminRoleId, fixturePermTournamentRegisterId],
      );
    }
    await run('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
  }
}, 30000);

describe('G11.21.4 — admin registration pipeline IDOR', () => {
  let op1Cookie = '';
  let op2Cookie = '';
  let masterCookie = '';
  let superCookie = '';
  let playerCookie = '';
  let noPermCookie = '';

  beforeAll(async () => {
    op1Cookie = await login(phoneFor(6));
    op2Cookie = await login(phoneFor(7));
    masterCookie = await login(phoneFor(8));
    superCookie = await login(phoneFor(9));
    playerCookie = await login(phoneFor(40));
    noPermCookie = await login(phoneFor(41));
  });

  it('C1. same-org org-scoped operator registration succeeds (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidA}/register`,
      headers: { cookie: `session_token=${op1Cookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  it('C2. cross-org operator registration returns 404 (no existence leak path)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${op1Cookie}` },
      payload: { payment_method: 'cash' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('C3. the denied cross-org attempt creates NO registration/participant/payment_transactions rows', async () => {
    const beforeReg = await countRegistrations(tidB);
    const beforePart = await countParticipants(tidB);
    const beforePay = await countPaymentsForTournament(tidB);

    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${op1Cookie}` },
      payload: { payment_method: 'cash' },
    });
    expect(res.statusCode).toBe(404);

    expect(await countRegistrations(tidB)).toBe(beforeReg);
    expect(await countParticipants(tidB)).toBe(beforePart);
    expect(await countPaymentsForTournament(tidB)).toBe(beforePay);
  });

  it('C4. a nonexistent tournament returns the SAME response as a foreign tournament', async () => {
    const foreign = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${op1Cookie}` },
      payload: {},
    });
    const none = await app.inject({
      method: 'POST',
      url: '/admin/tournaments/999999999/register',
      headers: { cookie: `session_token=${op1Cookie}` },
      payload: {},
    });
    expect(none.statusCode).toBe(404);
    const f = foreign.json();
    const n = none.json();
    expect(n.statusCode).toBe(f.statusCode);
    expect(n.error).toBe(f.error);
    expect(n.message).toBe(f.message);
  });

  it('C5. a user without tournament.register is rejected with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidA}/register`,
      headers: { cookie: `session_token=${noPermCookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('C6. super_admin may register cross-org (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${superCookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  it('C7. master-admin retains cross-org Tournament Workbench registration (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${masterCookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  it('C8. public self-registration ACROSS organisations still succeeds (unchanged)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tournaments/${tidB}/register`,
      headers: { cookie: `session_token=${playerCookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });

  it('C9. org-portal registration still succeeds (unchanged)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/org/${ORG_A}/tournaments/${tidA}/register`,
      headers: { cookie: `session_token=${op2Cookie}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
  });
});