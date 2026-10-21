# Mailpit SMTP Integration Testing (Nodemailer 10.x)

Opt-in integration test that exercises the **real** `sendEmail` implementation
(`backend/src/shared/services/mailer.service.ts`) over a real SMTP connection
using **Nodemailer 10.1.7**, delivered to a locally running
[Mailpit](https://mailpit.axllent.org/) instance.

It exists to validate the Nodemailer 8 → 10 upgrade against an actual SMTP
handshake and an actual stored MIME message — not a mock.

## Files

| File | Purpose |
|------|---------|
| `backend/src/shared/services/__tests__/mailer.service.mailpit.integration.spec.ts` | The test |
| `backend/vitest.mailpit.config.ts` | Dedicated opt-in Vitest project (no MySQL/Redis setup) |
| `backend/package.json` → `test:int:smtp` | The only entry point that runs it |

## How to run

### 1. Start Mailpit explicitly (developer step — the test never starts it)

Bound to **loopback only**:

```bash
docker run -d --name mailpit-smtp-test \
  -p 127.0.0.1:1025:1025 \
  -p 127.0.0.1:8025:8025 \
  axllent/mailpit:latest
```

or with the standalone binary:

```bash
mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025
```

This is a separate throwaway container — it is **not** part of the CourtZon
Docker Compose stack, and nothing in the Compose/production configuration is
modified. Stop/remove it when finished (`docker rm -f mailpit-smtp-test`).

### 2. Run the test

```bash
cd backend
npm run test:int:smtp
```

## Required endpoints

| Endpoint | Default | Used for | Env var |
|----------|---------|----------|---------|
| SMTP | `127.0.0.1:1025` | Real SMTP handshake + delivery | `MAILPIT_SMTP_HOST` / `MAILPIT_SMTP_PORT` |
| REST API | `http://127.0.0.1:8025` | Preflight + message assertions | `MAILPIT_API_URL` |

API endpoints used by the test:

- `GET /api/v1/info` — preflight (is a Mailpit API there?)
- `GET /api/v1/messages` — locate the message by its unique per-run subject
- `GET /api/v1/message/{id}` — subject, `From`/`To`, `Text`, `HTML`, attachment metadata + SHA-256
- `GET /api/v1/message/{id}/part/{partId}` — decoded attachment bytes (byte-for-byte comparison)
- `GET /api/v1/message/{id}/raw` — raw MIME source

**Both hosts must be loopback** (`127.0.0.1`, `localhost`, `::1`); the test
fails fast on any non-loopback value so it can never send towards an external
SMTP provider.

## Environment variables

| Variable | Required | Default | Meaning |
|----------|----------|---------|---------|
| `COURTZON_MAILPIT_INTEGRATION` | set automatically by `npm run test:int:smtp` | unset | Opt-in flag — only `1` executes the suite |
| `MAILPIT_SMTP_HOST` | no | `127.0.0.1` | SMTP host (loopback enforced) |
| `MAILPIT_SMTP_PORT` | no | `1025` | SMTP port |
| `MAILPIT_API_URL` | no | `http://127.0.0.1:8025` | Mailpit REST API base URL (loopback enforced) |
| `MAILPIT_FROM` | no | `noreply@courtzon.test` | Expected envelope sender |
| `MAILPIT_TO` | no | `recipient@example.test` | Expected recipient |
| `MAIL_USER` / `MAIL_PASS` | no | cleared | Dummy **local-only** SMTP credentials — only if *your* Mailpit advertises AUTH. Default Mailpit does not advertise AUTH, so Nodemailer skips login; when unset the test clears both so no credentials are ever sent. |

No real credentials, secrets, or internet access are involved.

## What is verified

1. Real SMTP connect/EHLO/MAIL/RCPT/DATA handshake via Nodemailer 10.1.7
   (production code path, including the dynamic `import('nodemailer')`).
2. Sender (`MAIL_FROM`) and recipient as stored by the receiving MTA.
3. Subject (unique per run; the test never deletes messages from the inbox).
4. Plain-text part — exact equality.
5. HTML part — exact equality.
6. Attachment bytes — byte-for-byte comparison of the decoded MIME part against
   the file on disk (plus SHA-256 cross-check against Mailpit's checksum) and
   MIME-level evidence in the raw source.

## What is NOT required

- MySQL, Redis, Testcontainers, external SMTP providers, real credentials,
  internet access.
- The dedicated config (`vitest.mailpit.config.ts`) has **no** globalSetup or
  setupFiles, so nothing else in the stack is touched.
- The test never starts, stops, or modifies containers, and never modifies
  Docker Compose.

## Gating (how it stays opt-in)

| Command | Config | Behaviour |
|---------|--------|-----------|
| `npm test` / `npm run test:unit` | `vitest.config.ts` | Spec **excluded** by the `src/**/*.integration.spec.ts` rule — never collected |
| `npm run test:int` | `vitest.integration.config.ts` | Spec collected but **skipped** (`COURTZON_MAILPIT_INTEGRATION` unset) — printed as `SKIPPED`, never a silent pass |
| `npm run test:int:smtp` | `vitest.mailpit.config.ts` | **Opt-in**: runs; fails clearly if Mailpit or config is missing |

Gate self-check without a Mailpit instance:

```powershell
$env:COURTZON_MAILPIT_INTEGRATION = '0'; npm run test:int:smtp   # collected → skipped
```

## Failure behaviour

- Mailpit API/SMTP unreachable → `beforeAll` throws an error that names the
  endpoint and prints the exact `docker run` command to start Mailpit.
- Invalid/missing configuration (bad port, bad URL, non-loopback host) →
  `beforeAll` throws a message naming the offending variable.
- Message accepted over SMTP but never visible via the API → the polling
  assertion fails with the subject and the API URL.

## Cleaning up

```bash
docker rm -f mailpit-smtp-test
```
