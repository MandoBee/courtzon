# CourtZon V3

Production-grade SaaS platform for sports facility management, court booking, marketplace, academy management, and tournament organization.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Frontend  │────▶│   Backend    │────▶│  MySQL  │
│  (React 19) │     │ (Fastify TS) │     │   8.0   │
│  Nginx SPA  │     │  BullMQ/Redis│     ├─────────┤
└─────────────┘     │  Paymob/PG   │     │  Redis  │
                    └──────────────┘     └─────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- MySQL 8.0 (or Docker MySQL)
- Redis 7 (or Docker Redis)

### Local Development

```bash
# 1. Start dependencies (MySQL + Redis via Docker)
docker compose up -d mysql redis

# 2. Copy environment config
cp deployment/env/.env.example .env

# 3. Install backend dependencies
cd backend && npm install

# 4. Run migrations & seed
cd .. && DB_HOST=localhost ./scripts/migrate.sh --fresh
DB_HOST=localhost ./scripts/seed.sh

# 5. Start backend (hot-reload)
cd backend && npm run dev

# 6. In a new terminal: start frontend (hot-reload)
cd frontend && npm install && npm run dev
```

### Docker Stack (Full Production)

```bash
# Build and start all services
docker compose build backend frontend
docker compose up -d

# Run migrations manually (first deploy)
docker compose exec backend node scripts/migrate.js

# Run seed manually (first deploy)
docker compose exec backend node scripts/seed.sh
```

## Project Structure

```
courtzon/
├── backend/            # Fastify TypeScript API server
│   ├── src/           # Source code
│   └── scripts/       # Operational scripts
├── frontend/          # React 19 + Vite SPA
│   └── src/           # Source code
├── database/
│   ├── baseline/      # Single authoritative schema
│   ├── migrations/    # Future incremental migrations
│   └── seeds/         # Seed data
├── deployment/
│   ├── env/           # Environment templates
│   └── coolify/       # Coolify deployment configs
├── scripts/           # Shell scripts (migrate, seed, backup, restore)
├── docs/              # Documentation
└── docker-compose.yml # Production Docker stack
```

## Key Principles

1. **No auto-migrations on startup** — migrations are manual only
2. **No auto-seed on startup** — seeds are manual only
3. **Single schema authority** — `database/baseline/001_courtzon_v3.sql`
4. **Single seed authority** — `database/seeds/`
5. **Environment from Coolify only** — no committed secrets
6. **Deterministic builds** — multi-stage Docker with lockfiles

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/getting_started.md` | Everything you need to get started |
| `docs/local_development.md` | Local dev setup guide |
| `docs/deployment/production.md` | Production deployment guide |
| `docs/deployment/coolify.md` | Coolify-specific deployment |
| `docs/database/database_guide.md` | Database architecture guide |
| `docs/database/backup_recovery.md` | Backup & recovery procedures |
| `docs/security/security_audit.md` | Security audit & recommendations |
| `docs/troubleshooting.md` | Common issues & solutions |

## License

Private — All rights reserved.
