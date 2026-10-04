import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  startContainers,
  runSchema,
  stopContainers,
  applyTestProcessEnv,
  type TestContext,
} from '../../../tests/helpers/integration-setup.js';
import { createPool, getPool } from '../../../database/mysql.js';

let ctx: TestContext;
let app: FastifyInstance;

function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'session_token');
  if (!c) throw new Error('session_token cookie missing');
  return c.value;
}

async function registerAndLogin(phone: string, fullName: string) {
  const reg = await app.inject({
    method: 'POST',
    url: '/auth/register-player',
    payload: {
      countryId: 1,
      countryCode: '+20',
      phoneNumber: phone,
      password: 'test123456',
      fullName,
      email: `${phone.replace(/[^0-9]/g, '')}@example.com`,
      gender: 'male',
      timezone: 'UTC',
      darkMode: 'system',
    },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { phoneNumber: phone, countryCode: '+20', password: 'test123456' },
  });
  if (login.statusCode !== 200 || reg.statusCode < 200 || reg.statusCode >= 300) {
    throw new Error(`register/login failed: reg=${reg.statusCode} login=${login.statusCode}`);
  }
  const body = login.json() as { user?: { id?: number } };
  return { token: sessionCookie(login), userId: Number(body.user?.id) };
}

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);
  vi.resetModules();

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  const { closeRedisClient } = await import('../../../infrastructure/redis/redis.client.js');
  await closeRedisClient();
  await stopContainers();
}, 30000);

describe('G11.22 P0 — organisation access model', () => {
  let owner: { token: string; userId: number };
  let other: { token: string; userId: number };
  let orgId: number;
  let openBranchId: number;
  let restrictedBranchId: number;
  let superAdminRoleId: number;

  beforeAll(async () => {
    const pool = getPool();
    owner = await registerAndLogin('05000000099', 'Owner Admin');
    other = await registerAndLogin('05000000098', 'Other Player');

    const [orgRow] = await pool.execute<import('mysql2').RowDataPacket[]>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), 1, ?, 'G11.22 Club', 'g1122-club', 1)`,
      [owner.userId],
    );
    orgId = (orgRow as any).insertId;

    const [b1] = await pool.execute<import('mysql2').RowDataPacket[]>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, access_type, timezone)
       VALUES (UUID(), ?, 'Open Court', 'g1122-open', 'open', 'Africa/Cairo')`,
      [orgId],
    );
    openBranchId = (b1 as any).insertId;

    const [b2] = await pool.execute<import('mysql2').RowDataPacket[]>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, access_type, timezone)
       VALUES (UUID(), ?, 'VIP Courts', 'g1122-vip', 'restricted', 'Africa/Cairo')`,
      [orgId],
    );
    restrictedBranchId = (b2 as any).insertId;

    const [roleRows] = await pool.execute<import('mysql2').RowDataPacket[]>(
      `SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`,
    );
    superAdminRoleId = Number((roleRows as any[])[0]?.id);
  });

  it('existing organisations default to PUBLIC_CLUB (current behaviour preserved)', async () => {
    const res = await app.inject({ method: 'GET', url: `/org/${orgId}/info`, cookies: { session_token: owner.token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().access_model).toBe('PUBLIC_CLUB');
  });

  it('blocks unauthenticated access (401)', async () => {
    const res = await app.inject({ method: 'PUT', url: `/org/${orgId}/info`, payload: { accessModel: 'MEMBERSHIP_CLUB' } });
    expect(res.statusCode).toBe(401);
  });

  it('blocks a user without organisation access (403)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/org/${orgId}/info`,
      cookies: { session_token: other.token },
      payload: { accessModel: 'MEMBERSHIP_CLUB' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an invalid access model with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/org/${orgId}/info`,
      cookies: { session_token: owner.token },
      payload: { accessModel: 'NOT_A_MODEL' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_ERROR');
  });

  it('authorised org admin can switch the organisation to MEMBERSHIP_CLUB', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/org/${orgId}/info`,
      cookies: { session_token: owner.token },
      payload: { accessModel: 'MEMBERSHIP_CLUB' },
    });
    expect(res.statusCode).toBe(200);

    const read = await app.inject({ method: 'GET', url: `/org/${orgId}/info`, cookies: { session_token: owner.token } });
    expect(read.json().access_model).toBe('MEMBERSHIP_CLUB');
  });

  it('MEMBERSHIP_CLUB branch policy: open → membership_required, restricted stays restricted', async () => {
    const res = await app.inject({ method: 'GET', url: `/org/${orgId}/branches`, cookies: { session_token: owner.token } });
    expect(res.statusCode).toBe(200);
    const branches = res.json() as any[];
    expect(branches.length).toBe(2);
    const open = branches.find((b) => b.id === openBranchId);
    const restricted = branches.find((b) => b.id === restrictedBranchId);
    expect(open.effective_access_policy).toBe('membership_required');
    expect(restricted.effective_access_policy).toBe('restricted');
    // access_type itself never changes.
    expect(open.access_type).toBe('open');
    expect(restricted.access_type).toBe('restricted');
  });

  it('PUBLIC_CLUB branch policy: open stays open, restricted stays restricted (no silent members-only)', async () => {
    const reset = await app.inject({
      method: 'PUT',
      url: `/org/${orgId}/info`,
      cookies: { session_token: owner.token },
      payload: { accessModel: 'PUBLIC_CLUB' },
    });
    expect(reset.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/org/${orgId}/branches`, cookies: { session_token: owner.token } });
    const branches = res.json() as any[];
    expect(branches.find((b) => b.id === openBranchId).effective_access_policy).toBe('public');
    expect(branches.find((b) => b.id === restrictedBranchId).effective_access_policy).toBe('restricted');
  });

  it('admin endpoint rejects non-admin users (403)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/organisations/${orgId}`,
      cookies: { session_token: other.token },
      payload: { accessModel: 'MEMBERSHIP_CLUB' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('admin endpoint accepts the update for a super_admin user', async () => {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`,
      [other.userId, superAdminRoleId],
    );

    const res = await app.inject({
      method: 'PUT',
      url: `/organisations/${orgId}`,
      cookies: { session_token: other.token },
      payload: { accessModel: 'MEMBERSHIP_CLUB' },
    });
    expect(res.statusCode).toBe(200);

    const read = await app.inject({ method: 'GET', url: `/organisations/${orgId}`, cookies: { session_token: other.token } });
    expect(read.statusCode).toBe(200);
    expect(read.json().access_model).toBe('MEMBERSHIP_CLUB');
  });
});