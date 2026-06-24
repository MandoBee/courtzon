# CourtZon-V2

Multi-tenant sports facility platform — bookings, marketplace, org portal, coaches, wallet/payments, and granular RBAC.

## Quick start

### Prerequisites

- Node.js 22+
- Docker Desktop (backend + Redis + optional MySQL)
- MySQL 8 (local install **or** use the Docker MySQL service below)

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your DB credentials
```

### 2. Database

**Option A — Docker MySQL (recommended for new devs):**

```bash
docker compose --profile db up -d mysql redis
# Wait for mysql healthcheck, then:
node backend/scripts/migrate.js --fresh --seed
```

**Option B — existing local MySQL:**

```bash
node backend/scripts/migrate.js --fresh --seed
```

Baseline data lives in `database/seed/003_baseline_snapshot.sql` (see `database/seed/README.md`). After changing admin config in the UI, refresh it with `node backend/scripts/export-baseline-seed.mjs`.

### 3. Backend (Docker)

```bash
docker compose build backend
docker compose up -d backend
# API: http://localhost:3000
# Swagger (local stack): http://localhost:3000/docs
```

> On Windows, after TS changes prefer `docker compose build backend && docker compose up -d backend` (not `restart`).

### 4. Frontend (local HMR)

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

Vite proxies API routes to `http://localhost:3000`.

## Common commands

| Task | Command |
|------|---------|
| Run migrations | `node backend/scripts/migrate.js` |
| Fresh DB + baseline seed | `node backend/scripts/migrate.js --fresh --seed` |
| Export baseline from current DB | `node backend/scripts/export-baseline-seed.mjs` |
| Legacy SQL seed (no snapshot) | `node backend/scripts/migrate.js --fresh --seed --seed-legacy` |
| Baseline + synthetic demo data | `node backend/scripts/migrate.js --fresh --seed --seed-demo` |
| Sync UI permissions | `node backend/scripts/sync-ui-registry.js` |
| Sync role permissions | `node backend/scripts/sync-role-permissions.mjs` |
| Emergency repair | `cd backend && npm run emergency-repair` |
| Verify deployment | `cd backend && npm run verify-deployment` |
| Database backup | `cd backend && npm run db:backup` |
| Bootstrap super admin | `cd backend && npm run bootstrap-admin` |
| Backend unit tests | `cd backend && npm run test` |
| Backend integration tests | `cd backend && npm run test:int` |
| Frontend tests | `cd frontend && npm run test` |
| E2E smoke tests | `npm run test:e2e` (requires backend + frontend running) |
| Deployment smoke tests | `npm run test:e2e -- --grep "Deployment Smoke"` |
| Frontend build | `cd frontend && npm run build` |
| Full Docker stack (API + SPA; host or Docker DB) | `docker compose up -d --build` |
| Docker MySQL (port 3307 on host) | `docker compose --profile db up -d mysql` |
| Dev Docker stack (HMR) | `docker compose -f docker-compose.dev.yml up -d --build` |
| Monitoring stack | `docker compose up -d` then `docker compose -f docker-compose.monitoring.yml up -d` |

## Production Deployment

### Docker Compose (Production)

```bash
# 1. Set up environment
cp .env.example .env
# Edit .env with production values

# 2. Start infrastructure
docker compose --profile db up -d mysql redis

# 3. Run initial migration + seed
node backend/scripts/migrate.js --fresh --seed

# 4. Build and start services
docker compose build backend frontend
docker compose up -d
```

### Coolify Deployment

#### Application Setup

1. **Create a new Resource → Application**
2. Set build pack to **Docker Compose**
3. Point to your Git repository
4. Set the **Base Directory** to `/` (root)

#### Domain Configuration (⚠️ Critical Bug)

Coolify 4.1.2 has a known bug where domains without protocol generate incorrect Traefik rules.

**❌ Wrong (Coolify default):**
```
api.courtzon.cloud
www.courtzon.cloud
```
This generates: `Host(``) && PathPrefix(api.courtzon.cloud)` — **breaks API traffic**.

**✅ Correct — always include protocol:**
```
https://api.courtzon.cloud
https://www.courtzon.cloud
```

This generates proper `Host(\`api.courtzon.cloud\`) && PathPrefix(\`/\`)` rules.

#### Environment Variables

Set these in Coolify's environment variable UI:

```env
NODE_ENV=production

DB_HOST=YourCoolifyInternalDbHost
DB_PORT=3306
DB_NAME=courtzon_v2
DB_USER=
DB_PASSWORD=

JWT_SECRET=<generate-a-random-64-char-string>
SESSION_SECRET=<generate-a-random-64-char-string>

APP_URL=https://api.courtzon.cloud
FRONTEND_URL=https://www.courtzon.cloud

REDIS_HOST=YourRedisHost
REDIS_PORT=6379
REDIS_PASSWORD=

# Feature flags / configuration
ENABLE_API_DOCS=false
LOG_LEVEL=info
```

#### Database Service

Add a MySQL service in Coolify:
- Port: 3306
- Database: courtzon_v2
- User: (create a non-root user)
- Persistent storage enabled

#### Redis Service

Add a Redis service in Coolify:
- Port: 6379
- Password: set one
- Persistent storage enabled

### Health Checks

After deployment, verify these endpoints work:

```bash
# Basic health
curl https://api.courtzon.cloud/health

# Liveness probe
curl https://api.courtzon.cloud/health/live

# Readiness probe
curl https://api.courtzon.cloud/health/ready

# Database health (table count, connection status)
curl https://api.courtzon.cloud/health/database

# Redis health (ping response)
curl https://api.courtzon.cloud/health/redis

# Storage health (upload dir, permissions, disk)
curl https://api.courtzon.cloud/health/storage

# Public data (no auth required)
curl https://api.courtzon.cloud/public/countries
curl https://api.courtzon.cloud/public/languages
curl https://api.courtzon.cloud/public/app-settings
curl https://api.courtzon.cloud/public/feature-flags
```

## Database Recovery

### Backup

```bash
# Manual backup
node backend/scripts/backup.js

# Automated backup (runs daily at midnight via BullMQ worker)
# Backups stored in ./backend/backups/
```

### Restore

```bash
# List available backups
ls backend/backups/

# Restore from a backup file
node backend/scripts/restore.js backend/backups/courtzon_v2_YYYYMMDD_HHmmss.sql.gz
```

### Full Reset

```bash
# ⚠️ Destroys all data and recreates
node backend/scripts/migrate.js --fresh --seed
```

## Production Checklist

### Coolify Deployment Checklist
Deployment succeeds only if ALL of these pass:

- [ ] Domains include `https://` prefix (e.g. `https://api.courtzon.cloud`, not `api.courtzon.cloud`)
- [ ] `GET /health` returns 200 with `status: "ok"`
- [ ] `GET /health/database` returns tables > 0
- [ ] `GET /health/redis` returns connected
- [ ] Database startup validator passes (no empty DB, no missing tables)
- [ ] Seed validator passes (app_settings, countries, languages have data)
- [ ] Frontend loads without console errors

### Environment Variables
- [ ] `SESSION_SECRET` is set to a strong 64-char random string
- [ ] `JWT_SECRET` is set to a strong 64-char random string
- [ ] `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` all set
- [ ] Database credentials use a non-root user with limited privileges
- [ ] Redis has a password set
- [ ] `NODE_ENV=production`
- [ ] `ENABLE_API_DOCS=false` (or removed)

### Verification
- [ ] SSL/TLS is configured (Coolify auto-proxies with Let's Encrypt)
- [ ] Backups are verified working (`npm run db:backup`)
- [ ] Health checks pass (all 7 endpoints)
- [ ] `npm run verify-deployment` returns all PASS
- [ ] All public endpoints return data
- [ ] Frontend loads without errors
- [ ] CORS origins are whitelisted
- [ ] Smoke tests pass (`npm run test:e2e -- --grep "Deployment Smoke"`)

## Emergency Repair

If the database is in a broken state:

```bash
cd backend
npm run emergency-repair
```

This runs:
1. All schema migrations (idempotent)
2. Seed data (if missing)
3. Verifies all critical tables exist
4. Verifies seed data (app_settings, countries, languages, feature_flags)

## Monitoring

### Health Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Full status (DB + Redis + memory) | `{"status":"ok","checks":{...}}` |
| `GET /health/live` | Liveness probe | `{"status":"ok","uptime":123}` |
| `GET /health/ready` | Readiness probe | `{"status":"ok","checks":{...}}` |
| `GET /health/database` | DB connection + table count | `{"status":"ok","database":"connected","tables":165}` |
| `GET /health/redis` | Redis ping check | `{"status":"ok","connected":true,"latencyMs":1}` |
| `GET /health/storage` | Upload dir + permissions | `{"status":"ok","uploadDir":"...","writable":true}` |

### Structured Logging

In production, every API request logs:
- `requestId` — unique per request
- `userId` — authenticated user ID
- `method` — HTTP method
- `url` — request path
- `statusCode` — response status
- `responseTime` — duration in ms

This makes every error traceable to a specific request and user.

## Migration History

Every migration is tracked in the `migration_history` table:

```sql
SELECT * FROM migration_history ORDER BY id;
```

The startup validator checks migration count against expected files. If migrations are missing, a warning is logged.

## Database Backup

### Automated
- Daily backup at midnight via BullMQ worker (`database_backup`)
- Stored in `./backups/` directory
- 30-day retention (older backups auto-pruned)
- Optional S3/R2 upload

### Manual
```bash
cd backend && npm run db:backup
```

### Pre-Migration Backup
Every `db:migrate` run automatically creates a backup first:
```
backups/pre_migration_courtzon_v2_2026_06_24.sql.gz
```
Use `--no-backup` flag to skip:
```bash
node scripts/migrate.js --no-backup
```

## Architecture

- **Backend:** Fastify 5, MySQL, Redis, BullMQ — modular monolith under `backend/src/modules/`
- **Frontend:** React 19, Vite, TanStack Query, Zustand — `frontend/src/`
- **Auth:** HttpOnly session cookies (no tokens in JS); Bearer header still supported for API clients
- **Permissions:** ~500 UI permission keys in `frontend/src/permissions/registry.ts`, synced to DB
- **Docs:** `docs/` — RBAC, deployment, production hardening, improvement plan

## Security notes

- Auth tokens are **HttpOnly cookies** — not accessible to JavaScript
- Upload hardening: magic-byte validation, Sharp re-encode, SVG blocked
- Brute-force lockout, audit logging, org access guards
- Production checklist: `docs/production-hardening.md`

## Project structure

```
CourtZon-V2/
├── backend/           # Fastify API
├── frontend/          # React SPA
├── database/          # SQL migrations + seeds
├── docs/              # Architecture & runbooks
├── e2e/               # Playwright smoke tests
├── .github/           # CI/CD workflows
├── docker-compose.yml # mysql, redis, backend, frontend
└── AGENTS.md          # Dev automation rules for agents
```

See `AGENTS.md` for toast conventions, permission gating, and Docker rebuild rules.
