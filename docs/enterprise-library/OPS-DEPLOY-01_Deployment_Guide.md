---
document_id: "OPS-DEPLOY-01"
document_name: "Deployment Guide"
family: "OPS-DEPLOY"
document_type: "OPS"
status: "Draft"
version: "0.1"
audience: ["devops", "developer"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "DevOps Lead"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Engineering Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-08", "OPS-MON-01", "OPS-RUN-01"]
  related: ["TECH-DEV-05"]
---

# Deployment Guide (OPS-DEPLOY-01)

## 1. Overview

CourtZon deploys as a Docker Compose stack with 6 services: MySQL, Redis, Backend (Fastify), Frontend (Nginx + SPA), Prometheus, Grafana. All configuration is environment-driven via `.env`.

## 2. Docker Compose Stack

**Source:** `docker-compose.yml` (171 lines)

| Service | Image | Container Name | Internal Port | Published Port | Health Check |
|---------|-------|---------------|---------------|----------------|--------------|
| mysql | Custom (database/Dockerfile) | `courtzon-mysql` | 3306 | 3307 | mysqladmin ping (10s) |
| redis | `redis:7-alpine` | `courtzon-redis` | 6379 | 6379 | redis-cli ping (10s) |
| backend | Custom (backend/Dockerfile) | `courtzon-backend` | 3000 | 3000 | /health/live (30s) |
| frontend | Custom (frontend/Dockerfile) | `courtzon-frontend` | 80 | 5173 | curl localhost (30s) |
| prometheus | `prom/prometheus:v3.2.1` | `courtzon-prometheus` | 9090 | 9090 | None (monitoring profile) |
| grafana | `grafana/grafana:11.5.2` | `courtzon-grafana` | 3000 | 3001 | None (monitoring profile) |

### 2.1 Startup Order

```
mysql (healthy) ──→ redis (healthy) ──→ backend (healthy) ──→ frontend
                                                   │
                                          prometheus ←── grafana (monitoring profile)
```

Backend `depends_on` requires MySQL and Redis to be healthy. Frontend requires backend to be healthy.

### 2.2 Networks

All services share the `courtzon` network (created automatically).

### 2.3 Volumes

| Volume | Mount | Service | Purpose |
|--------|-------|---------|---------|
| `mysql_data` | `/var/lib/mysql` | mysql | Persistent DB storage |
| `redis_data` | `/data` | redis | Redis RDB/AOF persistence |
| (bind) | `/app/uploads` | backend | Uploaded files (local) |
| `backend_backups` | `/app/backups` | backend | Backup storage |
| `prometheus_data` | `/prometheus` | prometheus | Metrics time series (15d retention) |
| `grafana_data` | `/var/lib/grafana` | grafana | Dashboard configs |

## 3. Environment Variables

### 3.1 Required

| Variable | Default | Service | Description |
|----------|---------|---------|-------------|
| `MYSQL_ROOT_PASSWORD` | — | mysql | MySQL root password (required) |
| `DB_USER` | — | backend | Application DB user |
| `DB_PASSWORD` | — | backend | Application DB password |
| `JWT_SECRET` | — | backend | JWT signing secret |
| `REDIS_PASSWORD` | — | redis, backend | Redis password (recommended) |

### 3.2 Database

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_DATABASE` | `courtzon_v3` | Database name |
| `MYSQL_PUBLISH_PORT` | `3307` | Host port for MySQL |
| `DB_HOST` | `mysql` | Internal hostname (Docker DNS) |
| `DB_PORT` | `3306` | Internal MySQL port |
| `MYSQL_CPU_LIMIT` | `2.0` | CPU limit |
| `MYSQL_MEM_LIMIT` | `1G` | Memory limit |
| `MYSQL_CPU_RESERVE` | `0.5` | CPU reservation |
| `MYSQL_MEM_RESERVE` | `512M` | Memory reservation |

### 3.3 Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_PORT` | `6379` | Host port for Redis |
| `REDIS_HOST` | `redis` | Internal hostname |
| `REDIS_CPU_LIMIT` | `1.0` | CPU limit |
| `REDIS_MEM_LIMIT` | `512M` | Memory limit |

Redis starts with: `--maxmemory 512mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`

### 3.4 Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment |
| `PORT` | `3000` | App port |
| `APP_URL` | `https://courtzon.cloud` | Public URL |
| `CORS_ORIGINS` | `https://www.courtzon.cloud,https://admin.courtzon.cloud` | Allowed CORS origins |
| `RELAX_RATE_LIMIT` | `true` | Rate limit bypass (Docker) |
| `PAYMENT_GATEWAY_PROVIDER` | — | `paymob` or `mock` |
| `PAYMOB_API_KEY` | — | Paymob API key |
| `PAYMOB_SECRET` | — | Paymob secret |
| `PAYMOB_HMAC_SECRET` | — | HMAC for webhook verification |
| `PAYMOB_PUBLIC_KEY` | — | Public key for iframes |
| `WEBHOOK_BASE_URL` | — | Public webhook URL |
| `METRICS_TOKEN` | — | Prometheus scrape auth token |
| `BACKEND_CPU_LIMIT` | `2.0` | CPU limit |
| `BACKEND_MEM_LIMIT` | `512M` | Memory limit |

### 3.5 Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `FRONTEND_PORT` | `5173` | Host port mapping (80 inside container) |
| `VITE_PAYMOB_PUBLIC_KEY` | — | Paymob public key for iframe |
| `VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED` | `false` | Feature flag for temp password reset |
| `FRONTEND_CPU_LIMIT` | `1.0` | CPU limit |
| `FRONTEND_MEM_LIMIT` | `256M` | Memory limit |

### 3.6 Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMETHEUS_PORT` | `9090` | Prometheus UI port |
| `GRAFANA_PORT` | `3001` | Grafana UI port (maps to container 3000) |
| `GRAFANA_USER` | `admin` | Grafana admin user |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |
| `PROMETHEUS_MEM_LIMIT` | `256M` | Prometheus memory limit |
| `GRAFANA_MEM_LIMIT` | `256M` | Grafana memory limit |

### 3.7 Build Arguments

| Arg | Used By | Description |
|-----|---------|-------------|
| `GIT_COMMIT` | Backend | Build metadata (git commit hash) |
| `VITE_PAYMOB_PUBLIC_KEY` | Frontend | Paymob iframe key |
| `VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED` | Frontend | Feature flag |

## 4. Dockerfiles

### 4.1 Backend (`backend/Dockerfile`, 51 lines)

Multi-stage build:

**Stage 1 — Builder (`node:22-alpine`):**
1. Install dependencies with `npm ci --ignore-scripts`
2. Build TypeScript with `npm run build`

**Stage 2 — Runner (`node:22-alpine`):**
1. Install runtime tools: `tini`, `su-exec`, `netcat-openbsd`, `mysql-client`
2. Install production dependencies with `npm ci --omit=dev --ignore-scripts`
3. Copy built `dist/`, scripts, and database schemas
4. Generate build metadata files:
   - `/app/build-time.txt` — ISO timestamp
   - `/app/version.txt` — Package version
   - `/app/git-commit.txt` — Git commit hash
   - `/app/expected-migration.txt` — Latest migration number
5. Entrypoint runs as root, fixes upload permissions, drops to `appuser` via `su-exec`

**Entrypoint:** `tini -- docker-entrypoint.sh`
**CMD:** `node dist/server.js`
**Health check:** `GET /health/live` every 30s (start period: 60s)

### 4.2 Frontend (`frontend/Dockerfile`, 41 lines)

Multi-stage build:

**Stage 1 — Builder (`node:22-alpine`):**
1. Install dependencies
2. Build Vite/React app with `npm run build`
3. Build args: `VITE_PAYMOB_PUBLIC_KEY`, `VITE_FEATURE_AUTH_TEMPORARY_PASSWORD_RESET_ENABLED`

**Stage 2 — Runner (`nginx:1.27-alpine`):**
1. Install `curl` for health checks
2. Copy built `dist/` to `/usr/share/nginx/html/`
3. Copy `nginx.conf`, `security-headers.conf`, `api-proxy.conf`
4. Run as non-root `appuser`
5. Health check: `curl -f http://localhost:80/` every 30s

## 5. Nginx Configuration

**Source:** `frontend/nginx.conf` (117 lines)

### 5.1 Architecture

```
Request ──→ nginx (port 80)
              │
              ├── /api/* → proxy_pass http://backend:3000 (with WebSocket support)
              ├── /auth/* → proxy_pass http://backend:3000
              ├── /admin/* → Accept-header routing:
              │     text/html → index.html (SPA fallback)
              │     application/json → proxy_pass backend:3000
              ├── /socket.io/* → proxy_pass backend:3000 (WebSocket, 86400s timeout)
              └── /* → try_files $uri /index.html (SPA fallback)
```

### 5.2 Security Headers

Included via `security-headers.conf`:
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY (or SAMEORIGIN)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy

### 5.3 Caching

| Path | Cache | Duration | Immutable |
|------|-------|----------|-----------|
| `/assets/` | `public, immutable` | 1 year | Yes |
| `/favicon-*`, `/icon-*`, branding assets | `public, max-age=604800` | 7 days | No |
| `/` (index.html) | `no-cache` | — | No |

### 5.4 Compression

Gzip enabled for: `text/css`, `application/javascript`, `application/json`, `image/svg+xml` (min length: 256 bytes)

## 6. Database Initialization

The `docker-entrypoint.sh` handles first-time setup:

1. Waits for MySQL via `nc -z`
2. Waits for Redis via `nc -z`
3. Checks table count in `information_schema`:
   - **Empty DB:** Imports baseline `001_courtzon_v3.sql`, then seed `001_baseline.sql`
   - **Existing DB:** Creates `migration_history` table if missing, then applies any unapplied `.sql` migrations
4. Drops privileges to `appuser` and starts the Node.js server

**Source:** `backend/docker-entrypoint.sh` (95 lines)

## 7. Resource Limits

All services have Docker resource constraints:

| Service | CPU Limit | CPU Reservation | Memory Limit | Memory Reservation |
|---------|-----------|-----------------|--------------|-------------------|
| mysql | 2.0 | 0.5 | 1G | 512M |
| redis | 1.0 | 0.25 | 512M | 256M |
| backend | 2.0 | 0.5 | 512M | 256M |
| frontend | 1.0 | 0.25 | 256M | 128M |
| prometheus | — | — | 256M | — |
| grafana | — | — | 256M | — |

## 8. Deployment Commands

### 8.1 Production Start
```bash
docker compose build backend frontend
docker compose up -d
```

### 8.2 With Monitoring
```bash
docker compose --profile monitoring up -d
```

### 8.3 Update Single Service
```bash
docker compose build backend && docker compose up -d backend
```

### 8.4 View Logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### 8.5 Check Health
```bash
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:5173 | head -1
```

## 9. Production Hardening

See also: `docs/production-hardening.md`

**Backend (`app.ts`):**
- CORS restricted to known origins via `CORS_ORIGINS`
- Helmet security headers
- CSP configured per `security-headers.conf`
- Brute-force protection via `brute-force.service.ts`

**Database:**
- Separate application user (`courtzon_app`) and backup user (`courtzon_backup`)
- App user has only necessary privileges
- See `backend/scripts/setup-db-users.sql`

**Metrics:**
- `METRICS_TOKEN` env var protects `/metrics` endpoint from public access
- Prometheus runs on isolated Docker network

**Evidence:** All source verified against `docker-compose.yml:1-171`, `backend/Dockerfile:1-51`, `frontend/Dockerfile:1-41`, `frontend/nginx.conf:1-117`.
