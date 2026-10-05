# 33 — OBSERVABILITY

**Audit:** 2026-10-04 · Sources: `app.ts`, `infrastructure/{health,metrics}`, `monitoring/`, audit module.

---

## 1. Logs

- ✅ pino JSON; requestId via `x-request-id` header or uuid (`genReqId`); production `onResponse` enriched log (requestId, userId, method, url, statusCode, responseTime).
- ✅ Module loggers (`createModuleLogger`) e.g. worker status, payment-cron, accounting-listener, membership lifecycle.

## 2. Error IDs / request IDs

- ✅ `requestId` returned in error payload `meta.requestId`.
- ❌ No distributed trace ID propagated into BullMQ jobs/websocket events (job has its own id; linkage manual).

## 3. Audit logs

- ✅ `audit_logs` (pattern-based) + `recordAudit`; `audit-log` admin module; DB triggers on `users`/`orders`.
- ✅ Notification audit trail (20 lifecycle events); template change history.

## 4. Metrics

- ✅ `/metrics` Prometheus (custom `courtzon_http_request_duration_seconds`, `courtzon_http_requests_total`; Node.js defaults: CPU/mem/event-loop/GC/handles).
- ✅ Prometheus :9090 + Grafana :3001 running locally; `monitoring/prometheus.yml`; 6 alert rules in `monitoring/alerts.yml` (BackendDown, HighErrorRate, HighLatency, NotificationDeliveryFailure, etc.).

## 5. Health checks

- ✅ `/health` composite (DB/Redis/memory), `/health/live`, `/health/ready`, `/health/database`, `/health/redis`, `/health/storage`, `/health/socket`, `/health/version`.
- ✅ Docker healthchecks on backend/frontend/mysql/redis.

## 6. Client-side telemetry

- ✅ `POST /client/errors` → `client_error_reports`; `POST /client/web-vitals` → `web_vitals_metrics` (consumed by BI).

## 7. Blind spots

| # | Blind spot | Impact | Fix |
|---|---|---|---|
| O1 | No trace propagation across workers/jobs | Slow root-cause across async flows | adopt OpenTelemetry or pass requestId in job payloads |
| O2 | No business KPI dashboard (bookings/rev/payments) live | Ops lacks pulse | Grafana dashboards + Prometheus counters per domain |
| O3 | Notification delivery analytics only in-app (email/push nominal) | Channel SLA invisible | delivery metric + failure alerts |
| O4 | `gitCommit: unknown` | can't tie issue to build | build args + label |
| O5 | No DLQ alert parity for accounting/settlement queues | silent money-queue stalls | alert on `bull:*` depth/failures |
| O6 | No tracing of webhook ingress timing | late/dup webhook ambiguity | log+metric webhook duration & dedup hits |
| O7 | No retention policy for `audit_logs`/`notification_audit_trail` | growth | lifecycle policy |

## 8. Recommendations (ordered)

1. Add OpenTelemetry (or minimal trace propagator) for key flows (payment, booking, settlement).
2. Export dashboards for bookings/finance/queues; connect alerts to a real channel.
3. Add queue-depth & DLQ alert rules (accounting-replay, entitlement-*, default, notifications).
4. Persist `GIT_COMMIT` label; version stamp frontend bundle.
5. Add retention jobs for audit + web vitals + gateway_response archival.