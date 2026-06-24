# DEPLOYMENT ARCHITECTURE

## Current Infrastructure (Local Docker Dev)

```
┌──────────────────────────────────────────────────┐
│                    Docker Host                      │
│                                                    │
│  ┌──────────┐         ┌──────────────────────┐    │
│  │  Frontend │         │      Backend          │    │
│  │  (Nginx   │         │   (Fastify API)       │    │
│  │   static) │         │                        │    │
│  └──────────┘         └──────────┬───────────┘    │
│                                  │                 │
│              ┌───────────────────▼──────────┐      │
│              │          Redis               │      │
│              │  (Cache + Locks + Pub/Sub)   │      │
│              └──────────────────────────────┘      │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │              MySQL 8.0                        │  │
│  │            courtzon_v2 database                │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Accessible via:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **MySQL**: 127.0.0.1:3306 (root / CourtZon2026)
- **Redis**: localhost:6379

## Target Infrastructure (Production)

```
┌──────────────────────────────────────────────────┐
│                   Docker Host                      │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Nginx   │  │  Fastify  │  │   Socket.IO      │ │
│  │ (reverse │──│  API xN   │  │   Server xN      │ │
│  │  proxy)  │  │ (cluster) │  │   (cluster)      │ │
│  └──────────┘  └────┬─────┘  └────────┬─────────┘ │
│                      │                 │            │
│              ┌───────▼─────────────────▼──────┐     │
│              │          Redis                 │     │
│              │  (Cache + Locks + Pub/Sub)     │     │
│              └───────────────────────────────┘     │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │           MySQL 8.0 (Primary)                 │  │
│  │           courtzon_v2 database                 │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │           MySQL 8.0 (Replica)                 │  │
│  │        (read-only, reporting)                 │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Docker Compose Services (Current)
```yaml
services:
  db:           # MySQL 8.0 with utf8mb4, mysql_native_password
  redis:        # Redis 7 Alpine (cache + locks + pub/sub)
  backend:      # Fastify API server (Node.js 22)
  frontend:     # Nginx-served React SPA (Vite build)
```

## CI/CD (GitHub Actions)
```yaml
on: push to main
jobs:
  lint:
    - Backend: tsc --noEmit
    - Frontend: tsc --noEmit
  test:
    - Backend: unit + integration tests with MySQL + Redis services
    - Frontend: unit tests
  build:
    - Build backend (tsc)
    - Build frontend (vite build)
    - Build Docker images (backend + frontend)
  migration-validation:
    - Fresh migration + seed on test DB
    - Verify all required tables exist
    - Verify seed data exists
    - Validate migration idempotency
```

Workflow files in `.github/workflows/`:
- `build.yml` — Build backend, frontend, and Docker images
- `lint.yml` — TypeScript type checking
- `test.yml` — Unit and integration tests
- `migration-validation.yml` — Schema + seed validation

## Environment Configuration
- `.env` files per environment (dev/staging/prod)
- Secrets managed via Docker secrets or cloud vault
- Database connection strings per tenant pool
- Redis connection, JWT secret, payment gateway keys

## Health Checks

All health endpoints are unauthenticated.

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Full health (DB + Redis + memory) | `{"status":"ok","checks":{...}}` |
| `GET /health/live` | Liveness probe | `{"status":"ok","uptime":123}` |
| `GET /health/ready` | Readiness probe | `{"status":"ok","checks":{...}}` |
| `GET /health/database` | DB connection + table count | `{"status":"ok","database":"connected","tables":165}` |
| `GET /health/redis` | Redis ping check | `{"status":"ok","connected":true,"latencyMs":1}` |
| `GET /health/storage` | Upload dir + permissions | `{"status":"ok","uploadDir":"...","writable":true}` |

## Coolify Deployment

### ⚠️ Critical: Build Context Must Be Project Root

The Dockerfile at `backend/Dockerfile` copies `database/ database/` from the **build context**, not from the repository root. If the context is `backend/`, the image will only contain 1 migration file instead of 132+.

**You MUST configure Coolify with:**
- Build pack: **Dockerfile** (NOT Nixpacks — `nixpacks.toml` intentionally removed)
- Dockerfile path: `backend/Dockerfile`
- **Build context: `.` (project root)** — NOT `backend/`
- Port: `3000`
- Health check: `GET /health`

The startup validator now explicitly checks for `000_core_foundation.sql` and `128_add_migration_history.sql` at startup and fails immediately if missing.

Do NOT use Docker Compose build pack for individual services — it will start all services including MySQL. Use Dockerfile build pack for each service separately.

### ⚠️ Critical Domain Configuration Bug (Coolify 4.1.2)

Domains **must** be stored with protocol prefix:

```diff
- api.courtzon.cloud
- www.courtzon.cloud
+ https://api.courtzon.cloud
+ https://www.courtzon.cloud
```

Without protocol, Coolify generates invalid Traefik rules:
```
Host(``) && PathPrefix(`api.courtzon.cloud`)
```

With protocol, correct rules are generated:
```
Host(`api.courtzon.cloud`) && PathPrefix(`/`)
```

### Resource Setup

1. Create **Resource → Application**
2. Build pack: **Docker Compose**
3. Git repository: your repo URL
4. Base directory: `/`
5. Health check: `GET /health` (port 3000)

### Required Environment Variables

```env
NODE_ENV=production
DB_HOST=<internal-db-host>
DB_PORT=3306
DB_NAME=courtzon_v2
DB_USER=<db-user>
DB_PASSWORD=<db-password>
JWT_SECRET=<random-64-chars>
SESSION_SECRET=<random-64-chars>
APP_URL=https://api.courtzon.cloud
FRONTEND_URL=https://www.courtzon.cloud
REDIS_HOST=<internal-redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
# Optional: auto-create super admin on first deploy
SUPER_ADMIN_EMAIL=admin@courtzon.cloud
SUPER_ADMIN_PASSWORD=<strong-password>
```

### Deployment Validation Checklist

Deployment succeeds only if ALL conditions are met:

1. **Domains include `https://` prefix** — otherwise Traefik rules are malformed (see critical bug above)
2. **Health endpoint returns 200** — `GET /health` must respond with `status: "ok"`
3. **Database validator passes** — `GET /health/database` returns `tables > 0`
4. **Redis validator passes** — `GET /health/redis` returns `connected: true`
5. **Seed validator passes** — `GET /public/app-settings` returns data (not empty)
6. **Public endpoints work** — `/public/countries`, `/public/languages` return 200
7. **Frontend loads** — SPA renders without console errors

Run the verification script:
```bash
cd backend && npm run verify-deployment
```

Or with a custom URL:
```bash
node scripts/verify-deployment.js https://api.courtzon.cloud
```

## Database Disaster Prevention

### How the system prevents empty-database failures

1. **docker-entrypoint.sh**: On every container start:
   - Waits for MySQL TCP connection
   - Runs schema migrations (idempotent)
   - Checks if `app_settings` table has data
   - If empty, auto-runs `--seed` to populate it
   - Bootstraps super admin from env vars (if `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` set)

2. **Startup validator** (`backend/src/infrastructure/startup/startup-validator.ts`):
   - Runs before the HTTP server starts
   - Detects completely empty databases (exists but zero tables) — exits immediately
   - Checks 18 required tables exist
   - Verifies migration history against expected file count
   - Fails immediately with clear error if critical tables are missing

3. **Environment validation** (`backend/src/config/env.ts`):
   - In production, verifies `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET`
   - Exits with descriptive error if any are missing

4. **Public endpoints return defaults on empty DB**:
   - All `/public/*` endpoints are designed to handle empty tables gracefully

### Database Health Endpoints

| Endpoint | What it checks | Use case |
|----------|---------------|----------|
| `GET /health/database` | Connection + table count | Quick DB health check during incidents |
| `GET /health/redis` | Connection + ping | Redis availability check |
| `GET /health/storage` | Upload dir exists + writeable | Storage layer check |

### Migration History

Every migration is tracked in the `migration_history` table:
- `filename` — migration file name
- `hash` — SHA-256 content hash (first 12 chars)
- `applied_at` — timestamp
- `execution_ms` — how long it took

The startup validator compares applied migrations against expected files and warns if the schema is outdated.

### If you somehow end up with an empty database

```bash
# Emergency repair (runs migrations + seed + verification)
cd backend && npm run emergency-repair

# Full reset (destroys all data)
node backend/scripts/migrate.js --fresh --seed

# Or if you have existing data you want to keep, just seed the missing data:
node backend/scripts/migrate.js --seed
```

## Backup & Restore

### Automated Backups
- Daily backup at midnight via BullMQ `database_backup` worker
- Stored in `./backups/` directory
- Uses `mysqldump` with compression (gzip)
- 30-day retention — older backups auto-pruned
- Optional S3/R2 upload for off-site storage

### Manual Backup (Shell)
```bash
bash backend/scripts/backup.sh
# Creates: backups/courtzon_2026_06_24_120000.sql.gz
```

### Manual Backup (Node)
```bash
node backend/scripts/backup.js
```

### Pre-Migration Backup
Every `db:migrate` automatically creates a pre-migration backup:
```
backups/pre_migration_courtzon_v2_2026_06_24.sql.gz
```
Skip with `--no-backup` flag:
```bash
node scripts/migrate.js --no-backup
```

### Restore
```bash
node backend/scripts/restore.js backups/courtzon_2026_06_24.sql.gz
```

### Verify Backup Integrity (GitHub Action)
A weekly workflow validates that backups can be restored:
1. Restores latest backup into a clean MySQL database
2. Runs all migrations on the restored data
3. Verifies users, app_settings, and other tables have data
4. Reports PASS/FAIL

Run manually: GitHub → Actions → Restore Validation → Run workflow

## Post-Deployment Smoke Tests

Run after every deployment:

```bash
# Full smoke suite
npm run test:e2e -- --grep "Smoke"

# Deployment-specific smoke tests
npm run test:e2e -- --grep "Deployment Smoke"

# Verification script (API-only, no browser)
cd backend && npm run verify-deployment
```

Smoke tests verify:
- Login flow works
- App settings load
- Countries and languages return data
- Booking creation flow
- Payment processing
- Settlement calculations

Deployment is marked successful only if ALL smoke tests pass.
