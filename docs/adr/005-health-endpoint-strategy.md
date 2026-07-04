# ADR 005: Health Endpoint Strategy

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

Production deployments require health checks for load balancers, orchestrators (Docker/Kubernetes), monitoring systems, and CI/CD pipelines. Different consumers need different levels of detail.

## Decision

We maintain a tiered health endpoint strategy:

**Tier 1 — Liveness (`GET /health/live`):** Fastest possible check. Returns `{ status: "ok", uptime }` within 5ms. Used by Docker HEALTHCHECK and load balancers. No dependency checks — if the process is running, it passes.

**Tier 2 — Readiness (`GET /health/ready`):** Full dependency check (database SELECT 1, Redis PING, memory, storage). Returns latency per check. Used by deployment pipelines to determine when a new instance is ready to serve traffic.

**Tier 3 — Component Health (`GET /health/database`, `/health/redis`, `/health/storage`):** Individual dependency checks. Used for debugging and monitoring dashboards.

**Tier 4 — Version Info (`GET /health/version`):** Deployment metadata (git commit, app version, build time, expected migration). Falls back to environment variables when Docker artifacts are unavailable.

**Tier 5 — Service Health (`GET /payments/health`):** Domain-specific health for the payment subsystem. Includes gateway configuration status, migration sync status, pending/stale/failed counts, and last webhook timestamp. Requires admin authentication.

**Metrics (`GET /metrics`):** Prometheus-compatible endpoint for time-series monitoring. Tracks HTTP request duration and count by method/route/status.

## Alternatives Considered

- **Single monolithic health endpoint (rejected).** Different consumers need different levels of detail. A combined endpoint would mix fast (liveness) and slow (DB query) checks.
- **Separate metrics service (future).** Prometheus scraping is sufficient for current scale. A dedicated metrics aggregation service (e.g., Grafana Agent) can be added later.

## Consequences

- **Positive:** Docker HEALTHCHECK uses fast liveness endpoint (no DB dependency). Deployment pipelines can block on readiness. Monitoring dashboards get detailed payment health.
- **Negative:** 8 health endpoints may seem excessive. Each is lightweight (file read or single DB query).
- **Enforcement:** HLT-01 through HLT-03, MET-01 through MET-03 in engineering standards.
