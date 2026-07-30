---
document_id: "TECH-ARCH-25"
document_name: "Observability Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "devops"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-14", "TECH-MOD-25"]
  related: ["OPS-MON-01", "QUAL-TEST-03"]
---

# Observability Architecture (TECH-ARCH-25)

## 1. Health Check System

**Source:** `backend/src/infrastructure/health/health.service.ts` (143 lines)

### 1.1 Architecture

Health checks are registered as Fastify routes. The service runs component-level checks in parallel via `Promise.all`.

### 1.2 Endpoint Inventory

| Endpoint | Purpose | Source |
|----------|---------|--------|
| `GET /health` | Composite check (DB + Redis + Memory) | `health.service.ts:59-76` |
| `GET /health/live` | Liveness (process alive) | Trivial check |
| `GET /health/ready` | Readiness (DB + Redis up) | `health.service.ts:59-76` filtered |
| `GET /health/database` | DB connectivity + table count | `health.service.ts:78-94` |
| `GET /health/redis` | Redis ping check | `health.service.ts:96-108` |
| `GET /health/storage` | Upload dir writability + disk space | `health.service.ts:110-143` |
| `GET /health/version` | Build metadata | Reads `/app/git-commit.txt`, etc. |

### 1.3 Composite Health Check

`getHealth()` function runs three checks in parallel:

```
checkDatabase()   → { status, latencyMs?, error? }
checkRedis()      → { status, latencyMs?, error? }
checkMemory()     → { status, usagePercent, freeMb, totalMb }
```

**Overall status logic:**
- Any `down` → status = `'down'`
- All `ok` → status = `'ok'`
- Mixed → status = `'degraded'`

**Database check** (`health.service.ts:23-33`):
- Executes `SELECT 1 AS ok`
- Measures latency
- Returns `ok` if response is correct

**Redis check** (`health.service.ts:35-45`):
- Executes `redis.ping()`
- Measures latency
- Returns `ok` if response is `'PONG'`

**Memory check** (`health.service.ts:47-57`):
- Uses `os.freemem()` and `os.totalmem()`
- Warning threshold: > 90% usage

### 1.4 Component-Level Checks

**Database health** (`health.service.ts:78-94`):
- `SELECT 1 AS ok` + `SHOW TABLES`
- Returns table count and database name from `DB_NAME` env

**Redis health** (`health.service.ts:96-108`):
- `redis.ping()` with latency

**Storage health** (`health.service.ts:110-143`):
- Checks upload directory exists (`accessSync` with `F_OK`)
- Checks writable (`accessSync` with `W_OK`)
- Reports free disk via `statfsSync`

### 1.5 Response Format

```typescript
interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  service: string;       // 'courtzon-v2-backend'
  uptime: number;        // seconds since process start
  timestamp: string;     // ISO 8601
  checks: {
    database: { status: string; latencyMs?: number; error?: string };
    redis: { status: string; latencyMs?: number; error?: string };
    memory: { status: string; usagePercent: number; freeMb: number; totalMb: number };
  };
}
```

**Source:** `health.service.ts:11-21`.

---

## 2. Prometheus Metrics

**Source:** `backend/src/infrastructure/metrics/metrics.ts` (73 lines)

### 2.1 Registry

```typescript
export const registry = new client.Registry();
registry.setDefaultLabels({ app: 'courtzon-backend' });
client.collectDefaultMetrics({ register: registry, prefix: 'courtzon_' });
```

Default Node.js metrics include: CPU, memory, event loop lag, garbage collection, active handles, file descriptors.

### 2.2 Custom Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `courtzon_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request duration buckets |
| `courtzon_http_requests_total` | Counter | `method`, `route`, `status_code` | Total request count |
| `courtzon_aggregate_version_conflicts_total` | Counter | `aggregate_type` | Optimistic locking conflicts |

**Histogram buckets:** `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` seconds.

### 2.3 Scrape Endpoint

`GET /metrics` — protected by optional `METRICS_TOKEN`:
- If `METRICS_TOKEN` env is set, callers must provide via `Authorization: Bearer <token>` or `?token=`
- If unset (internal Docker network), endpoint is open
- Returns `registry.contentType` content type

### 2.4 Auto-Instrumentation

`registerMetrics()` hooks into Fastify's `onResponse` event:
1. Skips the `/metrics` endpoint itself
2. Uses the matched route template (not raw URL) to avoid high-cardinality labels
3. Records duration and increments counter

**Source:** `metrics.ts:44-58`.

---

## 3. Monitoring Alerts

**Source:** `monitoring/alerts.yml` (54 lines)

### 3.1 Alert Rules (6)

| Alert Name | Expression | Duration | Severity | Description |
|-----------|-----------|----------|----------|-------------|
| BackendDown | `up{job="courtzon-backend"} == 0` | 1m | critical | Backend process down |
| HighErrorRate | `rate(5xx[5m]) / rate(total[5m]) > 0.05` | 5m | critical | > 5% error rate |
| ElevatedErrors | `rate(5xx[2m]) > 0.1` | 2m | warning | Transient error spike |
| HighLatency | p95 latency > 2s (5m window) | 5m | warning | Slow API responses |
| NotificationDeliveryFailure | `POST /admin/notifications/broadcast` 5xx | 5m | warning | Broadcast failures |
| RedisUnavailable | Redis not reachable | 2m | critical | Redis down |

### 3.2 Evaluation

- **Scrape interval:** 30s (`prometheus.yml:3`)
- **Evaluation interval:** 30s (`prometheus.yml:4`)
- Retention: 15 days

---

## 4. Client-Side Monitoring

### 4.1 Web Vitals

Collected via `POST /client/web-vitals` (notifications module):

| Metric | Description | Source |
|--------|-------------|--------|
| LCP | Largest Contentful Paint | `web_vitals_metrics.lcp` |
| CLS | Cumulative Layout Shift | `web_vitals_metrics.cls` |
| FCP | First Contentful Paint | `web_vitals_metrics.fcp` |

**Viewer:** `GET /bi/web-vitals` — daily averages with sample count.

### 4.2 Client Errors

Collected via `POST /client/errors` (notifications module):

| Field | Description |
|-------|-------------|
| `error_message` | JS error message |
| `error_stack` | Stack trace |
| `error_type` | Error type |
| `error_url` | URL where error occurred |
| `user_agent` | Browser user agent |
| `user_id` | Authenticated user (if available) |

**Viewer:** `GET /bi/client-errors` — grouped by message/stack/type with frequency.

**Source:** `bi.controller.ts:361-393` (getClientErrorsHandler).

---

## 5. Docker Health Checks

### Backend (`backend/Dockerfile:47-48`)
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live',..."
```

### Frontend (`frontend/Dockerfile:38-39`)
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1
```

### MySQL (`docker-compose.yml:16-20`)
```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s | timeout: 5s | retries: 10 | start_period: 30s
```

### Redis (`docker-compose.yml:40-44`)
```yaml
healthcheck:
  test: ["CMD-SHELL", "redis-cli ping | grep -q PONG"]
  interval: 10s | timeout: 5s | retries: 3
```

---

## 6. Monitoring Stack (Optional)

Activated via `docker compose --profile monitoring up`:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| Prometheus | `prom/prometheus:v3.2.1` | 9090 | Metrics collection & alerting |
| Grafana | `grafana/grafana:11.5.2` | 3001 | Dashboard visualization |

**Data sources:** Prometheus auto-provisioned via `grafana-datasources.yml`.

**Evidence:** All source files verified against `health.service.ts:1-143`, `metrics.ts:1-73`, `alerts.yml:1-54`, `prometheus.yml:1-17`, `grafana-datasources.yml:1-9`, `docker-compose.yml:119-161`.
