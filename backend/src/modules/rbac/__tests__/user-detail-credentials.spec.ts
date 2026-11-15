import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Credential-exposure regression — `GET /admin/users/:id`.
 *
 * The admin user detail endpoint used to return `users.password_hash` verbatim
 * because the repository selected `u.*` and the handler forwarded the row. This
 * suite exercises the REAL controller + REAL service + REAL redaction helper,
 * with only the repository (and side-effect modules) mocked, and asserts that no
 * credential field reaches the HTTP response payload.
 */

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test-not-a-real-password';
  process.env.DB_NAME = 'test_not_a_real_database';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3001';
});

const repo = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getUserRoles: vi.fn(),
  listUsers: vi.fn(),
}));
const countryScope = vi.hoisted(() => ({ getUserCountryScope: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const rating = vi.hoisted(() => ({ recalculateSelfDeclaredForUser: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(), query: vi.fn(), getConnection: vi.fn() }),
}));
vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: repo }));
vi.mock('../application/user-country-scope.js', () => countryScope);
vi.mock('../../audit-log/index.js', () => audit);
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: rating }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../../booking/commands/cancel-booking.command.js', () => ({
  cancelBookingHandler: { validate: vi.fn(), execute: vi.fn(), events: vi.fn() },
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { getUserHandler } from '../presentation/rbac.controller.js';
import { stripCredentialFields, isCredentialFieldName } from '../../../shared/utils/credentials.js';

const CREDENTIAL_FIELDS = [
  'password_hash',
  'passwordHash',
  'password',
  'old_password',
  'new_password',
  'refresh_token',
  'refresh_token_hash',
  'session_token_hash',
  'sessionTokenHash',
  'access_token',
  'remember_token',
  'reset_token',
  'password_reset_token',
  'email_verification_token',
  'two_factor_secret',
  'mfa_secret',
  'otp_secret',
  'api_key',
  'api_secret',
];

/** Raw repository row shaped like the pre-fix `SELECT u.*` result. */
const RAW_USER_ROW = {
  id: 42,
  public_id: 'pub-42',
  country_id: 1,
  phone_number: '01000000042',
  full_phone: '+2001000000042',
  email: 'user42@example.com',
  full_name: 'User 42',
  avatar_url: null,
  gender: 'male',
  birth_date: null,
  language_id: null,
  timezone: 'Africa/Cairo',
  dark_mode: 'system',
  account_status: 'active',
  last_login_at: '2026-11-01T10:00:00.000Z',
  last_login_ip: '127.0.0.1',
  is_phone_verified: 1,
  is_email_verified: 0,
  is_public: 1,
  has_seen_welcome: 0,
  has_activated_selling: 0,
  version: 1,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
  country_name: 'Egypt',
  country_iso: 'EG',
  main_sport_id: 22,
  coach_status: 'none',
  // Credentials that must never be serialised:
  password_hash: '$pbkdf2-sha512$secret-hash-value',
  passwordHash: '$pbkdf2-sha512$secret-hash-value',
  refresh_token_hash: 'refresh-hash-value',
  sessionTokenHash: 'session-hash-value',
  api_key: 'api-key-value',
};

function makeReply() {
  const reply: any = {
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
  return reply;
}

describe('shared/utils/credentials', () => {
  it('identifies snake_case and camelCase credential field names', () => {
    for (const field of CREDENTIAL_FIELDS) {
      expect(isCredentialFieldName(field)).toBe(true);
    }
  });

  it('does not treat legitimate profile fields as credentials', () => {
    for (const field of ['id', 'email', 'phone_number', 'full_name', 'coach_status', 'last_login_at', 'api_base']) {
      expect(isCredentialFieldName(field)).toBe(false);
    }
  });

  it('returns a redacted copy and never mutates the input row', () => {
    const input = { id: 1, email: 'a@b.c', password_hash: 'secret', passwordHash: 'secret' };
    const output = stripCredentialFields(input);

    expect(output).toEqual({ id: 1, email: 'a@b.c' });
    expect(output).not.toBe(input);
    // The original row still holds its values (no shared mutation side effect).
    expect(input.password_hash).toBe('secret');
  });
});

describe('GET /admin/users/:id — credential exclusion', () => {
  beforeEach(() => {
    repo.getUserById.mockReset();
    repo.getUserRoles.mockReset();
    countryScope.getUserCountryScope.mockReset();
    countryScope.getUserCountryScope.mockResolvedValue({ countryId: null });
    repo.getUserRoles.mockResolvedValue([{ role_id: 3, role_name: 'Org Admin', role_slug: 'org-admin' }]);
  });

  it('never serialises password_hash or any other credential field', async () => {
    repo.getUserById.mockResolvedValue({ ...RAW_USER_ROW });
    const reply = makeReply();

    await getUserHandler({ params: { id: '42' } } as any, reply as any);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload?.data).toBeTruthy();
    const data = reply.payload.data;

    for (const field of CREDENTIAL_FIELDS) {
      expect(data).not.toHaveProperty(field);
    }
    // Belt and braces: no key in the whole payload may look like a credential.
    for (const key of Object.keys(data)) {
      expect(isCredentialFieldName(key)).toBe(false);
    }
    expect(JSON.stringify(reply.payload)).not.toContain('secret-hash-value');
    expect(JSON.stringify(reply.payload)).not.toContain('refresh-hash-value');
    expect(JSON.stringify(reply.payload)).not.toContain('session-hash-value');

    // The legitimate admin payload is preserved.
    expect(data.id).toBe(42);
    expect(data.email).toBe('user42@example.com');
    expect(data.account_status).toBe('active');
    expect(data.coach_status).toBe('none');
    expect(Array.isArray(data.roles)).toBe(true);
  });

  it('404s an unknown user without leaking anything', async () => {
    repo.getUserById.mockResolvedValue(null);
    const reply = makeReply();

    // The global Fastify error handler maps NotFoundError → 404; the handler
    // itself must never build a payload (and therefore cannot leak a row).
    await expect(getUserHandler({ params: { id: '9999' } } as any, reply as any)).rejects.toThrow(
      'User not found',
    );
    expect(reply.payload).toBeUndefined();
  });
});
