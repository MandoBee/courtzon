# Production Launch Gate

## Purpose

The Launch Gate is CourtZon's formal Go/No-Go decision framework. Every release is evaluated against the same objective criteria. Launching is a controlled engineering decision, not a subjective judgement.

**A single `NO-GO` on any BLOCKER item automatically prevents launch.**

## Release Summary

```
Version:              x.y.z
Git Commit:           abcdef1
Docker Images:        courtzon-backend:abcdef1, courtzon-frontend:abcdef1
Expected Migration:   016
Health Status:        ✅ All endpoints ok
Test Count:           651 / 651 passed
Architecture Validators: 0 errors, N warnings
Production Readiness: ✅ All Critical/High findings resolved
Launch Decision:      [GO / NO-GO]
```

---

## A. BLOCKERS (Must be PASS)

**If any BLOCKER fails, the release is automatically NO-GO. Exit with non-zero status.**

### Infrastructure

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| B-01 | Backend TypeScript compiles | □ | `cd backend && npx tsc --noEmit` |
| B-02 | Frontend TypeScript compiles | □ | `cd frontend && npx tsc --noEmit` |
| B-03 | Backend Docker image builds | □ | `docker compose build backend` |
| B-04 | Frontend Docker image builds | □ | `docker compose build frontend` |
| B-05 | Backend container becomes healthy | □ | `GET /health` returns `{"status":"ok"}` within start period |
| B-06 | Frontend container serves content | □ | `GET /` returns 200 |
| B-07 | Database migrations applied successfully | □ | `node backend/scripts/migrate.js --status` shows no pending migrations |
| B-08 | Redis connectivity verified | □ | Backend health check shows `redis.status: "ok"` |

### Quality

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| B-09 | All unit tests pass | □ | `cd backend && npm test` — 651 tests, 0 failures |
| B-10 | Architecture validators pass (0 errors) | □ | `node scripts/architecture/validate-all.js` — 0 errors, warnings OK |
| B-11 | CI validation passes | □ | `node scripts/ci-validate.js` — 0 errors |

### Production Readiness

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| B-12 | No Critical production readiness findings remain | □ | Per `docs/operations/production-readiness.md` |
| B-13 | Off-site backup configured and verified | □ | Backup replicates to S3-compatible storage |
| B-14 | Backup restoration procedure verified | □ | Documented in `scripts/restore.sh` |
| B-15 | Payment flow verified with real or mock gateway | □ | Create booking → Paymob intent → webhook → confirm |
| B-16 | Booking flow verified end-to-end | □ | Browse → select → prepare → pay → confirm → notification |
| B-17 | Notification delivery verified | □ | In-app notification received after booking confirmation |
| B-18 | Authentication flow verified | □ | Register → login → session → logout → refresh |

### Security

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| B-19 | No hardcoded secrets in source code | □ | Grep for passwords, API keys, tokens |
| B-20 | HTTPS enforced (production) | □ | Cloudflare or nginx redirects HTTP → HTTPS |
| B-21 | API rate limiting enabled | □ | Fastify rate-limit plugin configured |

---

## B. REQUIRED (Must be PASS before launch)

**All REQUIRED items must pass before a GO decision. A failure here blocks the release until resolved.**

### Observability

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| R-01 | `/health/live` returns 200 | □ | Liveness endpoint |
| R-02 | `/health/ready` returns 200 | □ | Readiness endpoint (DB + Redis) |
| R-03 | `/health` returns composite status | □ | Full health check |
| R-04 | `/metrics` endpoint accessible | □ | Prometheus metrics on `/metrics` |
| R-05 | Structured JSON logging enabled | □ | Pino configured, output is JSON |
| R-06 | Request correlation IDs present in logs | □ | `reqId` field on every request log |
| R-07 | Global error handler logs errors | □ | `app.ts:508` — `app.log.error(error)` |
| R-08 | `process.on('unhandledRejection')` handler registered | □ | Added to `server.ts` |
| R-09 | `process.on('uncaughtException')` handler registered | □ | Added to `server.ts` |
| R-10 | Error response format is consistent | □ | `{ error, message, details? }` pattern |

### Monitoring

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| R-11 | Prometheus deployed and scraping `/metrics` | □ | `docker compose --profile monitoring up -d prometheus` |
| R-12 | Prometheus alert rules loaded | □ | `monitoring/alerts.yml` applied |
| R-13 | Alert notifications configured (email/Slack/PagerDuty) | □ | At minimum, `BackendDown` alerts reach the on-call team |

### Security

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| R-14 | Content Security Policy header set | □ | Configured in nginx |
| R-15 | Security headers present (X-Frame-Options, X-Content-Type-Options, etc.) | □ | `security-headers.conf` applied |
| R-16 | CORS configured for production origins | □ | Only `https://courtzon.cloud` and known domains |
| R-17 | Secrets managed via environment (not hardcoded) | □ | All secrets in `.env` or Coolify-managed |
| R-18 | Payment gateway credentials valid | □ | Paymob API key, HMAC secret verified |
| R-19 | Session token signed with production secret | □ | `JWT_SECRET` and `SESSION_SECRET` set |
| R-20 | Rate limiting configured for auth endpoints | □ | Brute-force protection active |

### Data

| # | Check | Pass/Fail | Notes |
|---|-------|-----------|-------|
| R-21 | Database migrated to expected schema | □ | Runs `migrate.js` on startup, verifies expected migration |
| R-22 | Seed data loaded (reference data) | □ | Countries, permissions, roles, amenities present |
| R-23 | Read replicas configured (if applicable) | □ | N/A for single-instance |

---

## C. RECOMMENDED (Can be completed after launch)

**These items should be completed but do not block the launch decision.**

| # | Check | Priority | Notes |
|---|-------|----------|-------|
| C-01 | Zero-downtime deployment configured | High | `restart: rolling-update` in Coolify |
| C-02 | Automated rollback procedure tested | High | `git revert` + push documented |
| C-03 | Grafana dashboards created | High | At minimum: HTTP requests, error rate, queue depth, DB connections |
| C-04 | Slow request logging threshold configured | Medium | Warn at 5s, 10s, 30s |
| C-05 | Circuit breaker for payment gateway | Medium | Protect against Paymob API failures |
| C-06 | Backup encryption enabled | Medium | GPG-encrypted backup files |
| C-07 | Dead letter queue monitoring dashboard | Medium | BullMQ dashboard or Prometheus metric |
| C-08 | Database slow query logging enabled | Medium | MySQL `long_query_time = 1` |
| C-09 | Notification delivery success/failure metrics | Medium | Per-channel delivery counters |
| C-10 | Queue depth metrics exposed | Low | Prometheus gauge per queue |
| C-11 | Active user tracking metrics | Low | Daily active user counter |
| C-12 | Uptime monitoring configured | Low | External uptime check (Better Uptime) |
| C-13 | Log aggregation configured (Loki/Papertrail) | Low | Centralised log search |
| C-14 | Architecture health score tracked per release | Low | `npm run metrics` in CI, store JSON report |

---

## D. FUTURE IMPROVEMENTS

**Lower-priority enhancements that should not block production at this stage.**

| # | Item | Notes |
|---|------|-------|
| F-01 | Point-in-time recovery (binlog) | Reduces RPO from 24h to < 1h |
| F-02 | Multi-region failover | Secondary hosting region for DR |
| F-03 | Load balancer + horizontal scaling | Multiple backend instances behind nginx |
| F-04 | Canary deployments | Gradual traffic shifting to new version |
| F-05 | Synthetic transaction monitoring | Automated booking flow test from external location |
| F-06 | Chaos engineering experiments | Deliberate failure injection to test resilience |
| F-07 | Auto-scaling rules | Scale backend based on CPU/request rate |
| F-08 | Content Delivery Network for API | Cloudflare Workers or similar for API caching |
| F-09 | API versioning strategy | URL or header-based API versioning |
| F-10 | Rate limiting per user/per plan | Tiered rate limits based on subscription |
| F-11 | Audit log retention policy | Define how long audit logs are kept |
| F-12 | SOC2 / ISO 27001 readiness | Required for enterprise customers in future |

---

## Final Decision

### Pre-flight checks

```bash
# 1. TypeScript compilation
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# 2. Tests
cd backend && npm test

# 3. Architecture validation
cd . && node scripts/architecture/validate-all.js

# 4. CI validation
cd . && node scripts/ci-validate.js

# 5. Docker build
docker compose build backend frontend
```

### Decision Record

```
Release:              v{version}
Commit:               {git sha}
Date:                 {date}
Prepared by:          {name}

BLOCKERS passed:      {N} / {N}  → {PASS / FAIL}
REQUIRED passed:      {N} / {N}  → {PASS / FAIL}
RECOMMENDED:          {N} completed, {N} deferred

Architecture Health:  {score}/100
Test Count:           {passed} / {total}

LAUNCH DECISION:      GO / NO-GO

Sign-off:
  Engineering Lead:   __________________
  Product Owner:      __________________
  QA Lead:            __________________

Notes:
  {any relevant context, risks accepted, or deferrals}
```

---

## CI Integration

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [master]

jobs:
  launch-gate:
    runs-on: ubuntu-latest
    outputs:
      decision: ${{ steps.gate.outputs.decision }}
    steps:
      - uses: actions/checkout@v4

      - name: TypeScript Check
        run: |
          cd backend && npx tsc --noEmit
          cd frontend && npx tsc --noEmit

      - name: Tests
        run: cd backend && npm test

      - name: Architecture Validation
        run: node scripts/architecture/validate-all.js

      - name: CI Validation
        run: node scripts/ci-validate.js

      - name: Docker Build
        run: docker compose build backend frontend

      - name: Launch Gate Decision
        id: gate
        run: |
          echo "✅ All BLOCKERS passed"
          echo "decision=GO" >> $GITHUB_OUTPUT

      - name: Architecture Health
        run: node scripts/architecture/metrics.js

  deploy:
    needs: [launch-gate]
    if: needs.launch-gate.outputs.decision == 'GO'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        run: echo "Deploying..."
```

---

## Relationship to other documents

| Document | Purpose |
|----------|---------|
| `production-readiness.md` | Full operational audit with all findings |
| `enforcement.md` | Automated architecture rules and CI integration |
| `ADR-INDEX.md` | All architectural decisions governing the platform |
| `deployment-checklist.md` | Step-by-step deployment instructions |
| `health.md` | Architecture health score and trend monitoring |
