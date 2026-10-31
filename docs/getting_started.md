# Getting Started with CourtZon-V3

## System Requirements

- **Node.js** 22+ (LTS recommended)
- **Docker** & Docker Compose (v2 or later)
- **MySQL** 8.0 (local install or Docker image)
- **Redis** 7.x (local install or Docker image)
- **Git** for source control
- **npm** (shipped with Node.js)

## Project Overview

CourtZon is a multi-tenant sports facility booking platform. The stack:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS
- **Backend:** Fastify 5 + TypeScript (Node.js 22)
- **Database:** MySQL 8.0
- **Cache/Queue:** Redis 7 + BullMQ
- **Payments:** Paymob integration (test/sandbox available)
- **Containerization:** Docker Compose for both dev and production

## Clone & Setup

```bash
# Clone the repository
git clone <repository-url> courtzon
cd courtzon

# Copy environment configuration
cp deployment/env/.env.example .env

# Edit .env with your own values
# At minimum, set:
#   - DB_PASSWORD
#   - MYSQL_ROOT_PASSWORD
#   - SESSION_SECRET (32+ chars)
```

## Environment Configuration

The canonical environment template lives at `deployment/env/.env.example`. It documents every available variable across all services.

Key groups in `.env`:

| Group | Key Variables | Description |
|---|---|---|
| **Database** | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Cache/queue connection |
| **Backend** | `PORT`, `APP_URL`, `SESSION_SECRET`, `LOG_LEVEL` | Fastify server config |
| **Payment** | `PAYMENT_GATEWAY_PROVIDER`, `PAYMOB_*` | Paymob integration |
| **Frontend** | `VITE_API_URL`, `VITE_PAYMOB_PUBLIC_KEY` | Vite build-time env |
| **Docker** | `MYSQL_ROOT_PASSWORD`, `MYSQL_PUBLISH_PORT` | Container infrastructure |
| **Storage** | `STORAGE_PROVIDER`, `S3_*` | File upload backend |

See `docs/deployment/environment_matrix.md` for a complete reference.

## Docker vs. Local Development

### Option A: Docker Stack (full application)

Starts everything — MySQL, Redis, backend, and frontend — in containers:

```bash
# Build images
docker compose build backend frontend

# Start all services
docker compose up -d

# Or start only dependencies (leave backend/frontend running locally)
docker compose up -d mysql redis
```

> **Windows note:** Docker builds can hang the CLI. Consider using the `task` tool with a background subagent for builds. Always use `docker compose up -d` (not `restart`) after builds to pick up new images.

### Option B: Local development (hot-reload)

Run dependencies in Docker, but backend and frontend on your host for instant restart:

```bash
# 1. Start only database and cache
docker compose up -d mysql redis

# 2. Backend (in one terminal)
cd backend
npm install
npm run dev          # tsx watch — hot reload on save

# 3. Frontend (in another terminal)
cd frontend
npm install
npm run dev          # Vite dev server — HMR on save
```

## First-Time Setup (Migrations & Seed)

Migrations and seeds are **manual** by design — they never run on container startup.

### Via Node.js script (recommended)

```bash
# Run all pending migrations
node backend/scripts/migrate.js

# Full database reset (drops and recreates DB):
# NOTE: This destroys all data. --fresh is refused unless the destructive
# confirmation flag is supplied, and --fresh --seed is rejected outright.
node backend/scripts/migrate.js --fresh --confirm-destructive-fresh

# Seeding is always a separate step
./scripts/seed.sh
```

### Via Node runner (canonical entry point)

```bash
# Set DB_HOST=localhost if running outside Docker
# (--fresh requires the explicit destructive confirmation flag)
DB_HOST=localhost node backend/scripts/migrate.js --fresh --confirm-destructive-fresh
DB_HOST=localhost ./scripts/seed.sh
```

### What the seed includes

The seed step (`./scripts/seed.sh`) loads the **baseline snapshot** (`database/seed/003_baseline_snapshot.sql`) which contains:

- Reference data (countries, cities, provinces, sports, amenities)
- RBAC configuration (roles, permissions, role_permissions)
- CMS pages and content
- Subscription plans and features
- App settings, design tokens, and translations
- A pre-provisioned Super Admin account (`users.id = 1`, `super_admin` role) with a committed password hash — verify its status and rotate the credential before production use

After seeding, role permissions are synced automatically via `sync-role-permissions.mjs`.

### Starting fresh with demo data

```bash
# 1. Destructive schema reset — explicit confirmation required
node backend/scripts/migrate.js --fresh --confirm-destructive-fresh

# 2. Reference seed data (all seed files, in order)
./scripts/seed.sh

# 3. Player demo data
./scripts/seed.sh --seed-file 003_player_demo.sql
```

This adds synthetic organisations, bookings, marketplace listings, and coach profiles.

### Creating the Super Admin account

Seeds ship a pre-provisioned Super Admin (`users.id = 1`). The manual bootstrap script creates
or locates a Super Admin and ensures its role grant — it is not wired into any entrypoint, so it
only runs when invoked:

```bash
# From the project root (reads process env, then the root .env)
node backend/scripts/bootstrap-admin.js \
  --confirm-host=localhost --confirm-port=3306 --confirm-db=courtzon_v3
```

All three confirmation flags must match the **resolved** `DB_HOST`, `DB_PORT`, and `DB_NAME`
exactly (process env wins over `.env`; defaults are `localhost:3306/courtzon_v3`). The script
refuses `courtzon_v2`, prints the resolved target before connecting, opens no connection until
confirmation matches, and exits nonzero when a required variable or any confirmation flag is
missing.

It reads the following variables, creates the `users` row plus the `super_admin` role grant,
and never prints phone numbers, emails, or passwords:

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `SUPER_ADMIN_PHONE` | ✓ | — | Local **11-digit** number without country code — the exact value typed at login |
| `SUPER_ADMIN_COUNTRY_ISO` | ✓ | — | **ISO-2** code of an active `countries` row (e.g. `EG`); its `phone_code` prefixes the stored `full_phone` |
| `SUPER_ADMIN_EMAIL` | ✓ | — | Profile email only (`users.email` is NOT NULL + UNIQUE) — **not** a login identifier |
| `SUPER_ADMIN_PASSWORD` | ✓ | — | Password (PBKDF2-SHA512 hashed, never logged) |
| `SUPER_ADMIN_NAME` | | `Super Admin` | `users.full_name` for the new account |
| `SUPER_ADMIN_GENDER` | | `male` | `male` or `female` (`users.gender` is NOT NULL) |

**Login is phone + password — never email.** At the login screen, select the same country and
type the same local 11-digit number; the backend resolves the account through
`full_phone` (`+<country code><local number>`).

The script aborts with a nonzero exit code when a required variable or any target confirmation flag
is missing, and on an invalid phone, country code, or gender. Re-running is safe: an existing user with
the same `full_phone` is reused and only the `super_admin` role grant is ensured (a revoked or
expired grant is reported, never silently reactivated). If permissions look empty afterwards, run
`sync-role-permissions.mjs` with the same `--confirm-host` / `--confirm-port` / `--confirm-db`
values. Supply the values at run time and remove them afterwards — never commit real values to a `.env`.

## Running the Application

### Docker stack

```bash
docker compose up -d
# Backend:   http://localhost:3000
# Frontend:  http://localhost:5173
```

### Local development

```bash
# Terminal 1 — backend (port 3000)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

The Vite dev server proxies `/api/*` requests to the backend automatically (see `frontend/vite.config.ts` for the proxy table).

## Accessing the API Docs

Swagger/OpenAPI documentation is available at:

```
http://localhost:3000/docs
```

- In **development**: docs are enabled by default.
- In **production**: docs are disabled unless `ENABLE_API_DOCS=true` is set.
- The raw OpenAPI spec (JSON) is at `http://localhost:3000/openapi.json`.

The docs are interactive — you can test endpoints directly from the browser. Authentication uses HttpOnly session cookies (set via `POST /auth/login`) or the `Authorization: Bearer` header.

## Health Check Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health/live` | Liveness probe (always 200 if process is running) |
| `GET /health/ready` | Readiness probe (checks DB + Redis + storage) |
| `GET /health` | Aggregate health (status: ok/degraded/down) |
| `GET /health/database` | Database connectivity check |
| `GET /health/redis` | Redis connectivity check |
| `GET /health/storage` | Storage backend check |

## What's Next

- [Local Development Guide](local_development.md) — hot-reload, debugging, tests
- [Database Guide](database/database_guide.md) — schema, migrations, seed system
- [Production Deployment](deployment/production.md) — building for production
- [Coolify Deployment](deployment/coolify.md) — deploying via Coolify
- [Troubleshooting](troubleshooting.md) — common issues and solutions
