# CourtZon V2

Sports management platform for court facilities — booking, payments, marketplace, academies, coaching, tournaments, memberships, and enterprise administration.

Built as a modular monolith with Domain-Driven Design, event-driven architecture, and realtime communications.

## Architecture

- **Backend:** Fastify + TypeScript + MySQL + Redis + BullMQ + Socket.IO
- **Frontend:** React 18 + Vite 8 + TypeScript + React Query + Socket.IO Client
- **Testing:** Vitest (601 tests, 69 files)
- **Monitoring:** Prometheus (35 metrics) + Grafana
- **Deployment:** Docker Compose (6 services)

## Quick Start

```bash
# Copy environment file
cp .env.example .env   # or configure manually

# Start all services
docker compose up -d

# Apply database schema
docker compose exec backend mysql -u root -p < database/baseline/001_courtzon_v3.sql

# Run migrations
docker compose exec backend node dist/scripts/migrate.js

# Verify health
curl http://localhost:3000/health
```

## Documentation

- `RELEASE_NOTES.md` — Full Version 1.0.0 release notes
- `CHANGELOG.md` — Complete changelog
- `VERSION` — Current version tag

## License

Proprietary. All rights reserved.
