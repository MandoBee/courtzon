import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool, getPool } from '../../../database/mysql.js';
import type { AuthResponse } from '../presentation/auth.dto.js';
import type { AuthService } from '../application/auth.service.js';
import type { SessionRepository } from '../infrastructure/repositories/session.repository.js';
import { hashToken } from '../../../shared/utils/token.js';

let ctx: TestContext;
let authService: AuthService;
let sessionRepository: SessionRepository;

type RowData = Array<Record<string, any>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function touchLastActivity(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `UPDATE user_sessions SET last_activity_at = NOW() WHERE session_token_hash = ? AND is_revoked = FALSE`,
    [tokenHash],
  );
}

async function getExpiresAt(tokenHash: string): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT expires_at FROM user_sessions WHERE session_token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  return rows.length ? (rows[0].expires_at as string) : null;
}

let phoneCounter = 0;
function nextPhone() {
  phoneCounter += 1;
  return `0500000010${phoneCounter}`;
}

async function registerAndLogin(): Promise<AuthResponse> {
  const phone = nextPhone();
  await authService.register(
    {
      countryId: 1,
      phoneNumber: phone,
      password: 'test123456',
      fullName: `Session Tester ${phone}`,
      email: `sessiontest${phone}@example.com`,
      gender: 'male',
      timezone: 'UTC',
      darkMode: 'system',
    },
    { ip: '127.0.0.1' },
  );
  return authService.login(
    { phoneNumber: phone, countryCode: '+971', password: 'test123456' },
    { ip: '127.0.0.1' },
  );
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

  const { AuthService: Svc } = await import('../application/auth.service.js');
  authService = new Svc();
  const { SessionRepository: Repo } = await import('../infrastructure/repositories/session.repository.js');
  sessionRepository = new Repo();
}, 120000);

afterAll(async () => {
  await stopContainers();
}, 30000);

describe('Session Expiry Regression (090_user_sessions_expires_at_no_on_update)', () => {
  it('a session survives multiple consecutive authenticated lookups', async () => {
    const result = await registerAndLogin();
    const tokenHash = hashToken(result.session.sessionToken);

    for (let i = 0; i < 5; i++) {
      const session = await sessionRepository.findBySessionTokenHash(tokenHash);
      expect(session).not.toBeNull();
      await touchLastActivity(tokenHash);
    }

    const stillValid = await sessionRepository.findBySessionTokenHash(tokenHash);
    expect(stillValid).not.toBeNull();
  });

  it('the last_activity_at touch does not advance expires_at', async () => {
    const result = await registerAndLogin();
    const tokenHash = hashToken(result.session.sessionToken);
    const before = await getExpiresAt(tokenHash);
    expect(before).not.toBeNull();

    await sleep(1100);
    await touchLastActivity(tokenHash);

    const after = await getExpiresAt(tokenHash);
    expect(after).toBe(before);
  });

  it('refresh rotates the session and issues a fresh expiry', async () => {
    const result = await registerAndLogin();
    const oldTokenHash = hashToken(result.session.sessionToken);
    const oldExpiry = await getExpiresAt(oldTokenHash);

    const refreshed = await authService.refresh(result.session.refreshToken);
    expect(refreshed.session.sessionToken).not.toBe(result.session.sessionToken);
    expect(refreshed.session.refreshToken).not.toBe(result.session.refreshToken);

    const oldSession = await sessionRepository.findBySessionTokenHash(oldTokenHash);
    expect(oldSession).toBeNull();

    const newExpiry = await getExpiresAt(hashToken(refreshed.session.sessionToken));
    expect(newExpiry).not.toBeNull();
    expect(new Date(newExpiry).getTime()).toBeGreaterThan(new Date(oldExpiry).getTime());
  });

  it('a revoked session no longer resolves', async () => {
    const result = await registerAndLogin();
    const tokenHash = hashToken(result.session.sessionToken);
    await sessionRepository.revokeAllForUser(result.user.id);

    const session = await sessionRepository.findBySessionTokenHash(tokenHash);
    expect(session).toBeNull();
  });

  it('a long session: access expiry stays fixed and refresh extends lifetime', async () => {
    const result = await registerAndLogin();
    const tokenHash = hashToken(result.session.sessionToken);
    const pool = getPool();

    const before = await getExpiresAt(tokenHash);
    expect(before).not.toBeNull();

    await sleep(1100);
    await touchLastActivity(tokenHash);
    const unchanged = await getExpiresAt(tokenHash);
    expect(unchanged).toBe(before);

    const [oldRows] = await pool.execute<RowData>(
      `SELECT refresh_token_expires_at FROM user_sessions WHERE session_token_hash = ? LIMIT 1`,
      [tokenHash],
    );
    const oldRefreshExpiry = (oldRows[0] as any).refresh_token_expires_at;

    const refreshed = await authService.refresh(result.session.refreshToken);
    const [newRows] = await pool.execute<RowData>(
      `SELECT expires_at, refresh_token_expires_at FROM user_sessions
       WHERE session_token_hash = ? LIMIT 1`,
      [hashToken(refreshed.session.sessionToken)],
    );
    const newAccessExpiry = (newRows[0] as any).expires_at;
    const newRefreshExpiry = (newRows[0] as any).refresh_token_expires_at;

    expect(new Date(newAccessExpiry).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(newRefreshExpiry).getTime()).toBeGreaterThan(
      new Date(oldRefreshExpiry).getTime(),
    );
  });

  it('expired access token prevents lookup but refresh token still works', async () => {
    const result = await registerAndLogin();
    const tokenHash = hashToken(result.session.sessionToken);
    const pool = getPool();

    await pool.execute(
      `UPDATE user_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE session_token_hash = ?`,
      [tokenHash],
    );

    const accessSession = await sessionRepository.findBySessionTokenHash(tokenHash);
    expect(accessSession).toBeNull();

    const refreshed = await authService.refresh(result.session.refreshToken);
    expect(refreshed.session.sessionToken).toBeTruthy();

    const newSession = await sessionRepository.findBySessionTokenHash(hashToken(refreshed.session.sessionToken));
    expect(newSession).not.toBeNull();
  });
});
