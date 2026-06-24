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
# NOTE: This destroys all data. Use only for initial setup.
node backend/scripts/migrate.js --fresh --seed
```

### Via shell scripts (alternative)

```bash
# Set DB_HOST=localhost if running outside Docker
DB_HOST=localhost ./scripts/migrate.sh --fresh
DB_HOST=localhost ./scripts/seed.sh
```

### What the seed includes

`--seed` loads the **baseline snapshot** (`database/seed/003_baseline_snapshot.sql`) which contains:

- Reference data (countries, cities, provinces, sports, amenities)
- RBAC configuration (roles, permissions, role_permissions)
- CMS pages and content
- Subscription plans and features
- App settings, design tokens, and translations
- Admin user accounts (if configured via `SUPER_ADMIN_EMAIL`)

After seeding, role permissions are synced automatically via `sync-role-permissions.mjs`.

### Starting fresh with demo data

```bash
node backend/scripts/migrate.js --fresh --seed --seed-demo
```

This adds synthetic organisations, bookings, marketplace listings, and coach profiles.

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
