# 31 — DEVOPS / DEPLOYMENT

**Audit:** 2026-10-04 · Docker state live-verified.

---

## 1. Docker Compose (docker-compose.yml — verified)

| Service | Image/Build | Port (host→container) | Health | Notes |
|---|---|---|---|---|
| mysql | `database/Dockerfile` (MySQL 8.0) | 3307→3306 | `mysqladmin ping` | `--default-authentication-plugin=mysql_native_password`, utf8mb4; volume `mysql_data`; limits CPU2/MEM1G |
| redis | `redis:7-alpine` | 6379→6379 | `redis-cli ping` | maxmemory 512mb noeviction, appendonly everysec; volume `redis_data` |
| backend | `backend/Dockerfile` (node:22-alpine) | 3000→3000 | HTTP `/health/ready` | env_file `.env`; NODE_ENV=production; DB_HOST=mysql, REDIS_HOST=redis; RELAX_RATE_LIMIT (default false); COURTZON_MIGRATION_ENV (default local); volumes `backend/uploads`, `backend_backups`; limits CPU2/MEM512M |
| frontend | `frontend/Dockerfile` (nginx) | 5173→80 | HTTP 200 | depends_on backend healthy; VITE_PAYMOB_PUBLIC_KEY arg; limits CPU1/MEM256M |
| prometheus | `prom/prometheus:v3.2.1` | 9090→9090 | — | profile=monitoring; 15d retention; volume `prometheus_data` |
| grafana | `grafana/grafana:11.5.2` | 3001→3000 | — | profile=monitoring; GF_ADMIN defaults; volume `grafana_data` |

Network: `courtzon` (default). **All 6 containers verified running & healthy** on this machine (2026-10-04).

## 2. Images (local registry)

`courtzon-backend:latest` (built 2026-10-04 19:41 EEST), `courtzon-frontend:latest` (2026-10-04 19:41), plus legacy `courtzon-v2-backend/frontend` (not in compose), `node:22`, `redis`, `mysql:8.0`, `prom`, `grafana`, `nginx:1.27-alpine`, `testcontainers/ryuk`.

## 3. Startup sequence

1. `docker compose up -d` → mysql (healthy) → redis (healthy) → backend (waits on both) runs `docker-entrypoint.sh`: migration-guard (`migration-guard.sh`) → translation registry sync → start `default`+`notifications` workers → seed templates → registers event listeners → outbox poller → schedules cron → starts Server + Socket.IO → healthy.
2. frontend nginx (depends backend healthy).

## 4. Metrics/health

- Backend: `/health`, `/health/live|ready|database|redis|storage|socket|version`.
- Prometheus scrapes `/metrics` (METRICS_TOKEN in prod).
- Alerts: `monitoring/alerts.yml` (6 rules).

## 5. Config/env

- `.env` (gitignored) drives compose; `.env.example` documents (see 32).
- `COURTZON_MIGRATION_ENV`: `local` default for this stack; **production must be `production`** (fail-closed for LOCAL_DOCKER_ONLY migrations).

## 6. Migrations

- `database/migrations/*.sql` (201 files, PRODUCTION_SAFE default for chain after 162; `COURTZON_MIGRATION_ENV` marker respected).
- Applied via `scripts/migrate.sh` (bash) or wrapper `backend/scripts/migrate.js`.
- **On Windows:** requires Git Bash/WSL — broken on plain PowerShell (observed today: `WSL /bin/bash` missing).

## 7. Backups

- `scripts/backup.sh` / `backend/scripts/backup.js` (encryption via BACKUP_ENCRYPTION_KEY in prod), daily cron `database_backup` job. Not validated in this audit.

## 8. CI/CD (GitHub workflows, verified file list)

`build.yml`, `ci.yml`, `lint.yml`, `migration-validation.yml`, `restore-validation.yml`, `security-scan.yml`, `test.yml`. (Workflow steps not opened this audit — ❓.)

## 9. Reverse proxy

- Frontend nginx (`frontend/nginx.conf`): `/api/`, `/auth/`, `/admin/` (Accept-header SPA/API routing), `/socket.io/` long-connections, SEO caching rules, security headers via `/etc/nginx/security-headers.conf`, preserves `X-Forwarded-Proto` for COOLIFY/HTTPS.

## 10. Production (Hostinger/Coolify)

- Docs: `docs/`, `DEPLOYMENT.md`, `scripts/verify-production.sh`, `backend/scripts/setup-db-users.sql`. Not verified live (❓). Require: separate env, DB user, SESSION_SECRET, gateway prod keys, `COURTZON_MIGRATION_ENV=production`.

## 11. Risks / safeguards missing

| Risk | Guardian |
|---|---|
| No prod-compose separate file proven | — |
| `GIT_COMMIT` unknown | needed build arg in CI |
| No image signing/scanning gate | only trivy conversationally |
| No automated egress allowlist for webhooks | — |
| Backup restore test (restore-validation workflow exists) | run periodically |
| Migration strategy on shared DB | move to per-env DB + guard |

## 12. Ops checklist (before scale)
- [ ] Prod env file exists with prod secrets only.
- [ ] CI passes GIT_COMMIT + artifact labels.
- [ ] Reload backup from S3 and restore into staging (validated).
- [ ] Grafanа dashboards imported; alerts wired to a channel.
- [ ] Egress allowlist (Paymob, SMTP, storage S3/R2, webhooks).