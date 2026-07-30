---
document_id: "OPS-MON-01"
document_name: "Monitoring Guide"
family: "OPS-MON"
document_type: "OPS"
status: "Draft"
version: "0.1"
audience: ["devops", "developer"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "DevOps Lead"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Engineering Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-25", "OPS-DEPLOY-01"]
  related: ["OPS-RUN-01", "OPS-RUN-02"]
---

# Monitoring Guide (OPS-MON-01)

## 1. Overview

CourtZon uses Prometheus for metrics collection and alerting, Grafana for visualization, and built-in health checks for service monitoring. Client-side monitoring captures Web Vitals and JS errors.

## 2. Prometheus Configuration

**Source:** `monitoring/prometheus.yml` (17 lines)

### 2.1 Global Settings

| Setting | Value |
|---------|-------|
| `scrape_interval` | 30s |
| `evaluation_interval` | 30s |

### 2.2 Scrape Targets

| Job Name | Target | Metrics Path | Labels |
|----------|--------|-------------|--------|
| `courtzon-backend` | `backend:3000` | `/metrics` | All metrics prefixed `courtzon_` |
| `prometheus` | `localhost:9090` | `/metrics` | Prometheus self-metrics |

The backend job uses `metric_relabel_configs` to keep only metrics matching `courtzon_.*`.

### 2.3 Activation

Prometheus is part of the optional monitoring profile:
```bash
docker compose --profile monitoring up -d
```

### 2.4 Retention

Time series data retention: 15 days (configured via `--storage.tsdb.retention.time=15d` in `docker-compose.yml:132`)

## 3. Grafana Dashboards

**Source:** `monitoring/grafana-datasources.yml` (9 lines)

### 3.1 Provisioned Data Source

Grafana auto-configures a Prometheus data source at container startup via the provisioning file:

```yaml
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

### 3.2 Access

| Property | Value |
|----------|-------|
| URL | `http://localhost:3001` (after `docker compose up`) |
| Default User | `admin` (configurable via `GRAFANA_USER`) |
| Default Password | `admin` (configurable via `GRAFANA_PASSWORD`) |

### 3.3 Importing Dashboards

1. Log in to Grafana at `http://localhost:3001`
2. Click **+ → Import dashboard**
3. Paste dashboard JSON or import from Grafana.com
4. Select the Prometheus data source

Recommended dashboards to import:
- **Node.js / Backend:** Create custom dashboard for `courtzon_http_request_duration_seconds`, `courtzon_http_requests_total`, `courtzon_aggregate_version_conflicts_total`
- **Process:** Default Node.js metrics (`courtzon_nodejs_*`) for CPU, memory, event loop lag, GC

## 4. Alert Rules

**Source:** `monitoring/alerts.yml` (54 lines)

### 4.1 Alert: BackendDown

| Property | Value |
|----------|-------|
| **Expression** | `up{job="courtzon-backend"} == 0` |
| **For** | 1 minute |
| **Severity** | critical |
| **Description** | Backend has been unreachable for more than 1 minute |
| **Action** | Check Docker container: `docker compose ps backend` |

### 4.2 Alert: HighErrorRate

| Property | Value |
|----------|-------|
| **Expression** | `rate(courtzon_http_requests_total{status_code=~"5.."}[5m]) / rate(courtzon_http_requests_total[5m]) > 0.05` |
| **For** | 5 minutes |
| **Severity** | critical |
| **Description** | 5xx error rate over the last 5 minutes |
| **Action** | Check backend logs for stack traces |

### 4.3 Alert: ElevatedErrors

| Property | Value |
|----------|-------|
| **Expression** | `rate(courtzon_http_requests_total{status_code=~"5.."}[2m]) > 0.1` |
| **For** | 2 minutes |
| **Severity** | warning |
| **Description** | Transient error spike |
| **Action** | Investigate recent deployments or upstream issues |

### 4.4 Alert: HighLatency

| Property | Value |
|----------|-------|
| **Expression** | `histogram_quantile(0.95, rate(courtzon_http_request_duration_seconds_bucket[5m])) > 2` |
| **For** | 5 minutes |
| **Severity** | warning |
| **Description** | p95 API latency exceeds 2 seconds |
| **Action** | Check DB query performance, Redis cache hit rates |

### 4.5 Alert: NotificationDeliveryFailure

| Property | Value |
|----------|-------|
| **Expression** | `rate(courtzon_http_requests_total{method="POST",route_template="/admin/notifications/broadcast",status_code=~"5.."}[5m]) > 0` |
| **For** | 5 minutes |
| **Severity** | warning |
| **Description** | Notification broadcast failures detected |
| **Action** | Check notification channel configs (email, SMS, push) |

### 4.6 Alert: RedisUnavailable

| Property | Value |
|----------|-------|
| **Expression** | `up{job="prometheus"} unless absent(up{job="courtzon-backend"})` |
| **For** | 2 minutes |
| **Severity** | critical |
| **Description** | Redis not reachable |
| **Action** | Check Redis container: `docker compose logs redis` |

## 5. Key Metrics to Monitor

### 5.1 Request Latency

- **Metric:** `courtzon_http_request_duration_seconds`
- **Type:** Histogram (11 buckets: 5ms to 10s)
- **Labels:** `method`, `route`, `status_code`
- **Alert threshold:** p95 > 2s (HighLatency alert)
- **Investigate when:** p50 > 500ms or p95 > 1s

### 5.2 Error Rate

- **Metric:** `courtzon_http_requests_total`
- **Type:** Counter
- **Labels:** `method`, `route`, `status_code`
- **Alert threshold:** > 5% 5xx rate (HighErrorRate alert)
- **Investigate when:** Any sustained 5xx spike

### 5.3 Queue Depth

- **Location:** `health/database` check
- **Monitor:** Pending payment sync queue, notification queue
- **Alert threshold:** Pending items > 1000

### 5.4 DB Connection Pool

- **Metric:** Default Node.js metrics (`courtzon_nodejs_*`)
- **Monitor:** Active connections, waiting requests
- **Alert threshold:** Connection pool exhaustion (waiting > 0)

### 5.5 Redis Memory

- **Monitor:** `courtzon_nodejs_*` process metrics
- **Redis config:** `--maxmemory 512mb --maxmemory-policy noeviction`
- **Alert threshold:** Memory usage > 80%

### 5.6 Aggregate Version Conflicts

- **Metric:** `courtzon_aggregate_version_conflicts_total`
- **Type:** Counter
- **Labels:** `aggregate_type`
- **Monitor:** Sudden spikes indicate concurrent write contention

## 6. Health Check Endpoints

| Endpoint | Purpose | Expected Status |
|----------|---------|-----------------|
| `GET /health` | Composite (DB + Redis + Memory) | `ok` |
| `GET /health/live` | Liveness (process alive) | HTTP 200 |
| `GET /health/ready` | Readiness (DB + Redis) | `ok` |
| `GET /health/database` | DB connectivity + table count | `ok`, tables > 0 |
| `GET /health/redis` | Redis ping | `ok`, connected = true |
| `GET /health/storage` | Upload dir writability | `ok`, writable = true |
| `GET /health/version` | Build metadata | Git commit, build time, version |

## 7. Client-Side Monitoring

### 7.1 Web Vitals

| Metric | Interpretation |
|--------|---------------|
| **LCP** (< 2500ms good) | Loading performance |
| **CLS** (< 0.1 good) | Visual stability |
| **FCP** (< 1800ms good) | Perceived load speed |

**Viewer:** `GET /bi/web-vitals` at `/admin/bi/observability`

### 7.2 Client Errors

Aggregated JS errors grouped by message/stack/type with frequency counts.

**Viewer:** `GET /bi/client-errors` at `/admin/bi/observability`

## 8. Notification Channels (Alertmanager)

To enable alert notification delivery:

1. Add `alertmanager.yml` to `monitoring/` directory
2. Configure receivers (email, Slack, PagerDuty, etc.)
3. Reference it in `docker-compose.yml`:

```yaml
alertmanager:
  image: prom/alertmanager:v0.28.0
  volumes:
    - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
  command:
    - "--config.file=/etc/alertmanager/alertmanager.yml"
```

**Evidence:** All source verified against `alerts.yml:1-54`, `prometheus.yml:1-17`, `grafana-datasources.yml:1-9`, `metrics.ts:1-73`, `health.service.ts:1-143`.
