# 32 — CONFIGURATION AUDIT

**Audit:** 2026-10-04 · Variable inventory (NAMES only — secrets never exposed). Source: `.env`, `.env.example`, `backend/src/config/env.ts`, compose.

Legend: R=Required · O=Optional · S=Secret · Dev↔Prod behavior.

---

## Backend / core

| Variable | Purpose | R/O | Dev value | Prod requirement | Security | Used in |
|---|---|---|---|---|---|---|
| `NODE_ENV` | environment | R | development | production | — | env.ts, app.ts |
| `PORT` | API port | O | 3000 | 3000 | — | server.ts |
| `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` | MySQL | R | localhost/3306/courtzon_v3 | internal host | S(password) | mysql.ts |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PUBLISH_PORT` | Docker mysql | R | — | host only | S | compose |
| `REDIS_HOST/PORT/PASSWORD/DB` | Redis | R | localhost/6379 | internal | S if password | redis.client |
| `SESSION_SECRET` | cookie signing | R | dev fallback allowed | ≥32 chars required | S | cookie plugin |
| `JWT_SECRET` | Bearer tokens | O | — | set | S | auth |
| `APP_URL` | redirects/CORS | O | http://localhost:5173 | https://app domain | — | app.ts |
| `CORS_ORIGINS` | CORS allowlist | O | empty(open in dev) | set to app domains | — | app.ts |
| `LOG_LEVEL` | log verbosity | O | debug | info | — | logger |
| `RELAX_RATE_LIMIT` | relax limits | O | true (local) | **must be false/absent** | HIGH | app.ts |
| `ENABLE_API_DOCS` | swagger | O | true | false/absent | — | app.ts |
| `METRICS_TOKEN` | prom scrape token | O | — | set | S | metrics |
| `STORAGE_PROVIDER` (`local`/`s3`/`r2`) + `S3_*` | file storage | O | local | s3/r2 | S(keys) | upload |
| `COURTZON_MIGRATION_ENV` | migration env | R | local | production | — | entrypoint/guard |
| `GIT_COMMIT` | build label | O | unknown | sha | — | Dockerfile |

## Payments

| Variable | Purpose | R/O | Dev | Prod | Security | Used in |
|---|---|---|---|---|---|---|
| `PAYMENT_GATEWAY_PROVIDER` | mock/paymob/fawry | R | mock | paymob | — | env.ts (rejects mock in prod) |
| `PAYMOB_SANDBOX` | sandbox flag | O | true | false | — | gateway |
| `PAYMOB_API_KEY/SECRET/PUBLIC_KEY/MERCHANT_ID/HMAC_SECRET` | Paymob creds | O | sandbox | real | S all | payment module |
| `WEBHOOK_BASE_URL` | webhook base | O | — | https domain | — | webhook/router |

## Email / notifications

| Variable | Purpose | R/O | Security |
|---|---|---|---|
| `MAIL_TRANSPORT/HOST/PORT/USER/PASS/FROM` | SMTP | O | S(pass) |
| `TWILIO_*` / `VONAGE_*` | SMS (currently mock) | O | S |
| `FCM_SERVICE_ACCOUNT_JSON`, `APNS_*` | Push (currently mock) | O | S |

## Auth extras

| Variable | Purpose | R/O | Security |
|---|---|---|---|
| `SUPER_ADMIN_EMAIL/PASSWORD` | bootstrap admin | O | S(password) |
| `AUTH_TEMPORARY_RESET_ENABLED` | temp-reset gate | O | HIGH if true in prod |

## Frontend build

| Variable | Purpose | Used in |
|---|---|---|
| `VITE_API_URL` | API base override | services/api.ts |
| `VITE_PAYMOB_PUBLIC_KEY` | unified checkout key | build |
| `VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED` | mirrors AUTH flag | build |

## Observability/backup

| Variable | Purpose |
|---|---|
| `GRAFANA_USER/PASSWORD` | grafana admin |
| `BACKUP_ENCRYPTION_KEY` | backup encryption (prod) |

## Environment seams / risks
- `.env` drives docker-compose → secrets must live in protected host env (Coolify UI) in prod.
- Ensure `RELax`-style flags are never set in prod env; CI guard recommended.
- `COURTZON_MIGRATION_ENV=local` currently set — confirm prod override exists.
- Frontend runtime env uses `import.meta.env` (build-time baked) — changing `VITE_*` requires rebuild.