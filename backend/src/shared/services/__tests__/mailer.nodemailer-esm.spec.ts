import { describe, it, expect } from 'vitest';

/**
 * Real-module smoke test for nodemailer 10.2.1 (Stage C).
 *
 * Proves the installed package's ESM default export works with the exact
 * `import('nodemailer')` + `createTransport(...).sendMail(...)` shape used by
 * `mailer.service.ts`, and that bundled TypeScript types are present.
 *
 * `jsonTransport` produces the message JSON locally — no SMTP connection, no
 * network, no file/URL access (no attachments are used).
 */
describe('nodemailer 10.2.1 — real ESM default import', () => {
  it('exposes createTransport on the default export of the dynamic import', async () => {
    const mod = await import('nodemailer');
    expect(typeof mod.default.createTransport).toBe('function');
  });

  it('creates a transport and composes a message via jsonTransport', async () => {
    const { default: nodemailer } = await import('nodemailer');
    const transporter = nodemailer.createTransport({ jsonTransport: true });

    try {
      const info: any = await transporter.sendMail({
        from: 'noreply@courtzon.test',
        to: 'player@courtzon.test',
        subject: 'Stage C smoke',
        text: 'plain',
        html: '<p>html</p>',
      });

      expect(info.message).toBeTruthy();
      const message = JSON.parse(info.message);
      expect(message.subject).toBe('Stage C smoke');
      expect(message.to).toBeDefined();
    } finally {
      transporter.close();
    }
  });

  it('keeps the transport constructible with the production SMTP option shape', async () => {
    const { default: nodemailer } = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.invalid',
      port: 587,
      auth: { user: 'u', pass: 'p' },
    });
    expect(typeof transporter.sendMail).toBe('function');
    expect(typeof transporter.verify).toBe('function');
    transporter.close();
  });
});
