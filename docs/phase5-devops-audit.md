# PHASE 5 — DEVOPS & OPERATIONS AUDIT

**Date:** 2026-06-05
**Scope:** Docker, CI/CD, deployment, infrastructure, monitoring, production readiness

---

## DEVOPS SCORECARD

| Category | Score | Notes |
|----------|-------|-------|
| Docker Setup | 7/10 | Multi-stage, tini, but no non-root user |
| Docker Compose | 7/10 | Good healthcheck chain, MySQL profiled off |
| Environment Mgmt | 5/10 | 3 overlapping `.env` files, plaintext root password in repo |
| CI/CD | 7/10 | GitHub Actions with lint, typecheck, test, E2E, security scans |
| Deployment Arch | 4/10 | Well-documented target, but no actual deploy workflow exists |
| Backup & DR | 3/10 | Backup script exists but no automation, no restore testing |
| Redis Architecture | 6/10 | Good config, but single instance (no HA) |
| BullMQ Architecture | 5/10 | Single queue, no dead letter, no monitoring UI |
| Logging Strategy | 6/10 | Pino structured JSON, but no central aggregation |
| Monitoring | 5/10 | Prometheus+Grafana configured, but no dashboards, no alerting |
| Performance Monitoring | 3/10 | No APM, no Sentry, basic Prometheus metrics only |
| Infrastructure Security | 4/10 | No non-root containers, no nginx.prod.conf, no SSL certs |
| Secrets Management | 4/10 | Real secrets in .env in working directory, Docker env_file pattern good |
| Scaling Strategy | 3/10 | Single process, no cluster mode, no horizontal scaling |
| Cost Optimization | 4/10 | No infra cost analysis, no resource limits in compose |
| Production Readiness | 4/10 | Good baseline, critical gaps in SSL, HA, DR, CI/CD deploy |
| **Overall** | **4.8/10** | |

---

## PRODUCTION READINESS SCORE

| Criteria | Status | Notes |
|----------|--------|-------|
| SSL/TLS Termination | ❌ Missing | `nginx.prod.conf` referenced but does not exist |
| Non-root Containers | ❌ Missing | All containers run as root |
| Database HA | ❌ Missing | Single MySQL instance, no replica |
| Redis HA | ❌ Missing | Single Redis instance, no sentinel |
| Automated Backups | ⚠️ Partial | Script exists, no schedule, no off-site |
| Disaster Recovery Plan | ❌ Missing | No documented DR plan |
| CI/CD Deploy Pipeline | ❌ Missing | No deployment workflow in CI |
| Central Logging | ❌ Missing | Logs only to container stdout |
| Monitoring Dashboards | ⚠️ Partial | Grafana configured, no dashboards provisioned |
| Alerting | ❌ Missing | No alerting rules in Prometheus |
| APM / Error Tracking | ❌ Missing | No Sentry, no OpenTelemetry |
| Load Testing | ❌ Missing | No load test scripts or results |
| Horizontal Scaling | ❌ Missing | Single process, no cluster mode |
| Secrets Rotation | ❌ Missing | No automated secret rotation |
| **Overall Readiness** | **4/10** | **Not production-ready in current state** |

---

## 1. DOCKER REVIEW

### Dockerfiles

| File | Base Image | Stages | Port | Non-root? | Healthcheck? |
|------|-----------|--------|------|-----------|-------------|
| `backend/Dockerfile` | `node:22-alpine` | 2 (builder + runner) | 3000 | ❌ None | ❌ (in compose) |
| `backend/Dockerfile.dev` | `node:22-alpine` | 1 | 3000 | ❌ None | ❌ |
| `frontend/Dockerfile` | `node:22-alpine` → `nginx:1.27-alpine` | 2 | 80 | ❌ (nginx default root) | ❌ |

### Strengths
- Multi-stage builds for both backend and frontend (smaller final images)
- `tini` init system in all backend containers (proper PID 1 signal handling)
- `--ignore-scripts` on all `npm ci` commands (prevents postinstall script execution)
- `npm cache clean --force` in production runner (reduces image size)
- Secrets never baked into images — injected at runtime via `env_file`
- Frontend uses Nginx Alpine (very small final image, ~25MB)

### Weaknesses
- **No `USER` directive**: All containers run as root. Security best practice violation.
- **No read-only root filesystem**: Containers can write anywhere.
- **No `--no-cache` for apk**: Could reduce image size slightly.
- **No layer ordering optimization**: `package.json` is copied before `tsconfig.json` but could be merged.
- **No Docker image tagging strategy**: Images are built locally, not pushed to any registry.
- **No production `nginx.prod.conf`**: Referenced in comments but file does not exist.

---

## 2. DOCKER COMPOSE REVIEW

### Service Topology (Production)

```
docker-compose.yml (name: courtzon)
  mysql:8.0       → Port 3307:3306   (profiled ["db"] — not started by default)
  redis:7-alpine  → Port 6379:6379
  backend         → Port 3000:3000   (builds from backend/Dockerfile)
  frontend (nginx)→ Port 5173:80     (builds from frontend/Dockerfile)

docker-compose.monitoring.yml (name: courtzon-monitoring)
  prometheus:v2.55.1  → Port 9090:9090  (attaches to external courtzon network)
  grafana:11.4.0      → Port 3001:3000  (attaches to external courtzon network)
  node-exporter:v1.8.2→ Port 9100:9100  (attaches to external courtzon network)
```

### Healthcheck Chain
```
redis (healthcheck) → backend (depends_on redis healthy) → frontend (depends_on backend healthy)
mysql (healthcheck) → no dependents (backend handles via nc wait in entrypoint)
```

### Strengths
- Named volumes for MySQL, Redis, backend backups (data survives container restart)
- Bind mount for backend uploads (survives rebuilds, visible on host)
- `env_file` pattern for secrets (never in compose file itself)
- `extra_hosts: host.docker.internal:host-gateway` for cross-platform Docker networking
- Graceful healthcheck chain with start periods and retries

### Weaknesses
- **MySQL has `profiles: ["db"]`** — not started by default. This means production compose does NOT start a database. This is intentional (for connecting to external MySQL) but undocumented and surprising.
- **No CPU/memory limits** on any service (`deploy.resources` not set)
- **No restart policy** on `mysql` in dev compose
- **`RELAX_RATE_LIMIT: "true"`** hardcoded in production compose — should not be in production
- **`ENABLE_API_DOCS: "true"`** hardcoded in production compose — should be false in production
- **Backend depends only on `redis`**, not on `mysql` — MySQL readiness is handled in entrypoint, but compose doesn't reflect the dependency
- **No network security**: All services on a flat bridge network, no separation between tiers
- **Frontend dev**: Uses raw `node:22-alpine` with `npm run dev` — no Dockerfile, npm install runs on every start

---

## 3. ENVIRONMENT MANAGEMENT

### Current .env Files

| File | Contains Real Secrets? | Has .env.example? | Used By |
|------|----------------------|-------------------|---------|
| `root/.env` | ✅ Yes (root/CourtZon2026) | ✅ Yes | Docker compose, backend |
| `backend/.env` | ✅ Yes (root/CourtZon2026) | ✅ Yes | Local backend dev |
| `frontend/.env` | ❌ No (empty VITE_API_URL) | ✅ Yes | Frontend dev |

### Overlapping Variables (Inconsistency Risk)

| Variable | Root .env | Backend .env | Backend .env.example |
|----------|-----------|-------------|---------------------|
| `DB_HOST` | `host.docker.internal` | `localhost` | `localhost` |
| `DB_USER` | `root` | `root` | `app_user` |
| `DB_PASSWORD` | `CourtZon2026` | `CourtZon2026` | `change-me` |
| `REDIS_HOST` | `courtzon-redis` | `localhost` | `localhost` |

### Issues
- **Root MySQL password in plaintext** in `.env` (C-01 from Phase 3, still unresolved)
- **3 separate .env files** with overlapping variables — risk of inconsistency
- **No `.env.staging` or `.env.production`** — single `.env` for all environments
- **`NODE_ENV=development`** in root `.env` — would be wrong for production deploy
- **`BACKEND_URL`** hardcoded in `docker-compose.dev.yml` instead of using env variable
- **No `SESSION_SECRET`** set in any `.env` — falls back to hardcoded dev value (C-02 from Phase 3)

---

## 4. CI/CD ASSESSMENT

### Current Workflows

| Workflow | Trigger | Jobs | Status |
|----------|---------|------|--------|
| `ci.yml` | Push to `main`/`develop`, PR to `main` | Backend (tsc + unit test), Backend Integration, Frontend (tsc + test + build), E2E Smoke | ✅ Active |
| `security-scan.yml` | Push to `main`/`develop`, PR to `main`, Schedule Mon 6AM | Dependency Audit (npm audit + Snyk), Docker Scan (Trivy), Secrets Detection (truffleHog), Lint & Type Check | ✅ Active |

### Pipeline Times (Estimated)

| Job | Est. Duration | Services Required |
|-----|--------------|-------------------|
| Backend unit | 2 min | None |
| Backend integration | 5 min | MySQL + Redis (compose services) |
| Frontend lint+typecheck | 2 min | None |
| Frontend test | 2 min | None |
| Frontend build | 3 min | None |
| E2E smoke | 3 min | Frontend build + webServer |
| Security audit | 4 min | None |
| Docker scan | 3 min | Docker |
| Secrets scan | 2 min | None |
| **Total CI** | **~15 min** | Parallel |

### Strengths
- Comprehensive parallel jobs (unit, integration, E2E, security)
- Service containers for integration tests (MySQL + Redis)
- Security scanning on schedule + every push
- npm caching configured
- `--ignore-scripts` used throughout
- E2E with Playwright

### Weaknesses
- **No deployment workflow**: CI stops at build. No push to registry, no SSH deploy, no staging/production deploy jobs.
- **No environment promotion**: No dev → staging → production pipeline.
- **No artifact caching**: Docker layers not cached between runs.
- **No PR preview deployments**: No preview environments for PRs.
- **No component tests** in CI: Only unit + integration + E2E, no component-level tests.
- **No load test job**: No k6/artillery in CI.
- **Snyk is conditional**: `if: ${{ secrets.SNYK_TOKEN != '' }}` — currently disabled.
- **truffleHog**: `|| true` at the end — secrets detection never fails the build.

---

## 5. DEPLOYMENT ARCHITECTURE

### Current (Local Docker Dev)
```
Frontend (Nginx:80) → Backend (Fastify:3000) → Redis:6379 + MySQL:3306
```

### Target (from docs/09-deployment.md)
```
Nginx Reverse Proxy → Fastify API xN (cluster) + Socket.IO xN (cluster) → Redis → MySQL Primary + Replica
```

### Issues
- **No deployment workflow exists** — the `deploy` job in the CI doc is aspirational, not implemented
- **No image registry** — Docker images are built locally only
- **No infrastructure-as-code** — no Terraform, Pulumi, or CloudFormation
- **No container orchestration** — no Kubernetes, Docker Swarm, or Nomad
- **No blue/green or rolling deploy strategy** defined
- **No production nginx.prod.conf** — TLS termination referenced but not configured
- **Node Exporter monitors the Docker host, not the containers** — no cAdvisor for container-level metrics
- **No `SOCKET.IO` cluster** — Socket.IO is listed in the target architecture but not implemented

---

## 6. BACKUP & DISASTER RECOVERY

### Backup Script (`backend/scripts/backup.js`)

```bash
mysqldump --single-transaction --routines --triggers --events ${DB_NAME} | gzip > ${BACKUP_DIR}/${DB_NAME}_${timestamp}.sql.gz
```

### Backup Capabilities
| Feature | Status |
|---------|--------|
| Full database dump | ✅ Yes (mysqldump) |
| Incremental backups | ❌ No |
| Compression | ✅ Gzip |
| Encryption | ⚠️ Optional (AES-256-CBC via BACKUP_ENCRYPTION_KEY) |
| Retention/pruning | ⚠️ Mentioned in docs, not implemented in script |
| Scheduled automation | ❌ No cron/scheduler |
| Off-site storage | ❌ Local volume only |
| Restore script | ❌ Not provided |
| Restore testing | ❌ Never tested |
| Point-in-time recovery | ❌ Binary logs not mentioned |

### Disaster Recovery Gaps
- **No DR plan document**: No RTO/RPO defined
- **No multi-region**: Single MySQL instance only
- **No replica**: No read replica for failover
- **No restore drill**: No documented restore procedure
- **Backup volume**: `backend_backups` named volume stored locally on Docker host

---

## 7. REDIS ARCHITECTURE

### Current Setup
| Property | Value |
|----------|-------|
| Version | Redis 7 Alpine |
| Deployment | Single container |
| Persistence | AOF/RDB via `/data` volume (Docker named volume) |
| Max Memory | 512MB |
| Eviction Policy | `allkeys-lru` |
| Auth | Optional (`REDIS_PASSWORD`) |
| Port | 6379 |
| Client Library | ioredis v5 |

### Redis Usage

| Feature | Implementation | Impact if Redis Down |
|---------|---------------|---------------------|
| Session Cache ❌ | Not used (sessions are DB-backed) | None |
| Brute-force Protection | Attempt counting + lockout | Auth security degraded |
| BullMQ Queues | Job queue + worker coordination | All background jobs fail |
| Distributed Locks | Booking slot locking (15s TTL) | Booking race conditions possible |
| Cache Service | `redis-cache.service.ts` (getOrSet, TTL) | Slightly slower responses |
| Rate Limiting ❌ | Fastify plugin, not Redis-backed | None |
| Health Checks | Redis PING | Health check shows degraded |

### Issues
- **No Redis Sentinel / Cluster**: Single point of failure. If Redis goes down, BullMQ, cache, locks, and brute-force protection all fail.
- **No persistence verification**: Not confirmed whether AOF is enabled.
- **No monitoring**: Redis metrics not scraped by Prometheus.
- **Memory limit is low for production**: 512MB may be insufficient for BullMQ job data + cache + locks at scale.

---

## 8. BULLMQ ARCHITECTURE

### Current Setup

| Property | Value |
|----------|-------|
| Queue Name | `default` |
| Concurrency | 5 workers |
| Lock Duration | 30 seconds |
| Retry Attempts | 3 |
| Backoff | Exponential (2s initial delay) |
| Job Completion Retention | 1 day |
| Job Failure Retention | 7 days |

### Job Types

| Job | Handler | Frequency |
|-----|---------|-----------|
| `send_email` | `sendEmail` | On-demand (registration, notifications) |
| `process_settlement` | `handleRunSettlements` | On-demand |
| `cancel_expired_bookings` | `cancelExpiredBookings` | Cron-style (recurring) |
| `database_backup` | `runDatabaseBackup` | Cron-style (recurring) |
| `run_settlements` | `handleRunSettlements` | Cron-style (recurring) |

### Issues
- **Single queue**: All job types share one queue. A backlog in one type blocks others.
- **No dead letter queue**: Failed jobs remain in the queue for 7 days with no separate DLQ.
- **No BullMQ dashboard**: No `@bull-board` or similar UI for monitoring queues.
- **No job prioritization**: All jobs equal priority.
- **No rate limiting per job type**: Email sending and database backup use same concurrency pool.
- **No job scheduling UI**: Jobs are added from backend code only, no admin UI.

---

## 9. LOGGING STRATEGY

### Current Setup
- **Logger**: Pino v10 (structured JSON logging)
- **Transports**: stdout only (pino-pretty in dev, JSON in production)
- **Redaction**: Authorization header, Cookie header, password and token fields
- **Levels**: `debug` in dev, `info` in production (overridable via `LOG_LEVEL`)
- **Module loggers**: `createModuleLogger(moduleName)` for scoped logging

### Issues
- **No central log aggregation**: Logs go to stdout only. No ELK, Loki, Datadog, or CloudWatch.
- **No log rotation**: Docker container logs can grow unbounded.
- **No structured error tracking**: No Sentry, no error grouping, no stack trace aggregation.
- **No audit log for infrastructure**: Only application audit logs (user actions), no infrastructure audit.
- **No request ID correlation**: No `x-request-id` tracing across services.
- **Pino-pretty in dev**: Human-readable but drops JSON structure.

---

## 10. MONITORING & OBSERVABILITY

### Current Stack

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| Prometheus | `prom/prometheus:v2.55.1` | 9090 | Metrics collection |
| Grafana | `grafana/grafana:11.4.0` | 3001 | Dashboards |
| Node Exporter | `prom/node-exporter:v1.8.2` | 9100 | Host metrics |

### Metrics Collected

| Source | Endpoint | Scrape Interval |
|--------|----------|-----------------|
| Prometheus self | `localhost:9090` | 15s |
| Node Exporter | `node-exporter:9100` | 15s |
| Backend | `backend:3000/metrics` | 15s |

### Issues
- **No pre-built dashboards**: No Grafana dashboards are auto-provisioned. Dashboard ID 1860 (Node Exporter Full) requires manual import.
- **No alerting rules**: No Prometheus alerting rules configured. No Alertmanager.
- **No business metrics**: Only technical metrics (CPU, memory, HTTP requests). No booking counts, revenue, user signups.
- **No container metrics**: Node Exporter monitors the Docker host, not individual containers. No cAdvisor.
- **No uptime monitoring**: No external health check service (Pingdom, Better Uptime).
- **No synthetic monitoring**: No browser-based synthetic checks.
- **No APM**: No OpenTelemetry, Jaeger, or Datadog APM.
- **No error tracking**: No Sentry or similar.

---

## 11. PERFORMANCE MONITORING

### Gaps
- **No APM tool**: No traces, no span data, no waterfall charts.
- **No database query monitoring**: No slow query logging configured beyond MySQL defaults.
- **No memory profiling**: No heap dumps, no GC monitoring.
- **No CPU profiling**: No flame graphs.
- **No load testing results**: No k6, Artillery, or vegeta scripts or results.
- **No baseline performance data**: No known req/s capacity or p99 latency.

### What Exists
- Prometheus `/metrics` endpoint (HTTP request duration, counters)
- Node Exporter for host-level CPU/memory/disk
- Backend health endpoint: `GET /health` (MySQL, Redis, memory)

---

## 12. INFRASTRUCTURE SECURITY

### Current State

| Layer | Status | Issues |
|-------|--------|--------|
| Container User | ❌ Root | All containers run as root |
| Container FS | ❌ Writable | No read-only root filesystem |
| Network | ⚠️ Flat | Single bridge network, no segmentation |
| SSL/TLS | ❌ Missing | No nginx.prod.conf, no certificates |
| WAF | ❌ Missing | No Web Application Firewall |
| DDoS Protection | ❌ Missing | No rate limiting at edge |
| Container Scanning | ✅ Trivy in CI | Scans on push + weekly |
| Secrets Scanning | ✅ truffleHog in CI | Never fails build (|| true) |
| Dependency Scanning | ✅ npm audit in CI | High severity only |
| SAST | ❌ Missing | No SonarQube, Semgrep, or CodeQL |
| DAST | ❌ Missing | No OWASP ZAP |

### Secrets Management

| Concern | Status |
|---------|--------|
| Secrets in .env files | ❌ Root MySQL password in plaintext |
| Docker secrets pattern | ✅ env_file used (not baked into images) |
| Secret rotation | ❌ No automated rotation |
| Secrets vault | ❌ No HashiCorp Vault / AWS Secrets Manager |
| `.env` in .gitignore | ⚠️ Not confirmed (root .gitignore not found) |

---

## 13. SCALING STRATEGY

### Current Limitations

| Dimension | Current | Required for Scale | Gap |
|-----------|---------|-------------------|-----|
| Application | Single Fastify process | Horizontal (multiple instances) | No cluster mode, no PM2 |
| Database | Single MySQL | Read replicas, sharding | No replication configured |
| Redis | Single instance | Sentinel/Cluster | No HA |
| File Storage | Local filesystem | S3-compatible (R2/MinIO) | S3 provider exists in code but not configured |
| Queues | Single BullMQ queue | Separate queues by type | Single queue |
| Workers | Concurrency: 5 | Dynamic scaling | Fixed concurrency |
| Frontend | Nginx single instance | CDN + multiple origins | No CDN configured |

### What Exists for Scaling
- S3 storage provider in dependencies (`@aws-sdk/client-s3`)
- `.env.example` has S3/R2 configuration (commented out)
- Documented target architecture in `docs/09-deployment.md`

---

## 14. COST OPTIMIZATION

### Estimated Monthly Production Architecture

| Service | Type | Est. Monthly Cost | Notes |
|---------|------|-------------------|-------|
| **Compute** | 2 vCPU, 4GB RAM (Docker host) | ~$30-50 | Single VM (Digital Ocean / Hetzner) |
| **Database** | MySQL 8.0 on same host | Included above | Could benefit from managed DB (+$15) |
| **Redis** | Redis on same host | Included above | Could benefit from managed Redis (+$10) |
| **Object Storage** | S3-compatible (uploads) | ~$5-15 | Cloudflare R2 / Backblaze B2 |
| **CDN** | Cloudflare CDN (free tier) | Free | For static assets + caching |
| **Monitoring** | Prometheus + Grafana on same host | Free | Self-hosted |
| **Email** | Transactional email | ~$10-30 | SendGrid / Resend |
| **Sentry** | Error tracking (free tier) | Free | 5k events/month |
| **Uptime Monitoring** | Better Uptime (free) | Free | 3 monitors |
| **Load Balancer** | Nginx on same host | Free | Software LB |
| **SSL** | Let's Encrypt | Free | Auto-renewing |
| **Backup Storage** | Off-site backup | ~$5-10 | Backblaze B2 |
| **Total Estimated** | | **~$50-120/mo** | |

### Current Waste
- **No resource limits** in Docker Compose — containers can overcommit host resources
- **No CDN** — all traffic hits the origin server
- **No image optimization** pipeline — full-resolution uploads served directly
- **Single VM** — no separation of concerns, but cost-efficient for early stage

---

## DISASTER RECOVERY PLAN

### Current Status: ❌ Not Implemented. Below is the recommended plan.

### Objective
- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 15 minutes (requires binlog)
- With current backup script: RPO = 24 hours (daily backup)

### Backup Strategy

| Data | Method | Frequency | Retention | Off-site |
|------|--------|-----------|-----------|----------|
| MySQL | `mysqldump --single-transaction` | Daily (cron) | 30 days | ✅ S3/R2 |
| MySQL binlogs | Binary log streaming | Continuous | 7 days | ✅ S3/R2 |
| Uploads | rsync / rclone | Hourly | 30 days | ✅ S3/R2 |
| Docker volumes | Volume backup | Daily | 7 days | Optional |
| Config (.env) | Encrypted in vault | Per change | Forever | ✅ Git (encrypted) |

### Recovery Procedures

1. **Full Restore:**
   ```bash
   # Create new Docker host
   # Install Docker + Docker Compose
   # Clone repo, configure .env
   # Restore MySQL: gunzip < backup.sql.gz | mysql -u root -p courtzon_v2
   # docker compose up -d
   ```

2. **Database Only:**
   ```bash
   mysql -u root -p courtzon_v2 < latest_backup.sql
   node backend/scripts/migrate.js
   ```

3. **Point-in-Time Recovery:**
   ```bash
   # Restore full backup, then apply binlogs up to target time
   mysqlbinlog --stop-datetime="2026-06-05 14:30:00" binlog.* | mysql
   ```

---

## MONITORING PLAN

### Phase 1 — Immediate (Week 1)

| Item | Tool | Action |
|------|------|--------|
| Uptime monitoring | Better Uptime / Pingdom | Set up 3 checks (frontend, API, health) |
| Error tracking | Sentry | Add `@sentry/node` + `@sentry/react` |
| Prometheus alerting | Alertmanager | Add basic rules: disk > 80%, memory > 90%, service down |

### Phase 2 — Short-term (Month 1)

| Item | Tool | Action |
|------|------|--------|
| Grafana dashboards | Grafana | Provision dashboards for Node Exporter + backend metrics |
| Business metrics | Custom exporter | Add booking counts, revenue, active users to `/metrics` |
| Container monitoring | cAdvisor | Add to monitoring compose, scrape by Prometheus |
| Log aggregation | Loki + Promtail | Add Loki to monitoring stack, send pino logs |

### Phase 3 — Medium-term (Quarter 1)

| Item | Tool | Action |
|------|------|--------|
| APM / Tracing | OpenTelemetry + Jaeger | Instrument critical paths (booking, payment) |
| Synthetic monitoring | Playwright + CI | Run E2E smoke tests every 5 min from cron |
| Database monitoring | MySQL Exporter | Add mysqld_exporter to monitoring stack |
| Queue monitoring | Bull Board | Add `@bull-board` UI for BullMQ queues |

---

## CI/CD ROADMAP

### Phase 1 — Immediate

| Step | Action |
|------|--------|
| 1 | Add deploy job to `ci.yml`: build → push to Docker registry (GitHub Container Registry) |
| 2 | Add staging deploy: SSH + `docker compose pull && up -d` |
| 3 | Remove `|| true` from truffleHog scan (fail on real secrets) |
| 4 | Add Dependabot configuration for weekly dependency updates |

### Phase 2 — Short-term

| Step | Action |
|------|--------|
| 5 | Add Docker layer caching to CI builds |
| 6 | Add PR preview deploys (temporary Docker host per PR) |
| 7 | Add load test step (k6) to CI pipeline |
| 8 | Add component test runner (Storybook + test runner or similar) |

### Phase 3 — Medium-term

| Step | Action |
|------|--------|
| 9 | Implement blue/green deploy strategy |
| 10 | Add canary releases with gradual traffic shift |
| 11 | Automate SSL certificate provisioning (Let's Encrypt + certbot) |
| 12 | Implement IaC (Terraform for cloud resources) |

---

## INFRASTRUCTURE ROADMAP

### Phase 1 — Production Hardening

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Add non-root USER to Dockerfiles | 1 hour | Container security |
| 2 | Create `nginx.prod.conf` with TLS + HSTS | 2 hours | SSL/TLS |
| 3 | Set up Let's Encrypt for auto SSL | 1 hour | SSL/TLS |
| 4 | Add `deploy.resources` limits to compose | 30 min | Cost control |
| 5 | Remove `RELAX_RATE_LIMIT` from production compose | 5 min | Security |
| 6 | Add Sentry (backend + frontend) | 2 hours | Error tracking |
| 7 | Schedule backup script via cron/systemd timer | 1 hour | DR |
| 8 | Separate queues by job type (email, backup, settlement) | 1 day | Scalability |

### Phase 2 — HA & Scaling

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 9 | Add MySQL read replica | 1 day | HA + reporting |
| 10 | Configure PM2 cluster mode for backend | 4 hours | Horizontal scaling |
| 11 | Add Redis Sentinel for HA | 1 day | Redis reliability |
| 12 | Configure S3-compatible storage for uploads | 2 days | Scale + DR |
| 13 | Add Bull Board for queue monitoring | 4 hours | Observability |
| 14 | Set up Loki + Promtail for log aggregation | 1 day | Observability |

### Phase 3 — Scale & Polish

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 15 | Implement Kubernetes deployment manifests | 1 week | Orchestration |
| 16 | Add CDN (Cloudflare) for static assets | 1 day | Performance |
| 17 | Database sharding strategy for multi-tenant scale | 2 weeks | Scale |
| 18 | Implement full OpenTelemetry instrumentation | 2 weeks | Observability |
| 19 | Add load testing suite with baseline results | 1 week | Performance |
| 20 | Auto-scaling based on CPU/memory/queue depth | 1 week | Cost + Scale |

---

## APPENDIX: KEY FILE SIZES

| File | Lines | Type |
|------|-------|------|
| `docker-compose.yml` | 102 | Compose |
| `docker-compose.dev.yml` | 97 | Compose |
| `docker-compose.monitoring.yml` | 56 | Compose |
| `backend/Dockerfile` | 33 | Dockerfile |
| `backend/Dockerfile.dev` | 20 | Dockerfile |
| `frontend/Dockerfile` | 23 | Dockerfile |
| `frontend/nginx.conf` | 80 | Nginx config |
| `backend/docker-entrypoint.sh` | 26 | Shell script |
| `backend/scripts/migrate.js` | 311 | Migration runner |
| `backend/scripts/backup.js` | 41 | Backup script |
| `.github/workflows/ci.yml` | 100 | GitHub Actions |
| `.github/workflows/security-scan.yml` | 83 | GitHub Actions |
| `docs/09-deployment.md` | 100 | Deployment docs |
| `docs/production-hardening.md` | 141 | Hardening docs |
| `.env` | 12 | Environment |
| `.env.example` | 60 | Environment template |
