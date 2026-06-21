import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, TestContext } from '../../../tests/helpers/integration-setup.js';
import { createPool } from '../../../database/mysql.js';
import type { AuthResponse } from '../presentation/auth.dto.js';
import type { AuthService } from '../application/auth.service.js';

let ctx: TestContext;
let authService: AuthService;

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
}, 120000);

afterAll(async () => {
  await stopContainers();
}, 30000);

describe('Auth Integration', () => {
  it('should register a new player', async () => {
    const result: AuthResponse = await authService.register(
      {
        countryId: 1,
        phoneNumber: '05000000001',
        password: 'test123456',
        fullName: 'Test Player',
        email: 'testplayer@example.com',
        gender: 'male',
        birthDate: '2000-01-15',
        mainSportId: 1,
        mainLevelId: 1,
        timezone: 'UTC',
        darkMode: 'system',
      },
      { ip: '127.0.0.1', userAgent: 'vitest' }
    );

    expect(result.user).toBeDefined();
    expect(result.user.fullName).toBe('Test Player');
    expect(result.user.phoneNumber).toBe('05000000001');
    expect(result.user.email).toBe('testplayer@example.com');
    expect(result.user.gender).toBe('male');
    expect(result.session.sessionToken).toBeTruthy();
    expect(result.session.refreshToken).toBeTruthy();
  });

  it('should reject duplicate phone registration', async () => {
    await expect(
      authService.register(
        {
          countryId: 1,
          phoneNumber: '05000000001',
          password: 'test123456',
          fullName: 'Duplicate Player',
          email: 'duplicate@example.com',
          gender: 'female',
          timezone: 'UTC',
          darkMode: 'system',
        },
        { ip: '127.0.0.1' }
      )
    ).rejects.toThrow(/already registered/i);
  });

  it('should reject duplicate email registration', async () => {
    await expect(
      authService.register(
        {
          countryId: 1,
          phoneNumber: '05000000002',
          password: 'test123456',
          fullName: 'Duplicate Email Player',
          email: 'testplayer@example.com',
          gender: 'male',
          timezone: 'UTC',
          darkMode: 'system',
        },
        { ip: '127.0.0.1' }
      )
    ).rejects.toThrow(/already registered/i);
  });

  it('should login with correct credentials', async () => {
    const result: AuthResponse = await authService.login(
      {
        phoneNumber: '05000000001',
        countryCode: '+971',
        password: 'test123456',
      },
      { ip: '127.0.0.1', deviceFingerprint: 'test-fingerprint-1' }
    );

    expect(result.user).toBeDefined();
    expect(result.user.fullName).toBe('Test Player');
    expect(result.session.sessionToken).toBeTruthy();
    expect(result.session.refreshToken).toBeTruthy();
  });

  it('should reject login with wrong password', async () => {
    await expect(
      authService.login(
        { phoneNumber: '05000000001',
        countryCode: '+971', password: 'wrongpassword' },
        { ip: '127.0.0.1' }
      )
    ).rejects.toThrow(/Invalid/i);
  });

  it('should reject login with non-existent phone', async () => {
    await expect(
      authService.login(
        { phoneNumber: '05999999999', countryCode: '+971', password: 'test123456' },
        { ip: '127.0.0.1' }
      )
    ).rejects.toThrow(/Invalid/i);
  });

  it('should get user profile', async () => {
    const result: AuthResponse = await authService.login(
      { phoneNumber: '05000000001',
        countryCode: '+971', password: 'test123456' },
      { ip: '127.0.0.1' }
    );

    const profile = await authService.getProfile(result.user.id);
    expect(profile.fullName).toBe('Test Player');
    expect(profile.email).toBe('testplayer@example.com');
  });

  it('should refresh session token', async () => {
    const result = await authService.register(
      {
        countryId: 1,
        phoneNumber: '05000000003',
        password: 'test123456',
        fullName: 'Refresh Tester',
        email: 'refreshtest@example.com',
        gender: 'female',
        timezone: 'UTC',
        darkMode: 'system',
      },
      { ip: '127.0.0.1' }
    );

    const refreshed = await authService.refresh(result.session.refreshToken);
    expect(refreshed.session.sessionToken).toBeTruthy();
    expect(refreshed.session.refreshToken).toBeTruthy();
    expect(refreshed.session.sessionToken).not.toBe(result.session.sessionToken);
  });

  it('should reject invalid refresh token', async () => {
    await expect(
      authService.refresh('invalid-token')
    ).rejects.toThrow(/Invalid refresh/i);
  });

  it('should update user profile', async () => {
    const result: AuthResponse = await authService.login(
      { phoneNumber: '05000000001',
        countryCode: '+971', password: 'test123456' },
      { ip: '127.0.0.1' }
    );

    const updated = await authService.updateProfile(result.user.id, {
      fullName: 'Updated Player Name',
      darkMode: 'dark',
    });

    expect(updated.fullName).toBe('Updated Player Name');
    expect(updated.darkMode).toBe('dark');
  });

  it('should logout and invalidate session', async () => {
    const result: AuthResponse = await authService.register(
      {
        countryId: 1,
        phoneNumber: '05000000004',
        password: 'test123456',
        fullName: 'Logout Tester',
        email: 'logouttest@example.com',
        gender: 'male',
        timezone: 'UTC',
        darkMode: 'system',
      },
      { ip: '127.0.0.1' }
    );

    await authService.logout(result.session.refreshToken);

    await expect(
      authService.refresh(result.session.refreshToken)
    ).rejects.toThrow(/Invalid refresh/i);
  });
});
