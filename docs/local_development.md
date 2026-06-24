# Local Development Guide

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  Frontend   │────▶│   Backend    │────▶│  MySQL  │
│ (React 19   │     │ (Fastify TS) │     │   8.0   │
│  Vite HMR)  │     │  tsx watch   │     ├─────────┤
└──────────────┘     │  BullMQ/Redis│     │  Redis  │
                     └──────────────┘     │    7    │
                                          └─────────┘
```

For local development, **MySQL and Redis run in Docker** while the backend and frontend run on your host for instant hot-reload.

## Starting Docker Dependencies

```bash
# From the project root
docker compose up -d mysql redis
```

This starts:

- **MySQL 8.0** on port `3307` (configurable via `MYSQL_PUBLISH_PORT`; avoids conflict with a local MySQL on 3306)
- **Redis 7** on port `6379` (configurable via `REDIS_PORT`)

To verify:

```bash
docker compose ps
# Both mysql and redis should show "running" and "healthy"
```

### Docker Compose Profiles

The Docker Compose file uses profiles:

- `docker compose --profile db up -d` — starts only MySQL and Redis
- `docker compose up -d` — starts everything (requires images built)

## Backend Hot-Reload

The backend uses **tsx watch** for instant TypeScript reload.

```bash
cd backend

# Install dependencies (first time or after pull)
npm install

# Start with hot-reload
npm run dev
```

This runs `tsx watch --env-file=.env src/server.ts`:

- Watches all `src/` files for changes
- Auto-restarts on save
- Pretty-prints logs via `pino-pretty`
- `--env-file=.env` loads environment from `backend/.env` (falls back to root `.env`)

### Environment for local backend

The backend reads from `backend/.env` first, then falls back to the root `.env`. At minimum:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=courtzon_v2
DB_USER=root
DB_PASSWORD=your-password
REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_SECRET=dev-cookie-secret-change-in-production
```

> If using Docker MySQL on port `3307`, set `DB_PORT=3307`.

### Debugging the backend

- **Logs:** The backend uses `pino` with `pino-pretty` in dev mode. Log level is controlled by `LOG_LEVEL` (default: `debug` in dev).
- **Breakpoints:** Use `--inspect` with tsx:
  ```bash
  npx tsx --inspect --env-file=.env src/server.ts
  ```
  Then open `chrome://inspect` in Chrome.
- **VSCode**: Create a `.vscode/launch.json`:
  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "type": "node",
        "request": "launch",
        "name": "Debug Backend",
        "runtimeExecutable": "npx",
        "runtimeArgs": ["tsx", "--env-file=.env", "src/server.ts"],
        "cwd": "${workspaceFolder}/backend",
        "restart": true,
        "console": "integratedTerminal",
        "internalConsoleOptions": "neverOpen"
      }
    ]
  }
  ```

## Frontend Hot-Reload

The frontend uses **Vite** with React HMR (Hot Module Replacement).

```bash
cd frontend

# Install dependencies (first time or after pull)
npm install

# Start dev server
npm run dev
```

This starts Vite on `http://localhost:5173` with:

- Instant HMR — edit React components and see changes immediately
- API proxy — all `/api/*` routes proxy to the backend (see `vite.config.ts` for the proxy table)
- SPA fallback — all routes serve `index.html` for client-side routing

### Environment for local frontend

The frontend reads from `frontend/.env` or root `.env`. Key variables:

```env
VITE_API_URL=http://localhost:3000
VITE_PAYMOB_PUBLIC_KEY=pk_test_...
```

`VITE_API_URL` can be left empty — Vite's dev server proxies requests to the backend automatically.

## Debugging Tips

### Backend

| Technique | How-to |
|---|---|
| **Increase log level** | Set `LOG_LEVEL=debug` (default in dev) |
| **Disable rate limits** | Set `RELAX_RATE_LIMIT=true` |
| **Enable Swagger docs** | Enabled by default in dev at `/docs` |
| **Inspect DB queries** | Enable MySQL general log or use `pino` SQL logging |
| **Test payments** | Set `PAYMENT_GATEWAY_PROVIDER=mock` |

### Frontend

| Technique | How-to |
|---|---|
| **React DevTools** | Install browser extension for component inspection |
| **Network tab** | Check proxy is working (requests to `/api/*` should reach backend) |
| **Vite overlay** | TypeScript/build errors appear in the browser |
| **Console logs** | Frontend logs API calls and state changes to the console |

## Running Tests

### Unit Tests (backend)

```bash
cd backend
npm run test:unit
# or
npm run test          # same
```

Runs all `*.spec.ts` files in `backend/src/` via Vitest. Matches against the pattern:

```bash
# Pattern: src/**/*.spec.ts
```

### Integration Tests (backend)

Integration tests use `testcontainers` to spin up real MySQL and Redis instances:

```bash
cd backend
npm run test:int
```

- Timeout: 180s per test (containers take time to start)
- Sequential execution (file parallelism disabled)
- Setup file: `vitest.integration.setup.ts`

### Frontend Tests

```bash
cd frontend
npm run test          # vitest run
npm run test:watch    # vitest (watch mode)
```

Uses jsdom as the test environment. Component tests with `@testing-library/react` live alongside components.

### E2E Tests

Playwright end-to-end tests at the project root:

```bash
# Run all E2E tests
npm run test:e2e

# Run only public smoke tests
npm run test:e2e:ci
```

E2E config: `playwright.config.ts` at the project root.

## Code Quality

### Linting

**Frontend:**

```bash
cd frontend
npm run lint          # ESLint with typescript-eslint
```

Uses ESLint 10 with flat config (`eslint.config.js`). Custom rules in `frontend/eslint-rules/`.

**Backend:** Linting is enforced via TypeScript strict mode.

### Type Checking

**Frontend:**

```bash
cd frontend
npm run build         # tsc -b && vite build
```

The `tsc -b` step performs project-wide type checking.

**Backend:**

```bash
cd backend
npm run build         # tsc
```

Both use TypeScript 6.x with strict settings.

### Pre-commit

Ensure code passes linting and type checking before committing:

```bash
cd frontend && npm run lint && npm run build
cd backend && npm run build
```

## Database Management

### Migrations

```bash
# Run pending migrations (Node.js — cross-platform)
node backend/scripts/migrate.js

# Run pending migrations (bash — Linux/Mac/WSL)
./scripts/migrate.sh

# Full reset (⚠️ destroys data)
node backend/scripts/migrate.js --fresh --seed

# Check migration status
./scripts/migrate.sh --status

# Rollback a specific migration
./scripts/migrate.sh --rollback <filename>
```

Migrations live in `database/schema/` (Node.js script) or `database/migrations/` (bash script). The Node.js script (`backend/scripts/migrate.js`) is the canonical option.

### Seeds

```bash
# Load baseline seed data
node backend/scripts/migrate.js --seed

# Baseline + demo data
node backend/scripts/migrate.js --seed --seed-demo

# Legacy seeds (001/002)
node backend/scripts/migrate.js --seed-legacy
```

### Refreshing the Baseline Snapshot

After making configuration changes in the admin UI, update the baseline:

```bash
node backend/scripts/export-baseline-seed.mjs
# Preview only:
node backend/scripts/export-baseline-seed.mjs --dry-run
```

Commit both `003_baseline_snapshot.sql` and `baseline-manifest.json`.

## Useful npm Scripts

### Backend (`backend/package.json`)

| Script | Command | Description |
|---|---|---|
| `dev` | `tsx watch src/server.ts` | Hot-reload development server |
| `build` | `tsc` | TypeScript compilation |
| `start` | `node dist/server.js` | Run compiled production code |
| `db:migrate` | `node scripts/migrate.js` | Run pending migrations |
| `db:reset` | `node scripts/migrate.js --fresh --seed` | Full database reset |
| `db:seed` | `node scripts/migrate.js --seed` | Run seeds |
| `db:backup` | `bash scripts/backup.sh` | Manual database backup |
| `test` | `vitest run` | Run unit tests |
| `test:int` | `vitest run --config vitest.integration.config.ts` | Run integration tests |
| `test:watch` | `vitest` | Watch mode for unit tests |
| `verify-deployment` | `node scripts/verify-deployment.js` | Pre-deployment verification |
| `bootstrap-admin` | `node scripts/bootstrap-admin.js` | Create initial admin user |
| `emergency-repair` | `node scripts/emergency-repair.js` | Emergency DB repair tool |

### Frontend (`frontend/package.json`)

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Vite dev server with HMR |
| `build` | `tsc -b && vite build` | TypeScript check + production build |
| `lint` | `eslint .` | ESLint code linting |
| `preview` | `vite preview` | Preview production build locally |
| `test` | `vitest run` | Run unit tests |
| `test:watch` | `vitest` | Watch mode for tests |

### Root (`package.json`)

| Script | Command | Description |
|---|---|---|
| `test:e2e` | `playwright test` | Run all E2E tests |
| `test:e2e:ci` | `playwright test --grep "Smoke — public"` | CI smoke tests |

## Database User Setup

For local development, you can use the MySQL root user. For production-like testing, create the application users:

```bash
mysql -u root -p < database/scripts/setup-db-users.sql
```

Then set passwords:

```sql
ALTER USER 'courtzon_app'@'%' IDENTIFIED BY 'your-strong-password';
ALTER USER 'courtzon_migrator'@'%' IDENTIFIED BY 'your-strong-password';
ALTER USER 'courtzon_backup'@'%' IDENTIFIED BY 'your-strong-password';
ALTER USER 'courtzon_readonly'@'%' IDENTIFIED BY 'your-strong-password';
FLUSH PRIVILEGES;
```

## Port Cleanup

The frontend Vite dev server runs on port `5173`. When you're done:

```bash
# Find and kill the process on port 5173
npx kill-port 5173
# or manually:
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```
