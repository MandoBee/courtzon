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
| `SUPER_ADMIN_EMAIL` | B | | — | Super admin email for initial seed setup |
| `SUPER_ADMIN_PASSWORD` | B | | — | Super admin password for initial seed setup |
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
