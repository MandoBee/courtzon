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
| Backend unit tests | `cd backend && npm run test` |
| Backend integration tests | `cd backend && npm run test:int` |
| Frontend tests | `cd frontend && npm run test` |
| E2E smoke tests | `npm run test:e2e` (requires backend + frontend running) |
| Frontend build | `cd frontend && npm run build` |
| Full Docker stack (API + SPA; host or Docker DB) | `docker compose up -d --build` |
| Docker MySQL (port 3307 on host) | `docker compose --profile db up -d mysql` |
| Dev Docker stack (HMR) | `docker compose -f docker-compose.dev.yml up -d --build` |
| Monitoring stack | `docker compose up -d` then `docker compose -f docker-compose.monitoring.yml up -d` |

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
├── docker-compose.yml # mysql, redis, backend, frontend
└── AGENTS.md          # Dev automation rules for agents
```

See `AGENTS.md` for toast conventions, permission gating, and Docker rebuild rules.
