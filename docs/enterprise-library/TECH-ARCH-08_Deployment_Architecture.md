---
document_id: "TECH-ARCH-08"
document_name: "Deployment Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["devops", "developer"]
difficulty: "intermediate"
reading_time: 20
business_owner: "DevOps Manager"
technical_owner: "DevOps Engineer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-08"]
  references: ["TECH-ARCH-01", "TECH-DEV-10"]
  related: ["VOLUME-20", "VOLUME-21"]
---

# CourtZon Deployment Architecture

## 1. Docker Compose Stack

The entire platform runs in a **6-container Docker Compose stack**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          docker-compose.yml                                  │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │    MySQL 8    │  │   Redis 7    │  │   Backend    │  │   Frontend     │ │
│  │  courtzon-    │  │ courtzon-    │  │ courtzon-    │  │ courtzon-      │ │
│  │  mysql        │  │ redis        │  │ backend      │  │ frontend       │ │
│  │  :3306 → 3307 │  │  :6379       │  │  :3000       │  │  :80 → 5173   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                 │                  │                   │          │
│         └─────────────────┴──────────────────┴───────────────────┘          │
│                                    │                                       │
│  ┌────────────────────────────────┴─────────────────────────────────────┐ │
│  │                     Network: courtzon                                 │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  (optional: --profile monitoring)│
│  │   Prometheus     │  │    Grafana       │                                │
│  │ courtzon-        │  │ courtzon-        │                                │
│  │ prometheus       │  │ grafana          │                                │
│  │  :9090           │  │  :3000 → 3001    │                                │
│  └──────────────────┘  └──────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Evidence:** `docker-compose.yml:1-171` defines all 6 services with health checks, resource limits, and persistent volumes.

## 2. Backend Dockerfile (Multi-Stage)

```dockerfile
# backend/Dockerfile
# ── Stage 1: Builder ──
FROM node:22-alpine AS builder
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
COPY packages/ /packages/
RUN npm ci --ignore-scripts
COPY backend/tsconfig.json ./
COPY backend/src/ src/
RUN npm run build

# ── Stage 2: Runner ──
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini su-exec netcat-openbsd mysql-client
COPY backend/package.json backend/package-lock.json ./
COPY packages/ /packages/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist/ dist/
COPY backend/scripts/ scripts/
COPY database/ database/
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
```

**Evidence:** `backend/Dockerfile:1-30` implements the two-stage build. The final image is 2-layers - dist + production dependencies only.

## 3. Frontend Dockerfile (Multi-Stage)

The frontend Dockerfile builds the Vite app and serves via Nginx:

```dockerfile
# frontend/Dockerfile (structure inferred from docker-compose.yml)
# Stage 1: Build the React SPA with Vite
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY frontend/nginx.conf /etc/nginx/nginx.conf
COPY frontend/security-headers.conf /etc/nginx/security-headers.conf
COPY frontend/api-proxy.conf /etc/nginx/api-proxy.conf
```

**Evidence:** `docker-compose.yml:96-117` builds the frontend with build args for Paymob public key and feature flags. `frontend/nginx.conf:1-117` configures the nginx server.

## 4. Nginx Configuration

```nginx
# frontend/nginx.conf (key sections)
# API proxy
location /api/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

# WebSocket proxy
location /socket.io/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}

# SPA fallback
location / {
    try_files $uri $uri/ /index.html;
    include /etc/nginx/security-headers.conf;
    add_header Cache-Control "no-cache";
}

# Admin SPA routing
location /admin/ {
    if ($is_api_request = "spa") { rewrite ^ /index.html last; }
    proxy_pass http://backend:3000;
}
```

**Evidence:** `frontend/nginx.conf:52-62` (API proxy), `97-109` (WebSocket proxy with 86400s timeout), `111-115` (SPA fallback), `80-91` (Admin routing with accept-header based detection).

## 5. Environment Variable Configuration

```yaml
# docker-compose.yml:66-77
environment:
  NODE_ENV: production
  PORT: 3000
  DB_HOST: mysql
  DB_PORT: 3306
  REDIS_HOST: redis
  REDIS_PORT: 6379
  APP_URL: ${APP_URL:-https://courtzon.cloud}
  CORS_ORIGINS: ${CORS_ORIGINS:-https://www.courtzon.cloud,https://admin.courtzon.cloud}
  RELAX_RATE_LIMIT: "true"
```

**Evidence:** Environment variables configure database connections, Redis, CORS, and runtime behavior. The `.env` file is loaded at container runtime.

## 6. Health Check Endpoints

```
GET /health          → Composite check (DB + Redis + memory)
GET /health/live     → Liveness (process running)
GET /health/ready    → Readiness (DB + Redis reachable)
GET /health/database → Database connectivity
GET /health/redis    → Redis connectivity
GET /health/storage  → Storage/filesystem
GET /health/socket   → Socket.IO connections
GET /health/version  → Build metadata (commit, build time, version)
```

**Evidence:** `backend/src/app.ts:410-476` defines all health endpoints. Docker health check at `backend/Dockerfile:47-48` uses `/health/live` with 30s interval.

## 7. Docker Compose Profiles

Monitoring services are optional via Docker profiles:

```bash
# Start core stack
docker compose up -d

# Start with monitoring
docker compose --profile monitoring up -d prometheus grafana
```

**Evidence:** `docker-compose.yml:119-160` defines Prometheus and Grafana with `profiles: [monitoring]`.

## 8. Persistent Volumes

```
volumes:
  mysql_data:       # /var/lib/mysql — database files
  redis_data:       # /data — Redis append-only file
  backend_backups:  # /app/backups — database backups
  prometheus_data:  # /prometheus — metrics (15 day retention)
  grafana_data:     # /var/lib/grafana — dashboards
```

**Evidence:** `docker-compose.yml:166-171` defines all 5 named volumes with their backing services.

## 9. Deployment Flow

```
1. Developer commits → GitHub master
2. (Optional) CI/CD auto-deploys from master
3. Pull on target host
4. docker compose build backend frontend
5. docker compose up -d
6. Verify: curl http://localhost:3000/health
7. Verify: curl http://localhost:5173
```

**Evidence:** `AGENTS.md` documents the full deployment workflow including the mandatory rebuild sequence.

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| VOLUME-20 | Deployment (pending) |
| VOLUME-21 | Operations (pending) |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
