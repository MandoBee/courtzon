import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProvider } from '../email.provider.js';

const env = vi.hoisted(() => {
  const keys = [
    'NODE_ENV',
    'LOG_LEVEL',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_HOST',
    'REDIS_PORT',
  ] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'test';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  return { keys, saved };
});

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../../../../shared/services/mailer.service.js', () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock('../../../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mocks.execute }),
}));

function notificationJob() {
  return {
    userId: 42,
    renderedTitle: 'Booking confirmed',
    renderedBody: 'Your booking is confirmed.',
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendEmail.mockReset();
  mocks.execute.mockReset();
});

afterAll(() => {
  for (const key of env.keys) {
    const value = env.saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('EmailProvider', () => {
  it('delivers an email when the user has an email address', async () => {
    mocks.execute.mockResolvedValueOnce([[{ email: 'recipient@example.com' }]]);
    mocks.sendEmail.mockResolvedValueOnce(undefined);

    const result = await new EmailProvider().deliver(notificationJob());

    expect(result).toEqual({
      success: true,
      provider: 'email',
      channel: 'email',
    });
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT email FROM users'),
      [42],
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: 'recipient@example.com',
      subject: 'Booking confirmed',
      body: 'Your booking is confirmed.',
      html:
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Booking confirmed</h2><p>Your booking is confirmed.</p></div>',
    });
  });

  it('returns a failure without sending when the user has no email address', async () => {
    mocks.execute.mockResolvedValueOnce([[{ email: null }]]);

    const result = await new EmailProvider().deliver(notificationJob());

    expect(result).toEqual({
      success: false,
      provider: 'email',
      channel: 'email',
      error: 'No email address',
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('returns a failure when the mailer throws', async () => {
    mocks.execute.mockResolvedValueOnce([[{ email: 'recipient@example.com' }]]);
    mocks.sendEmail.mockRejectedValueOnce(new Error('SMTP authentication failed'));

    const result = await new EmailProvider().deliver(notificationJob());

    expect(result).toEqual({
      success: false,
      provider: 'email',
      channel: 'email',
      error: 'SMTP authentication failed',
    });
  });
});
