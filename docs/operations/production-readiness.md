# Production Readiness & Operational Excellence

## Overview

This document is the single source of truth for CourtZon's operational readiness. It covers health checking, observability, metrics, monitoring, error handling, security, performance, background jobs, backups, disaster recovery, deployment, and operational procedures.

**Last audit:** 2026-07-26
**Status:** Pre-production — findings are being addressed before public launch.

---

## 1. Health Checks

### Current State

| Endpoint | Type | Status | Details |
|----------|------|--------|---------|
| `GET /health/live` | Liveness | ✅ | Returns `ok` if process is alive |
| `GET /health/ready` | Readiness | ✅ | Checks DB + Redis connectivity |
| `GET /health` | Composite | ✅ | DB, Redis, memory usage |
| `GET /health/version` | Build info | ✅ | Git commit, build time, Node version |
| `GET /health/database` | Component | ✅ | DB connection + table count |
| `GET /health/redis` | Component | ✅ | Redis PING |
| `GET /health/storage` | Component | ⚠ Limited | Checks upload directory, not cloud storage |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| HC-1 | No queue health check | Medium | Add `/health/queues` — report BullMQ queue status (waiting, active, failed, delayed counts) |
| HC-2 | No external dependency health | Low | Add `/health/gateway` for Paymob connectivity check |
| HC-3 | No disk/memory thresholds | Low | Add percentage thresholds to composite health for early warning |

### Recommended Health Check Architecture

```
GET /health/live        — process alive (always 200)
GET /health/ready       — dependencies ready (DB, Redis, Queues)
GET /health             — composite of all component checks
GET /health/database    — DB connection + replication lag
GET /health/redis       — Redis PING + memory usage
GET /health/queues      — queue depth, stalled jobs, dead-letter count
GET /health/storage     — disk space, upload directory writable
GET /health/version     — build metadata
```

---

## 2. Observability

### Structured Logging

| Aspect | Status | Details |
|--------|--------|---------|
| Logger framework | ✅ | Pino (structured JSON logging) |
| Log levels | ✅ | trace, debug, info, warn, error, fatal |
| Module-scoped loggers | ✅ | `createModuleLogger('booking')` pattern across all modules |
| Correlation IDs | ✅ | `reqId` attached to every request via Fastify |
| Trace IDs | ⚠ Partial | `traceId` used in payment flows but not universally |
| Request logging | ✅ | Fastify request/response logging with duration |
| Error logging | ✅ | Global error handler at `app.ts:508` logs via `app.log.error(error)` |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| OBS-1 | No request/response payload logging | Low | Add debug-level request body logging for troubleshooting (never log sensitive fields) |
| OBS-2 | Trace ID not propagated to all background jobs | Medium | Ensure every BullMQ job gets a `traceId` from the originating request |
| OBS-3 | No slow-request threshold | Medium | Add a warning log when request duration exceeds 5 seconds, 10 seconds, 30 seconds |
| OBS-4 | Unhandled promise rejections not logged | High | Add `process.on('unhandledRejection')` handler in `server.ts` |

---

## 3. Metrics

### Current Metrics (Prometheus)

| Metric | Type | Exists? | Labels |
|--------|------|---------|--------|
| `courtzon_http_request_duration_seconds` | Histogram | ✅ | method, path, status |
| `courtzon_http_requests_total` | Counter | ✅ | method, path, status |
| `courtzon_command_duration_seconds` | Histogram | ✅ | command_type, result |
| `courtzon_command_total` | Counter | ✅ | command_type, result |
| `courtzon_eventbus_emit_total` | Counter | ✅ | event_name |
| `courtzon_eventbus_enqueue_total` | Counter | ✅ | queue |
| `courtzon_eventbus_enqueue_failed_total` | Counter | ✅ | queue |
| `courtzon_socket_events_published_total` | Counter | ✅ | event_type |
| `courtzon_socket_events_dropped_total` | Counter | ✅ | event_name |
| Default Node.js metrics | Various | ✅ | CPU, memory, event loop, GC, handles |

### Missing Metrics

| # | Metric | Severity | Recommendation |
|---|--------|----------|----------------|
| MET-1 | Queue depth per queue | Medium | BullMQ `.getJobCounts()` → Prometheus gauge |
| MET-2 | Active socket connections | Medium | Socket.IO `.engine.clientsCount` → gauge |
| MET-3 | Booking creation rate | Medium | Counter for booking.created events |
| MET-4 | Payment success/failure rate | High | Counters by gateway provider + payment status |
| MET-5 | Notification delivery rate | Medium | Counters by channel (in_app, push, email) |
| MET-6 | Cache hit/miss ratio | Low | Redis cache hit/miss counters |
| MET-7 | Active user count (daily) | Medium | Redis set of distinct userIds per day |
| MET-8 | Authentication success/failure | Medium | Login success/failure counters |

### Endpoint

```
GET /metrics — protected by METRICS_TOKEN environment variable
```

---

## 4. Monitoring

### Current Monitoring Stack

| Component | Status | Details |
|-----------|--------|---------|
| Prometheus metrics endpoint | ✅ | `/metrics` on the backend |
| Grafana dashboards | ❌ Not deployed | No dashboards configured |
| AlertManager rules | ⚠ Partial | Alert rules defined in `monitoring/alerts.yml` but not deployed |

### Alert Rules (Defined)

| Alert | Condition | Severity |
|-------|-----------|----------|
| BackendDown | `up{job="backend"} == 0` for 1m | critical |
| HighErrorRate | `rate(courtzon_http_requests_total{status=~"5.."}[5m]) > 0.05` | warning |
| HighLatency | `histogram_quantile(0.95, rate(courtzon_http_request_duration_seconds_bucket[5m])) > 2` | warning |
| QueueDepthHigh | Queue depth > 1000 | warning |
| NotificationDeliveryFailure | Notification delivery failure rate > 10% | warning |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| MON-1 | Prometheus/Grafana not deployed | High | Deploy Prometheus + Grafana via Docker profile: `docker compose --profile monitoring up -d prometheus grafana` |
| MON-2 | No alert routing | Medium | Configure AlertManager to route alerts to email/Slack/PagerDuty |
| MON-3 | No log aggregation | Medium | Deploy Loki or integrate with existing log aggregation (e.g., Papertrail, Datadog) |
| MON-4 | No uptime monitoring | Medium | Configure external uptime check (e.g., Better Uptime, Pingdom) for `https://courtzon.cloud/health/live` |

---

## 5. Error Handling

### Current State

| Pattern | Status | Details |
|---------|--------|---------|
| Global exception handler | ✅ | `app.ts:508` — catches all unhandled errors |
| AppError class hierarchy | ✅ | `AppError` → `NotFoundError`, `ConflictError`, `ForbiddenError`, `ValidationError` |
| Zod validation errors | ✅ | Intercepted and formatted as `VALIDATION_ERROR` |
| Fastify schema validation | ✅ | Request body/query/params validation |
| Retry policies (commands) | ✅ | Command pipeline idempotency via `processed_commands` table |
| Retry policies (queues) | ✅ | BullMQ jobs have configurable attempts + backoff |
| Rate limiting | ✅ | Fastify rate-limit plugin + custom notification rate-limiter |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| ERR-1 | No global `unhandledRejection` handler | High | Add `process.on('unhandledRejection', ...)` to `server.ts` — currently unhandled rejections crash the process |
| ERR-2 | No global `uncaughtException` handler | High | Add `process.on('uncaughtException', ...)` with graceful shutdown |
| ERR-3 | No circuit breaker for payment gateway | Medium | Payment gateway calls (Paymob) have no circuit breaker; repeated failures could cascade |
| ERR-4 | No fallback for Redis failure | Medium | Redis being unavailable should degrade gracefully (e.g., session fallback, cache bypass) |
| ERR-5 | Dead letter queue not monitored | Medium | `notification_dead_letter_queue` table is populated but no alert exists when items are added |

---

## 6. Security

### Current State

| Control | Status | Details |
|---------|--------|---------|
| Security headers | ✅ | Configured in `nginx.conf` via `security-headers.conf` |
| Content Security Policy | ✅ | CSP configured in `frontend/nginx.conf` |
| Rate limiting (API) | ✅ | Fastify rate-limit plugin |
| Rate limiting (auth) | ✅ | Brute-force protection in `brute-force.service.ts` |
| JWT/session validation | ✅ | Session tokens via Fastify cookie + Redis |
| Secrets management | ✅ | Environment variables via `.env` file (Docker), Coolify-managed secrets |
| CORS configuration | ✅ | Fastify CORS plugin with allowed origins |
| Sensitive log filtering | ✅ | Pino configured to redact sensitive fields |
| HTTPS | ✅ | Terminated at Cloudflare (production) |
| SQL injection protection | ✅ | Parameterized queries throughout |
| Upload validation | ✅ | File type + size validation in `upload.service.ts` |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| SEC-1 | No strict transport security (HSTS) | Medium | Add `Strict-Transport-Security` header via Cloudflare or nginx |
| SEC-2 | No audit logging for admin actions | Medium | `recordAudit()` exists but not universally applied; admin user management, role changes, permission changes should all be audited |
| SEC-3 | No API key rotation policy | Low | Document API key rotation schedule for Paymob credentials |
| SEC-4 | Session token expiry not configurable | Low | Make session TTL configurable via environment variable |
| SEC-5 | No Content-Security-Policy-Report-Only | Low | Add `Content-Security-Policy-Report-Only` header for monitoring CSP violations before enforcing |

---

## 7. Performance

### Current State

| Aspect | Status | Details |
|--------|--------|---------|
| Database indexes | ✅ | Primary keys + foreign keys indexed; booking queries use `user_id`, `booking_date`, `booking_status` |
| N+1 query detection | ⚠ Untested | No automated N+1 detection in CI |
| Redis caching | ✅ | Session storage, rate limiting, booking locks, presence tracking |
| Cache strategy | ✅ | TTL-based with distinct cache prefixes per use case |
| Compression | ✅ | Gzip enabled in nginx for text assets |
| Static asset caching | ✅ | Assets with hash in filename get `Cache-Control: public, immutable, max-age=31536000` |
| CDN | ✅ | Cloudflare provides CDN + caching for static assets |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| PERF-1 | No database query performance monitoring | Medium | Enable slow query logging in MySQL (`long_query_time = 1`) |
| PERF-2 | No connection pool monitoring | Low | Add metrics for MySQL connection pool utilization |
| PERF-3 | Booking slot queries not indexed for cross-branch | Medium | Review `booking_slots` table indexes for queries filtering by date + resource across branches |
| PERF-4 | No pagination on notification API | Medium | Notifications API should enforce max page size to prevent unbounded queries |
| PERF-5 | No response compression for API | Low | Enable gzip/brotli compression in Fastify for API responses (already at nginx level for frontend) |

---

## 8. Background Jobs

### Current Jobs

| Job | Schedule | Retries | Dead Letter | Status |
|-----|----------|---------|-------------|--------|
| `cancel_expired_bookings` | Every 1 min | 3 | ❌ | ✅ |
| `expire_stale_payments` | Every 1 min | 3 | ❌ | ✅ |
| `sync_pending_payments` | Every 2 min | 3 | ❌ | ✅ |
| `auto_complete_bookings` | Every 2 min | 3 | ❌ | ✅ |
| `cancel_abandoned_orders` | Every 2 min | 3 | ❌ | ✅ |
| `expire_subscriptions` | Daily | 3 | ❌ | ✅ |
| `send_subscription_reminders` | Daily | 3 | ❌ | ✅ |
| `trigger_digest_processing` | Every 1 min | 3 | ❌ | ✅ |
| `hourly_digest` | Hourly | 3 | ❌ | ✅ |
| `daily_digest` | Daily | 3 | ❌ | ✅ |
| `weekly_digest` | Weekly | 3 | ❌ | ✅ |
| `database_backup` | Daily | 3 | ❌ | ✅ |
| `run_cleanup` | Weekly | 3 | ❌ | ✅ |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| JOB-1 | No queue monitoring dashboard | Medium | Deploy BullMQ dashboard or add Prometheus metrics for queue depth |
| JOB-2 | No stuck job detection | Medium | Add a health check that alerts if queue jobs have been `active` for > 5 minutes |
| JOB-3 | No alert on dead letter queue | Medium | Email/notification when items enter `notification_dead_letter_queue` |
| JOB-4 | Recurring job registration not validated | Low | Validate on startup that all expected cron jobs are registered |
| JOB-5 | No job execution time metrics | Low | Add Prometheus histogram for job execution duration per type |

---

## 9. Backups

### Current State

| Aspect | Status | Details |
|--------|--------|---------|
| Database backup script | ✅ | `scripts/backup.sh` / `node backend/scripts/backup.js` |
| Restore script | ✅ | `scripts/restore.sh` / `node backend/scripts/restore.js <file>` |
| Backup schedule | ✅ | Daily via `database_backup` cron job |
| Backup storage | ⚠ Not verified | Backups stored locally; off-site backup not configured |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| BAK-1 | No off-site backup storage | Critical | Configure backups to replicate to S3-compatible storage (Wasabi, Backblaze B2, or AWS S3) |
| BAK-2 | No backup restoration test schedule | High | Document quarterly restore test procedure |
| BAK-3 | No retention policy documented | Medium | Define backup retention: daily for 7 days, weekly for 4 weeks, monthly for 12 months |
| BAK-4 | No encrypted backups | Medium | Encrypt backup files with GPG before off-site transfer |
| BAK-5 | No backup monitoring | Medium | Add alert when backup job fails or does not complete |

### Recommended Backup Strategy

```bash
# Daily backup (on-server)
node scripts/backup.js              # Creates SQL dump
# Off-site replication (cron)
aws s3 cp backups/ s3://courtzon-backups/ --recursive --storage-class STANDARD_IA
# Retention (S3 lifecycle policy)
# 7 days → Standard, 30 days → Glacier, 365 days → Deep Archive
```

---

## 10. Disaster Recovery

### Recovery Procedures

| Scenario | Procedure | RTO | RPO |
|----------|-----------|-----|-----|
| Backend process crash | Docker auto-restart via `restart: unless-stopped` | 30s | 0 |
| Full server failure | Restore from latest backup on new host | 2 hours | 24 hours |
| Database corruption | Restore from latest backup + replay migration chain | 1 hour | 24 hours |
| Redis data loss | Sessions invalidated (users re-login), cache rebuilds automatically | 5 min | 0 |
| Frontend failure | Cloudflare serves cached version; nginx static image available | 1 min | 0 |
| Cloudflare outage | Update DNS to point directly to origin server | 15 min | 0 |
| Paymob API failure | Payments fail gracefully with retry; booking flow blocked | N/A | N/A |

### Service Restart Order

```
1. Redis (no dependencies)
2. MySQL (depends on persistent volume)
3. Backend (depends on Redis + MySQL)
4. Frontend (depends on backend via API)
```

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| DR-1 | No documented disaster recovery drill | High | Schedule quarterly DR drill; document results |
| DR-2 | RPO of 24 hours too high for production | High | Implement point-in-time recovery (binlog) to reduce RPO to < 1 hour |
| DR-3 | No secondary region/host | Medium | Document procedure for provisioning a new Coolify host if primary fails |
| DR-4 | No load balancer for multi-instance | Low | Not needed until scaling beyond single instance |

---

## 11. Deployment

### Current Process

| Step | Status | Details |
|------|--------|---------|
| Git push to master | ✅ | Auto-deploys via Coolify |
| Docker build | ✅ | Multi-stage Dockerfiles for backend + frontend |
| Database migrations | ✅ | Applied on startup via `docker-entrypoint.sh` |
| Environment validation | ✅ | Health check waits for DB + Redis |
| Zero-downtime deployment | ❌ | Docker container stop + start causes brief downtime |
| Rollback procedure | ⚠ Partial | `git revert` + push; no automated rollback |

### Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| DEP-1 | No zero-downtime deployment | High | Configure Coolify for rolling updates (health check gating, graceful shutdown) |
| DEP-2 | No automated rollback | High | Document rollback procedure: revert git commit, push, rebuild |
| DEP-3 | No canary/smoke test after deploy | Medium | Add automated smoke test that runs after deployment |
| DEP-4 | Docker image tags not versioned | Medium | Tag Docker images with git commit SHA in addition to `latest` |

---

## 12. Operational Documentation

### Existing Documentation

| Document | Status | Path |
|----------|--------|------|
| Deployment guide | ✅ | `DEPLOYMENT.md` |
| Production checklist | ✅ | `PRODUCTION_CHECKLIST.md` |
| Payment runbook | ✅ | `docs/operations/payment-runbook.md` |
| Coolify SSH fix | ✅ | `docs/operations/coolify-ssh-multiplexing-race-condition.md` |
| Architecture enforcement | ✅ | `docs/architecture/enforcement.md` |
| Architecture health | ✅ | `docs/architecture/health.md` |
| 11 Architecture Decision Records | ✅ | `docs/architecture/adr/` |
| Backup/restore scripts | ✅ | `scripts/backup.sh`, `scripts/restore.sh` |

### Missing Documentation

| # | Document | Severity | Recommendation |
|---|----------|----------|----------------|
| OPS-1 | Incident response playbook | High | Create `docs/operations/incident-response.md` with severity levels, escalation paths, communication templates |
| OPS-2 | Service restart guide | Medium | Create `docs/operations/restart-guide.md` with docker compose commands per service |
| OPS-3 | Emergency maintenance procedure | Medium | Create `docs/operations/emergency-maintenance.md` for planned downtime |
| OPS-4 | Monitoring/alerts setup guide | Medium | Create `docs/operations/monitoring-setup.md` for Prometheus/Grafana deployment |

---

## Summary

### Risk Matrix

| Severity | Count | Areas |
|----------|-------|-------|
| **Critical** | 1 | Off-site backup |
| **High** | 8 | Unhandled rejection handler, Prometheus/Grafana not deployed, circuit breakers, DR drill, RPO, zero-downtime, rollback, backup restore test |
| **Medium** | 16 | Queue health, trace propagation, slow-request logging, missing metrics, alert routing, log aggregation, uptime monitoring, dead letter monitoring, HSTS, N+1 queries, pagination, backup encryption, backup monitoring, retention policy, queue dashboard, incident response doc |
| **Low** | 6 | External dependency health, payload logging, response compression, session TTL config, CSP-report-only, multi-instance balancing |

### Health Score Impact

Current architecture health score: **89/100**

After addressing all Critical and High findings, the score would improve by approximately:
- -5 per violation → currently 0 violations
- -1 per TODO → 7 TODOs → if resolved, +7
- -1 per FIXME → 0 → no impact
- -2 per deprecated → 2 deprecated → if resolved, +4

**Potential score after remediation: 100/100**

### Priority Remediation Plan

#### Phase 1 — Immediate (before launch)

| # | Finding | Effort | Owner |
|---|---------|--------|-------|
| ERR-1 | Add `unhandledRejection` handler | 30 min | Backend |
| ERR-2 | Add `uncaughtException` handler | 30 min | Backend |
| OBS-4 | Add unhandled promise rejection logging | 15 min | Backend |
| BAK-1 | Configure S3 off-site backup | 2 hours | DevOps |

#### Phase 2 — First month

| # | Finding | Effort |
|---|---------|--------|
| MON-1 | Deploy Prometheus + Grafana | 4 hours |
| DEP-1 | Configure zero-downtime deployment | 4 hours |
| JOB-3 | Dead letter queue alerting | 2 hours |
| SEC-1 | Add HSTS header | 30 min |
| MET-4 | Add payment success/failure metrics | 2 hours |
| OPS-1 | Create incident response playbook | 4 hours |

#### Phase 3 — Second month

| # | Finding | Effort |
|---|---------|--------|
| DEP-2 | Automated rollback procedure | 4 hours |
| DR-2 | Point-in-time recovery | 8 hours |
| BAK-4 | Backup encryption | 2 hours |
| PERF-1 | Slow query logging | 1 hour |
| MET-1,2,3,7 | Additional metrics | 4 hours |

#### Phase 4 — Ongoing

- Quarterly DR drill
- Monthly backup restore test
- Weekly architecture health review
- Continuous monitoring of health score trends

---

## Acceptance Checklist

A deployment is **Production Ready** only when:

- [ ] No Critical findings remain (off-site backup configured)
- [ ] All health endpoints return `ok`
- [ ] `node scripts/architecture/validate-all.js` passes with 0 errors
- [ ] `npm test` passes (651 tests)
- [ ] Docker builds for backend + frontend
- [ ] Prometheus + Grafana deployed and receiving metrics
- [ ] Alert rules configured with working notifications
- [ ] Backup automation verified (on-site + off-site)
- [ ] Restore procedure documented and tested
- [ ] Incident response playbook created
- [ ] Rolling deployment configured (zero-downtime)
- [ ] Rollback procedure documented and tested
- [ ] All Critical and High findings resolved
