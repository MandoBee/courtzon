import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  savePushToken: vi.fn(),
  removePushToken: vi.fn(),
  listPushTokens: vi.fn(),
  findPushToken: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ query: vi.fn(), execute: vi.fn() }),
}));
vi.mock('../../notifications/application/device.service.js', () => ({
  savePushToken: mocks.savePushToken,
  removePushToken: mocks.removePushToken,
  listPushTokens: mocks.listPushTokens,
  findPushToken: mocks.findPushToken,
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mocks.recordAudit }));

import {
  registerPushTokenHandler,
  unregisterPushTokenHandler,
  listPushTokensHandler,
} from './mobile.controller.js';

function req(overrides: any = {}): any {
  return {
    userId: 7,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    body: {},
    ...overrides,
  };
}

function res(): any {
  const r: any = { statusCode: 200, sent: null };
  r.status = vi.fn((code: number) => { r.statusCode = code; return r; });
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerPushTokenHandler', () => {
  it('registers a valid token through the device service and audits the numeric id only', async () => {
    mocks.savePushToken.mockResolvedValue(42);
    const reply = res();

    await registerPushTokenHandler(
      req({ body: { token: '  token-abc  ', platform: 'android', deviceName: 'Pixel' } }),
      reply,
    );

    expect(mocks.savePushToken).toHaveBeenCalledWith(7, 'token-abc', 'android', {
      deviceName: 'Pixel',
    });
    expect(reply.sent).toEqual({ data: { registered: true } });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit.entityId).toBe(42);
    expect(JSON.stringify(audit)).not.toContain('token-abc');
  });

  it.each([
    ['missing token', {}],
    ['empty token', { token: '   ', platform: 'ios' }],
    ['token longer than 500', { token: 'a'.repeat(501), platform: 'ios' }],
    ['missing platform', { token: 'token-abc' }],
    ['unsupported platform', { token: 'token-abc', platform: 'windows' }],
    ['deviceName longer than 200', { token: 'token-abc', platform: 'ios', deviceName: 'a'.repeat(201) }],
  ])('rejects %s with a 400 and no write', async (_label, body) => {
    const reply = res();
    await registerPushTokenHandler(req({ body }), reply);

    expect(reply.statusCode).toBe(400);
    expect(reply.sent).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(mocks.savePushToken).not.toHaveBeenCalled();
  });

  it('rejects a token owned by another user with 409 and no ownership transfer', async () => {
    mocks.savePushToken.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    const reply = res();

    await registerPushTokenHandler(req({ body: { token: 'owned-elsewhere', platform: 'web' } }), reply);

    expect(reply.statusCode).toBe(409);
    expect(reply.sent).toMatchObject({ error: 'CONFLICT' });
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe('listPushTokensHandler', () => {
  it('returns only the authenticated user tokens with device_id explicitly null', async () => {
    mocks.listPushTokens.mockResolvedValue([
      {
        id: 1,
        token: 'token-a',
        platform: 'android',
        device_name: 'Pixel',
        is_active: 1,
        created_at: '2026-10-29T00:00:00.000Z',
        updated_at: '2026-10-29T00:00:00.000Z',
      },
    ]);
    const reply = res();

    await listPushTokensHandler(req(), reply);

    expect(mocks.listPushTokens).toHaveBeenCalledWith(7);
    expect(reply.sent).toEqual({
      data: [
        {
          id: 1,
          token: 'token-a',
          platform: 'android',
          device_name: 'Pixel',
          device_id: null,
          is_active: 1,
          created_at: '2026-10-29T00:00:00.000Z',
          updated_at: '2026-10-29T00:00:00.000Z',
        },
      ],
    });
  });
});

describe('unregisterPushTokenHandler', () => {
  it('deactivates the current user token and audits the numeric id only', async () => {
    mocks.findPushToken.mockResolvedValue({ id: 9, platform: 'ios', device_name: 'iPhone' });
    mocks.removePushToken.mockResolvedValue(undefined);
    const reply = res();

    await unregisterPushTokenHandler(req({ body: { token: 'token-a' } }), reply);

    expect(mocks.findPushToken).toHaveBeenCalledWith(7, 'token-a');
    expect(mocks.removePushToken).toHaveBeenCalledWith(7, 'token-a');
    expect(reply.sent).toEqual({ data: { unregistered: true } });

    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit.entityId).toBe(9);
    expect(JSON.stringify(audit)).not.toContain('token-a');
  });

  it('does not touch a token owned by another user (404, no update)', async () => {
    mocks.findPushToken.mockResolvedValue(null);
    const reply = res();

    await expect(
      unregisterPushTokenHandler(req({ body: { token: 'other-user-token' } }), reply),
    ).rejects.toThrow();

    expect(mocks.removePushToken).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects an invalid/missing token before any lookup', async () => {
    const reply = res();
    await unregisterPushTokenHandler(req({ body: { token: '' } }), reply);

    expect(reply.statusCode).toBe(400);
    expect(mocks.findPushToken).not.toHaveBeenCalled();
    expect(mocks.removePushToken).not.toHaveBeenCalled();
  });
});
