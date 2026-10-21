/**
 * OPT-IN SMTP integration test for the REAL `sendEmail` implementation
 * (src/shared/services/mailer.service.ts) on Nodemailer 10.1.7.
 *
 * WHAT THIS VERIFIES
 *   The actual SMTP handshake against a locally running Mailpit instance and the
 *   message as stored by Mailpit: envelope sender, recipient, subject, the plain
 *   text part, the HTML part, and the exact attachment bytes (byte-for-byte).
 *
 * HOW TO OPT IN (this test NEVER starts Mailpit, containers, MySQL or Redis)
 *   1. Start Mailpit yourself, bound to loopback only:
 *        docker run -d --name mailpit-smtp-test \
 *          -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:latest
 *      or the standalone binary:
 *        mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025
 *   2. Run the dedicated command from backend/:
 *        npm run test:int:smtp
 *      (entry point: vitest.mailpit.config.ts, which sets
 *       COURTZON_MAILPIT_INTEGRATION=1 so this suite executes)
 *
 * GATING
 *   - `npm test` / `npm run test:unit` (vitest.config.ts) never collects this
 *     file: it is excluded by the "*.integration.spec.ts" exclude rule.
 *   - `npm run test:int` (vitest.integration.config.ts) collects it but SKIPS
 *     it unless COURTZON_MAILPIT_INTEGRATION=1, so developers without Mailpit
 *     are unaffected. The skip is intentional; it is NOT a pass.
 *
 * ENDPOINTS (loopback only — enforced at runtime)
 *   SMTP  127.0.0.1:1025   → MAILPIT_SMTP_HOST / MAILPIT_SMTP_PORT
 *   API   http://127.0.0.1:8025 → MAILPIT_API_URL
 *         used endpoints: GET /api/v1/info (preflight),
 *         GET /api/v1/messages (locate by unique subject),
 *         GET /api/v1/message/{id} (text/HTML/attachment metadata),
 *         GET /api/v1/message/{id}/part/{partId} (decoded attachment bytes),
 *         GET /api/v1/message/{id}/raw (MIME source)
 *
 * ENVIRONMENT VARIABLES
 *   COURTZON_MAILPIT_INTEGRATION  opt-in flag; only '1' executes this suite
 *                                 ('0' or unset = skipped)
 *   MAILPIT_SMTP_HOST             default 127.0.0.1 (non-loopback refused)
 *   MAILPIT_SMTP_PORT             default 1025
 *   MAILPIT_API_URL               default http://127.0.0.1:8025 (non-loopback refused)
 *   MAILPIT_FROM                  default noreply@courtzon.test
 *   MAILPIT_TO                    default recipient@example.test
 *   MAIL_USER / MAIL_PASS         OPTIONAL dummy local-only SMTP credentials. Only
 *                                 needed if YOUR Mailpit advertises AUTH. Default
 *                                 Mailpit does not advertise AUTH, so Nodemailer
 *                                 skips login; when unset this test clears both
 *                                 variables so no credentials are ever sent.
 *
 * NOT REQUIRED: MySQL, Redis, external SMTP providers, real credentials,
 * internet access. No containers are started/stopped/modified by this test and
 * Docker Compose / production Docker configuration is untouched. The test is
 * non-destructive: it never deletes messages from the Mailpit inbox (it locates
 * its own message by a unique per-run subject token).
 *
 * Full documentation: docs/testing/mailpit-smtp-integration.md
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sendEmail } from '../mailer.service.js';

const OPT_IN = process.env.COURTZON_MAILPIT_INTEGRATION === '1';

if (!OPT_IN) {
  // Emitted whenever this file is collected WITHOUT opt-in (e.g. a full
  // `npm run test:int`): skipped ≠ passed, so make the reason visible.
  console.warn(
    '[mailpit.integration] SKIPPED — opt in with `npm run test:int:smtp` from backend/ ' +
      '(requires a locally running Mailpit; see docs/testing/mailpit-smtp-integration.md)',
  );
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const START_HINT = [
  'Start Mailpit explicitly on loopback (this test never starts it):',
  '  docker run -d --name mailpit-smtp-test -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:latest',
  'then run `npm run test:int:smtp` from backend/.',
  'Endpoints + env vars: docs/testing/mailpit-smtp-integration.md',
].join('\n');

interface MailpitConfig {
  host: string;
  port: number;
  apiUrl: string;
  from: string;
  to: string;
}

/** Resolve + validate configuration. Throws with an actionable message on any problem. */
function resolveConfig(): MailpitConfig {
  const host = (process.env.MAILPIT_SMTP_HOST || '127.0.0.1').trim();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `[mailpit.integration] MAILPIT_SMTP_HOST="${host}" is not a loopback address. ` +
        'This test refuses non-loopback SMTP hosts so it can never send towards an external provider. ' +
        'Use 127.0.0.1 (default).',
    );
  }

  const portRaw = (process.env.MAILPIT_SMTP_PORT || '1025').trim();
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `[mailpit.integration] MAILPIT_SMTP_PORT="${portRaw}" is not a valid TCP port (expected an integer 1-65535, default 1025).`,
    );
  }

  const apiUrlRaw = (process.env.MAILPIT_API_URL || 'http://127.0.0.1:8025').trim().replace(/\/+$/, '');
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiUrlRaw);
  } catch {
    throw new Error(
      `[mailpit.integration] MAILPIT_API_URL="${apiUrlRaw}" is not a valid URL (expected e.g. http://127.0.0.1:8025).`,
    );
  }
  if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
    throw new Error(`[mailpit.integration] MAILPIT_API_URL protocol "${apiUrl.protocol}" is not supported (http/https only).`);
  }
  if (!LOOPBACK_HOSTS.has(apiUrl.hostname)) {
    throw new Error(
      `[mailpit.integration] MAILPIT_API_URL host "${apiUrl.hostname}" is not a loopback address — ` +
        'this test only talks to a locally running Mailpit.',
    );
  }

  const from = (process.env.MAILPIT_FROM || 'noreply@courtzon.test').trim();
  const to = (process.env.MAILPIT_TO || 'recipient@example.test').trim();
  if (!from || !to) {
    throw new Error('[mailpit.integration] MAILPIT_FROM and MAILPIT_TO must be non-empty when provided.');
  }

  return { host, port, apiUrl: apiUrlRaw, from, to };
}

/** Preflight 1: the Mailpit HTTP API must answer like a Mailpit instance. */
async function assertApiReachable(apiUrl: string): Promise<void> {
  let info: any;
  try {
    const res = await fetch(`${apiUrl}/api/v1/info`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = await res.json();
  } catch (err) {
    throw new Error(
      `[mailpit.integration] Mailpit API unreachable at ${apiUrl} (${(err as Error).message}).\n${START_HINT}`,
    );
  }
  if (!info || typeof info.Version !== 'string') {
    throw new Error(
      `[mailpit.integration] ${apiUrl} answered but does not look like a Mailpit API (missing Version). ` +
        `Is something other than Mailpit listening there?\n${START_HINT}`,
    );
  }
}

/** Preflight 2: the Mailpit SMTP port must accept a TCP connection. */
function assertSmtpReachable(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = connect({ host, port });
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`[mailpit.integration] Mailpit SMTP unreachable at ${host}:${port} (${message}).\n${START_HINT}`));
    };
    socket.setTimeout(3000, () => fail('connection timed out after 3000ms'));
    socket.once('error', (err) => fail(err.message));
    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners('error');
      socket.removeAllListeners('timeout');
      socket.on('error', () => undefined); // absorb teardown errors
      socket.destroy();
      resolve();
    });
  });
}

/** Poll the Mailpit API until the uniquely-subjected message shows up. */
async function waitForMessage(apiUrl: string, subject: string, timeoutMs = 5000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = new Error('not attempted');
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/messages`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const matches = (data.messages ?? []).filter((m: any) => m.Subject === subject);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        throw new Error(`found ${matches.length} messages with subject "${subject}" — expected exactly 1 (run-id collision?)`);
      }
      lastError = new Error('no message with the expected subject yet');
    } catch (err) {
      if ((err as Error).message.includes('expected exactly 1')) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `[mailpit.integration] message with subject "${subject}" never appeared in Mailpit within ${timeoutMs}ms ` +
      `(last state: ${(lastError as Error).message}). The SMTP send completed, so the Mailpit API at ` +
      `${apiUrl} is not returning it — check that instance.`,
  );
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`[mailpit.integration] GET ${url} → HTTP ${res.status}`);
  return res.json();
}

async function getBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`[mailpit.integration] GET ${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

describe.skipIf(!OPT_IN)('mailer.service sendEmail → local Mailpit SMTP (opt-in integration)', () => {
  const mailEnvKeys = ['MAIL_TRANSPORT', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'] as const;
  const originalEnv = Object.fromEntries(mailEnvKeys.map((k) => [k, process.env[k]])) as Record<
    (typeof mailEnvKeys)[number],
    string | undefined
  >;

  let cfg: MailpitConfig;
  let tempDir: string;
  let attachmentPath: string;
  // Deterministic non-text bytes (0x00..0xFF) so any encoding corruption is detectable.
  const attachmentBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

  beforeAll(async () => {
    cfg = resolveConfig();
    await assertApiReachable(cfg.apiUrl);
    await assertSmtpReachable(cfg.host, cfg.port);

    tempDir = await mkdtemp(path.join(tmpdir(), 'courtzon-mailpit-'));
    attachmentPath = path.join(tempDir, 'attachment.bin');
    await writeFile(attachmentPath, attachmentBytes);

    // Optional dummy local-only credentials, only if the developer's Mailpit
    // advertises AUTH. Otherwise both are cleared (production `sendEmail`
    // always passes an auth block; empty user/pass + no advertised AUTH means
    // Nodemailer skips login entirely).
    const providedUser = process.env.MAIL_USER;
    const providedPass = process.env.MAIL_PASS;

    for (const key of mailEnvKeys) delete process.env[key];
    process.env.MAIL_TRANSPORT = 'smtp';
    process.env.MAIL_HOST = cfg.host;
    process.env.MAIL_PORT = String(cfg.port);
    process.env.MAIL_FROM = cfg.from;
    if (providedUser && providedPass) {
      process.env.MAIL_USER = providedUser;
      process.env.MAIL_PASS = providedPass;
    }
  });

  afterAll(async () => {
    for (const key of mailEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('delivers sender, recipient, subject, text, HTML and exact attachment bytes over real SMTP', async () => {
    const runId = randomUUID();
    const subject = `CourtZon Mailpit SMTP integration ${runId}`;
    const body = `Plain text body for ${runId}\nLine two with <tags> & symbols.`;
    const html = `<h1>CourtZon SMTP integration</h1><p data-run="${runId}">HTML body</p>`;
    const filename = `courtzon-attachment-${runId}.bin`;

    // Real production code path: dynamic `import('nodemailer')` + createTransport + sendMail.
    // Any SMTP handshake/rejection failure rejects here.
    await sendEmail({
      to: cfg.to,
      subject,
      body,
      html,
      attachments: [{ filename, path: attachmentPath, contentType: 'application/octet-stream' }],
    });

    const summary = await waitForMessage(cfg.apiUrl, subject);
    expect(summary.Subject).toBe(subject);

    // 1. Envelope sender + recipient as stored by the receiving MTA
    expect(summary.From?.Address).toBe(cfg.from);
    expect((summary.To ?? []).map((t: any) => t.Address)).toContain(cfg.to);

    // 2. Full message: plain text part, HTML part, attachment metadata
    const detail = await getJson(`${cfg.apiUrl}/api/v1/message/${summary.ID}`);
    expect(detail.Subject).toBe(subject);
    // SMTP/MIME canonicalizes line endings to CRLF (Nodemailer converts LF → CRLF
    // when building the body), so compare modulo that protocol-mandated rewrite.
    // The content itself must match exactly.
    const normalizeEols = (s: string) => s.replace(/\r\n/g, '\n');
    expect(normalizeEols(detail.Text)).toBe(normalizeEols(body));
    expect(detail.HTML).toBe(html);
    expect(detail.Attachments).toHaveLength(1);

    const [att] = detail.Attachments;
    expect(att.FileName).toBe(filename);
    expect(att.ContentType).toBe('application/octet-stream');
    expect(att.Size).toBe(attachmentBytes.length);

    // 3. Exact attachment bytes (decoded MIME part vs. the file on disk)
    const received = await getBytes(`${cfg.apiUrl}/api/v1/message/${summary.ID}/part/${att.PartID}`);
    expect(received.length).toBe(attachmentBytes.length);
    expect(Buffer.compare(received, attachmentBytes)).toBe(0);
    expect(createHash('sha256').update(received).digest('hex')).toBe(String(att.Checksums?.SHA256 || '').toLowerCase());

    // 4. MIME-level evidence that the delivery really is multipart with our attachment
    const raw = await (await fetch(`${cfg.apiUrl}/api/v1/message/${summary.ID}/raw`, { signal: AbortSignal.timeout(5000) })).text();
    expect(raw).toContain('multipart/mixed');
    expect(raw).toContain(filename);
  }, 30000);
});
