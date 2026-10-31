# Environment Variable Matrix

> Complete reference of every environment variable used by the CourtZon-V3 project.
> Services: **C** = Common, **B** = Backend, **F** = Frontend, **D** = Docker Compose, **M** = Monitoring

| Variable | Services | Required | Default | Description |
|---|---|---|---|---|
| `NODE_ENV` | C, B | ✓ | `development` | Application environment: `development`, `test`, or `production` |
| `LOG_LEVEL` | C, B | | `debug` (dev), `info` (prod) | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `DB_HOST` | B | ✓ | `localhost` | MySQL hostname (use service name `mysql` inside Docker) |
| `DB_PORT` | B | ✓ | `3306` | MySQL server port |
| `DB_NAME` | B | ✓ | `courtzon_v2` | MySQL database name |
| `DB_USER` | B | ✓ | `courtzon_app` | Backend database user (least-privilege) |
| `DB_PASSWORD` | B | ✓ | — | Backend database user password |
| `REDIS_HOST` | B | ✓ | `localhost` | Redis hostname (use service name `redis` inside Docker) |
| `REDIS_PORT` | B | ✓ | `6379` | Redis server port |
| `REDIS_PASSWORD` | B | | _(empty)_ | Redis password |
| `REDIS_DB` | B | | `0` | Redis database index (`0`–`15`) |
| `PORT` | B | | `3000` | Backend server listen port |
| `APP_URL` | B | | `http://localhost:5173` | Public backend URL for CORS, redirects, webhooks |
| `WEBHOOK_BASE_URL` | B | | `APP_URL` | Overrides `APP_URL` for payment webhook callbacks |
| `CORS_ORIGINS` | B | | _(empty)_ | Comma-separated allowed CORS origins |
| `SESSION_SECRET` | B | ✓ (prod) | — | Session cookie signing secret (min 32 characters) |
| `JWT_SECRET` | B | | `SESSION_SECRET` | JWT signing secret (falls back to `SESSION_SECRET`) |
| `ENABLE_API_DOCS` | B | | `true` (dev), `false` (prod) | Enable Swagger API docs at `/docs` |
| `RELAX_RATE_LIMIT` | B | | — | Set to `true` to bypass rate limits (dev only) |
| `STORAGE_PROVIDER` | B | | `local` | File storage backend: `local`, `s3`, or `r2` |
| `S3_ENDPOINT` | B | ✓ (s3/r2) | — | S3-compatible endpoint URL |
| `S3_BUCKET` | B | ✓ (s3/r2) | — | S3 bucket name |
| `S3_ACCESS_KEY` | B | ✓ (s3/r2) | — | S3 access key ID |
| `S3_SECRET_KEY` | B | ✓ (s3/r2) | — | S3 secret access key |
| `S3_REGION` | B | | `auto` | S3 region |
| `S3_PUBLIC_URL` | B | | `{S3_ENDPOINT}/{bucket}` | Public URL prefix for uploaded files |
| `PAYMENT_GATEWAY_PROVIDER` | B | | `mock` | Payment gateway: `mock`, `paymob`, or `fawry` (must NOT be `mock` in prod) |
| `PAYMOB_API_KEY` | B | ✓ (paymob) | — | Paymob Accept API key (for refunds) |
| `PAYMOB_SECRET` | B | ✓ (paymob) | — | Paymob secret key (Intention API auth) |
| `PAYMOB_PUBLIC_KEY` | B | ✓ (paymob) | — | Paymob public key (Unified Checkout) |
| `PAYMOB_MERCHANT_ID` | B | ✓ (paymob) | — | Paymob merchant / integration ID |
| `PAYMOB_HMAC_SECRET` | B | ✓ (paymob) | — | Paymob HMAC secret (webhook verification) |
| `PAYMOB_SANDBOX` | B | | `true` | Paymob mode: `true` (test) / `false` (live) |
| `SUPER_ADMIN_PHONE` | B | ✓ (bootstrap) | — | Local 11-digit phone (no country code), the value typed at login; identity key for the bootstrap |
| `SUPER_ADMIN_COUNTRY_ISO` | B | ✓ (bootstrap) | — | ISO-2 code of an active `countries` row; its `phone_code` prefixes the stored `full_phone` |
| `SUPER_ADMIN_EMAIL` | B | ✓ (bootstrap) | — | Profile email only (`users.email`, NOT NULL + UNIQUE) — **not** a login identifier |
| `SUPER_ADMIN_PASSWORD` | B | ✓ (bootstrap) | — | Bootstrap password (PBKDF2-SHA512 hashed, never logged) |
| `SUPER_ADMIN_NAME` | B | | `Super Admin` | `users.full_name` for the bootstrapped account |
| `SUPER_ADMIN_GENDER` | B | | `male` | `male` or `female` (`users.gender` is NOT NULL) |
| `MAIL_TRANSPORT` | B | | `log` | Mail transport: `log` (console) or `smtp` |
| `MAIL_HOST` | B | ✓ (smtp) | — | SMTP hostname |
| `MAIL_PORT` | B | ✓ (smtp) | `587` | SMTP port |
| `MAIL_USER` | B | ✓ (smtp) | — | SMTP username |
| `MAIL_PASS` | B | ✓ (smtp) | — | SMTP password |
| `MAIL_FROM` | B | | `noreply@courtzon.com` | From address for outgoing emails |
| `BACKUP_ENCRYPTION_KEY` | B | | — | AES-256 encryption key (32 bytes / 64 hex chars) for backup |
| `METRICS_TOKEN` | B, M | | — | Bearer token for `GET /metrics` (Prometheus scrape) |
| `VITE_API_URL` | F | | _(empty — proxies via Vite)_ | Backend API URL for the browser |
| `VITE_PAYMOB_PUBLIC_KEY` | F | ✓ (paymob) | — | Paymob public key (browser-accessible, Pixel SDK) |
| `MYSQL_ROOT_PASSWORD` | D | ✓ (Docker) | `courtzon_root` | MySQL root password (Docker Compose only) |
| `MYSQL_DATABASE` | D | | `courtzon_v2` | MySQL database name (Docker Compose only) |
| `MYSQL_PUBLISH_PORT` | D | | `3307` | Host port for Docker MySQL |
| `MYSQL_USER` | D | | `app_user` | MySQL user (dev compose only) |
| `MYSQL_PASSWORD` | D | | `change-me` | MySQL password (dev compose only) |
| `FRONTEND_PORT` | D | | `5173` | Host port for frontend Nginx container |
| `GRAFANA_PASSWORD` | M | | `admin` | Grafana admin password (`docker-compose.monitoring.yml`) |

## Super Admin bootstrap variables

`SUPER_ADMIN_*` are read **only** by `backend/scripts/bootstrap-admin.js`, a manual,
one-off provisioning script (`node backend/scripts/bootstrap-admin.js --confirm-host=<DB_HOST>
--confirm-port=<DB_PORT> --confirm-db=<DB_NAME>`, or the same flags after
`npm run bootstrap-admin --` from `backend/`). Nothing in the application entrypoint, migrations,
or seeds reads them, and the script is **not** run at startup — provisioning happens only when an
operator invokes it explicitly.

| Variable | Required | Behaviour |
|---|---|---|
| `SUPER_ADMIN_PHONE` | ✓ | Local **11-digit** number without country code — must be the exact value typed at login. Rejected otherwise (`localPhoneNumberSchema` contract). |
| `SUPER_ADMIN_COUNTRY_ISO` | ✓ | **ISO-2** code of an active `countries` row (e.g. `EG`). `countries.phone_code` is resolved from the row and prefixes the stored `full_phone`. |
| `SUPER_ADMIN_EMAIL` | ✓ | Profile email only. `users.email` is NOT NULL + UNIQUE and is **not** a login identifier. Must not already belong to another user. |
| `SUPER_ADMIN_PASSWORD` | ✓ | Hashed with the app's PBKDF2-SHA512 format; never logged or printed. |
| `SUPER_ADMIN_NAME` | | Defaults to `Super Admin` (`users.full_name`). |
| `SUPER_ADMIN_GENDER` | | `male` or `female`, defaults to `male` (`users.gender` is NOT NULL with no DB default). |

- The script exits nonzero without writing anything when any required variable is empty, and aborts on an invalid phone, country code, or gender.
- **Target confirmation is mandatory:** `--confirm-host`, `--confirm-port`, and `--confirm-db` must match the resolved `DB_HOST`, `DB_PORT`, and `DB_NAME` exactly. Bootstrap resolves `process.env` → `./.env` → defaults (`localhost:3306`, `courtzon_v3`); the permission sync resolves `process.env` → `./.env` → `backend/.env` (later file wins) → defaults (`127.0.0.1:3306`, `courtzon_v3`). Both print the resolved target before any connection. `courtzon_v2` is refused unconditionally, and missing variables or confirmation flags exit nonzero.
- **Login is phone + password, never email.** The stored login identity is `full_phone = <countries.phone_code><SUPER_ADMIN_PHONE>`; re-running reuses an existing user with that `full_phone` and only ensures the `super_admin` role grant.
- A soft-deleted user holding the same phone is reported clearly instead of failing on the unique index.
- A revoked (`is_active=0`) or expired `user_roles` grant is reported as ineffective and is **not** reactivated automatically; no `expires_at` value is modified.
- The role is resolved by `roles.slug = 'super_admin'` with `organisation_id IS NULL` (no hardcoded IDs), so the baseline seeds must be applied first.
- The baseline seeds already contain a pre-provisioned Super Admin (`users.id = 1`); verify/rotate that credential rather than assuming the seeds create no administrator.
- If the account's permissions look empty afterwards, run `node backend/scripts/sync-role-permissions.mjs` with the same `--confirm-host` / `--confirm-port` / `--confirm-db` values. It applies template grants to **global** roles only (`organisation_id IS NULL`), is add-only by default, and must not be run with `--prune`.
- The templates (`deployment/env/.env.example`, `deployment/coolify/.env.production`) keep these keys **commented out** — supply the values at run time and remove them afterwards; never commit real values.
