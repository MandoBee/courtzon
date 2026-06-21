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
  test:
    - Run linter (ESLint)
    - Run type checker (tsc)
    - Run unit tests (Vitest)
    - Run integration tests (testcontainers)
  build:
    - Build backend (tsc)
    - Build frontend (vite build)
    - Build Docker images
  deploy:
    - Push images to registry
    - SSH into host → docker-compose pull && up -d
    - Run migrations
    - Health check endpoint
```

## Environment Configuration
- `.env` files per environment (dev/staging/prod)
- Secrets managed via Docker secrets or cloud vault
- Database connection strings per tenant pool
- Redis connection, JWT secret, payment gateway keys

## Health Checks
- `GET /health` → returns DB, Redis, Socket.IO status
- `GET /health/ready` → readiness probe
- `GET /health/live` → liveness probe
