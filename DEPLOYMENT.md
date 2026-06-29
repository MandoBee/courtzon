# CourtZon v1.0.0 — Deployment Guide

## Prerequisites

- Docker Engine 24+
- Docker Compose v2
- Git
- 2 GB RAM minimum (4 GB recommended)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
MYSQL_ROOT_PASSWORD=strong-password-here
SESSION_SECRET=64-char-random-string

# Optional
APP_URL=https://courtzon.com
CORS_ORIGINS=https://courtzon.com,https://admin.courtzon.com
VITE_PAYMOB_PUBLIC_KEY=
PAYMOB_API_KEY=
REDIS_PASSWORD=

# Monitoring (optional)
GRAFANA_USER=admin
GRAFANA_PASSWORD=secure-password
```

## Deployment

### First Deploy

```bash
git clone https://github.com/MandoBee/courtzon.git
cd CourtZon-V2
cp .env.example .env
# Edit .env with production secrets
docker compose build
docker compose up -d
```

### Update Deploy

```bash
cd CourtZon-V2
git pull origin master
docker compose build backend frontend
docker compose up -d
```

## Database Migrations

Migrations are applied from `database/migrations/` in numeric order:

```bash
# Apply pending migrations
docker exec courtzon-backend node scripts/migrate.js

# Check migration status
docker exec courtzon-backend node scripts/migrate.js --status

# Fresh install with seed data
docker exec courtzon-backend node scripts/migrate.js --fresh --seed
```

Migration files:
- `001_courtzon_v3.sql` — Baseline schema (162 tables)
- `002_add_financial_unique_constraints.sql` — Gateway reference + wallet transaction UNIQUE
- `003_booking_concurrency.sql` — Booking slot UNIQUE
- `004_performance_indexes.sql` — Payment history index

## Backup

### Automated (Docker)

```bash
docker exec courtzon-backend node scripts/backup.js
```

### Manual

```bash
docker exec courtzon-mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} courtzon_v3 > backup_$(date +%Y%m%d).sql
```

### Restore

```bash
docker exec -i courtzon-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} courtzon_v3 < backup_20260629.sql
```

## Rollback

### Code Rollback

```bash
git checkout <previous-commit>
docker compose build backend frontend
docker compose up -d
```

### Database Rollback

```bash
# Restore from most recent backup
docker exec -i courtzon-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} courtzon_v3 < latest_backup.sql
```

## Health Check Verification

```bash
# Liveness (process up)
curl http://localhost:3000/health/live

# Readiness (DB + Redis ok)
curl http://localhost:3000/health/ready

# Full health
curl http://localhost:3000/health

# Database check
curl http://localhost:3000/health/database

# Redis check
curl http://localhost:3000/health/redis

# Storage check
curl http://localhost:3000/health/storage
```

### Expected Responses

```json
// /health/live
{"status":"ok","uptime":3600}

// /health/ready
{"status":"ok","checks":{"database":{"status":"ok","latencyMs":2},"redis":{"status":"ok","latencyMs":1}}}

// /health
{"service":"courtzon-v2-backend","status":"ok","checks":{...}}
```

## Smoke Test Checklist

After deployment, verify:

- [ ] `GET /health` → 200 with `status: "ok"`
- [ ] `GET /countries` → 200 with country list
- [ ] `POST /auth/login` → 200 with session cookie
- [ ] `GET /auth/me` with session → 200 with user object
- [ ] `GET /bookings` without session → 401
- [ ] `GET /bookings` with session → 200
- [ ] Frontend served on port 5173 → 200 with `<!DOCTYPE html>`

## Monitoring

```bash
# Start monitoring stack
docker compose --profile monitoring up -d

# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001 (admin/admin)
```

## Container Resource Limits

| Service | CPU Limit | Memory Limit |
|---|---|---|
| mysql | 2.0 | 1G |
| redis | 1.0 | 512M |
| backend | 2.0 | 512M |
| frontend | 1.0 | 256M |

All configurable via env vars (e.g., `BACKEND_CPU_LIMIT=4.0`).
