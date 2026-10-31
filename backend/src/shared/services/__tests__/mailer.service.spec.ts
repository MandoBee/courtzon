import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mailer service (Stage C — nodemailer 10.2.1).
 *
 * `sendEmail` has two paths:
 *   - `MAIL_TRANSPORT=smtp` → dynamic `import('nodemailer')` + `createTransport`/`sendMail`
 *   - anything else (default) → log-only transport, no nodemailer import, no network
 *
 * These tests mock the logger and nodemailer, so no mail is sent and no DB/network is touched.
 */

const { loggerMock, createTransportMock, sendMailMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import { sendEmail } from '../mailer.service.js';

const MAIL_KEYS = ['MAIL_TRANSPORT', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'] as const;
const savedEnv: Partial<Record<(typeof MAIL_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of MAIL_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  sendMailMock.mockResolvedValue({ messageId: 'test-message-id' });
});

afterEach(() => {
  for (const key of MAIL_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('sendEmail — SMTP transport', () => {
  it('creates the SMTP transport with documented defaults and sends the mapped message', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';

    await sendEmail({ to: 'player@courtzon.test', subject: 'Booking confirmed', body: 'Plain body' });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'localhost',
      port: 587,
      auth: { user: '', pass: '' },
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      from: 'noreply@courtzon.com',
      to: 'player@courtzon.test',
      subject: 'Booking confirmed',
      text: 'Plain body',
      html: 'Plain body', // falls back to the text body
    });
    expect(payload.attachments).toBeUndefined();
  });

  it('honors MAIL_* overrides, explicit html, and maps attachments', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    process.env.MAIL_HOST = 'smtp.example.test';
    process.env.MAIL_PORT = '2525';
    process.env.MAIL_USER = 'mailer-user';
    process.env.MAIL_PASS = 'mailer-pass';
    process.env.MAIL_FROM = 'support@courtzon.test';

    await sendEmail({
      to: 'coach@courtzon.test',
      subject: 'Invoice',
      body: 'Text version',
      html: '<p>HTML version</p>',
      attachments: [
        { filename: 'invoice.pdf', path: '/tmp/invoice.pdf', contentType: 'application/pdf' },
        { filename: 'note.txt', path: '/tmp/note.txt' },
      ],
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 2525,
      auth: { user: 'mailer-user', pass: 'mailer-pass' },
    });

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.from).toBe('support@courtzon.test');
    expect(payload.text).toBe('Text version');
    expect(payload.html).toBe('<p>HTML version</p>');
    expect(payload.attachments).toEqual([
      { filename: 'invoice.pdf', path: '/tmp/invoice.pdf', contentType: 'application/pdf' },
      { filename: 'note.txt', path: '/tmp/note.txt', contentType: undefined },
    ]);
  });

  it('propagates transport errors to the caller (no silent swallow)', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    const failure = new Error('SMTP connection refused');
    sendMailMock.mockRejectedValueOnce(failure);

    await expect(
      sendEmail({ to: 'player@courtzon.test', subject: 'Retry me', body: 'body' }),
    ).rejects.toThrow('SMTP connection refused');

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('does not log the [LOG MAILER] body path when SMTP succeeds', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';

    await sendEmail({ to: 'player@courtzon.test', subject: 'Quiet', body: 'secret body' });

    const logPayloads = JSON.stringify(loggerMock.info.mock.calls);
    expect(logPayloads).not.toContain('[LOG MAILER]');
  });
});

describe('sendEmail — default log transport', () => {
  it('does not import nodemailer when MAIL_TRANSPORT is unset', async () => {
    await sendEmail({ to: 'player@courtzon.test', subject: 'Logged only', body: 'body text' });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledTimes(2);

    const [context, message] = loggerMock.info.mock.calls[1];
    expect(message).toBe('[LOG MAILER]');
    expect(context).toMatchObject({
      to: 'player@courtzon.test',
      subject: 'Logged only',
      body: 'body text',
      attachmentCount: 0,
    });
  });

  it('treats an explicit "log" value and unknown values as the log transport', async () => {
    process.env.MAIL_TRANSPORT = 'log';
    await sendEmail({ to: 'a@courtzon.test', subject: 'Log', body: 'log body' });

    process.env.MAIL_TRANSPORT = 'not-a-real-transport';
    await sendEmail({ to: 'b@courtzon.test', subject: 'Unknown', body: 'unknown body' });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    const messages = loggerMock.info.mock.calls.map((call) => call[1]);
    expect(messages.filter((m) => m === '[LOG MAILER]')).toHaveLength(2);
  });

  it('logs the attachment count without exposing attachment paths', async () => {
    await sendEmail({
      to: 'admin@courtzon.test',
      subject: 'With files',
      body: 'body',
      attachments: [
        { filename: 'a.pdf', path: '/secret/path/a.pdf' },
        { filename: 'b.png', path: '/secret/path/b.png' },
      ],
    });

    const [context, message] = loggerMock.info.mock.calls[1];
    expect(message).toBe('[LOG MAILER]');
    expect(context.attachmentCount).toBe(2);
    expect(JSON.stringify(context)).not.toContain('/secret/path');
  });
});
