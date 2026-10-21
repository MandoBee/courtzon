import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '../mailer.service.js';

const nodemailerMock = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail }));
  return { createTransport, sendMail };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: nodemailerMock.createTransport,
  },
}));

const mailEnvKeys = [
  'MAIL_TRANSPORT',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USER',
  'MAIL_PASS',
  'MAIL_FROM',
] as const;

const originalEnv = Object.fromEntries(
  mailEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof mailEnvKeys)[number], string | undefined>;

function clearMailEnv() {
  for (const key of mailEnvKeys) delete process.env[key];
}

function baseJob() {
  return {
    to: 'recipient@example.com',
    subject: 'CourtZon test email',
    body: 'Plain text body',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearMailEnv();
  nodemailerMock.createTransport.mockImplementation(() => ({
    sendMail: nodemailerMock.sendMail,
  }));
  nodemailerMock.sendMail.mockReset();
  nodemailerMock.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
});

afterEach(() => {
  for (const key of mailEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('mailer.service sendEmail', () => {
  it('does not load Nodemailer when MAIL_TRANSPORT is unset', async () => {
    await sendEmail(baseJob());

    expect(nodemailerMock.createTransport).not.toHaveBeenCalled();
    expect(nodemailerMock.sendMail).not.toHaveBeenCalled();
  });

  it('does not load Nodemailer when MAIL_TRANSPORT is explicitly log', async () => {
    process.env.MAIL_TRANSPORT = 'log';

    await sendEmail(baseJob());

    expect(nodemailerMock.createTransport).not.toHaveBeenCalled();
    expect(nodemailerMock.sendMail).not.toHaveBeenCalled();
  });

  it('maps SMTP transport configuration and message fields', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    process.env.MAIL_HOST = 'smtp.test.local';
    process.env.MAIL_PORT = '2525';
    process.env.MAIL_USER = 'smtp-user';
    process.env.MAIL_PASS = 'smtp-pass';
    process.env.MAIL_FROM = 'sender@test.local';

    await sendEmail({
      ...baseJob(),
      html: '<p>HTML body</p>',
      attachments: [
        {
          filename: 'receipt.pdf',
          path: '/tmp/receipt.pdf',
          contentType: 'application/pdf',
        },
      ],
    });

    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerMock.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.local',
      port: 2525,
      auth: {
        user: 'smtp-user',
        pass: 'smtp-pass',
      },
    });
    expect(nodemailerMock.sendMail).toHaveBeenCalledTimes(1);
    expect(nodemailerMock.sendMail).toHaveBeenCalledWith({
      from: 'sender@test.local',
      to: 'recipient@example.com',
      subject: 'CourtZon test email',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
      attachments: [
        {
          filename: 'receipt.pdf',
          path: '/tmp/receipt.pdf',
          contentType: 'application/pdf',
        },
      ],
    });
  });

  it('falls back to the plain body as HTML when html is omitted', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';

    await sendEmail(baseJob());

    expect(nodemailerMock.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Plain text body',
        html: 'Plain text body',
      }),
    );
  });

  it('propagates SMTP send errors', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    nodemailerMock.sendMail.mockRejectedValueOnce(new Error('SMTP rejected the message'));

    await expect(sendEmail(baseJob())).rejects.toThrow('SMTP rejected the message');
  });
});
