# 02 — COMPLETE SYSTEM ARCHITECTURE

**Audit:** 2026-10-04 · **Git:** `aa9e3d1895e849691f145d409c12b997435536b2`

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT IMPLEMENTED · ❌ BROKEN · ❓ UNVERIFIED · ⚖️ REQUIRES BUSINESS DECISION

---

## 1. High-level

```
Browser (React SPA, PWA) ── nginx :5173 ──
   /api/*  /auth/*  /admin/(api)  /socket.io/*  →  Fastify API :3000
                                                ├── MySQL 8 (courtzon_v3) — pool (mysql2)
                                                ├── Redis 7 — BullMQ(default+notifications), outbox cursor
                                                ├── Socket.IO (in-process; NO redis adapter — ❓ scaling)
                                                ├── in-process BullMQ workers (30 handlers)
                                                ├── EventBusV2 + OutboxPoller (durable relay)
                                                └── Notification Engine (+6 providers)
Monitoring: Prometheus :9090 ← scrape /metrics · Grafana :3001
```

## 2. Frontend architecture

- ✅ React 19 + Vite + TS; router config centralized in `frontend/src/App.tsx` (~780 lines).
- ✅ Layouts: `AppLayout` (Navbar+BottomNav+cz-pb-safe), `AdminLayout`, `OrgLayout`, `CoachLayout`, `RefereeLayout`, `LandingLayout`.
- ✅ State: Zustand stores (`auth.store.ts`, `theme.store.ts`, `workspace.store.ts`, `currency.store.ts`, `appearance.store.ts`, `feature-flags.store.ts`, `app-settings.store.ts`); server data via TanStack Query.
- ✅ API layer: `frontend/src/services/api.ts` — axios, `withCredentials`, refresh interceptor (single-flight), `X-Device-Fingerprint` header, FormData handling.
- ✅ RBAC: `permissions/registry.ts` (942 UI elements), `<Can permission>` + `useCan`. ⚠️ `ProtectedRoute`/`AdminRoute` also use hardcoded role-slug lists (`super-admin|admin|master-admin|accountant`). **FRONTEND/BACKEND MISMATCH POINT.**
- ✅ Realtime: `realtime/SocketContext.tsx`, `RealtimeCacheUpdater.tsx` (invalidates React Query caches on socket events).
- ✅ PWA: `vite-plugin-pwa`, `OfflineBanner`, `PWAUpdatePrompt`, `IOSInstallSheet`, `PushSubscriptionManager`; ⚠️ offline data is limited to shell (data needs network).
- ✅ i18n: `i18n/translation-keys.registry.ts` (generated file, synced at backend boot).

## 3. Backend architecture

- ✅ Entry: `server.ts` (bootstrap) + `app.ts` (Fastify assembly).
- ✅ Middleware chain: helmet (CSP) → permission-policy → HTTPS redirect (prod) → rate-limit → cookie → CORS → maintenance → authMiddleware (global preHandler) → route.
- ✅ Modules: 55 folders under `backend/src/modules/`, each `presentation | application | domain | infrastructure` + `__tests__`.
- ✅ Error contract: `AppError` → status + `{error,message,code,meta,details}`; zod → 400 VALIDATION_ERROR; 429 RATE_LIMIT_EXCEEDED; 500 abstract.
- ✅ Request logging: pino JSON + requestId (`x-request-id`/uuid) + enriched onResponse in production.
- ✅ DB access: mysql2 pool with parameterized queries; transactions per service; optimistic version columns (`users.version`, `user_wallets.version`, `payment_transactions.aggregate_version`, `bookings.version`...).

## 4. API architecture

- ✅ Flat JSON API, routes mounted at root (no `/api/v1` prefix; frontend nginx proxies any `/api/*` plus specific prefixes).
- ✅ Auth: HttpOnly session cookie (`session_token_hash` in `user_sessions`) + optional Bearer.
- ✅ Authorization: `requirePermission(['key'])` arrays per route + org guards.
- ✅ Swagger: dev-only or `ENABLE_API_DOCS=true` (`/docs`, `/openapi.json`) — disabled in prod by default.
- ✅ Full static inventory: `05_API_INVENTORY.md` (1289 registered endpoints across 71 route files).

## 5. Database architecture

- ✅ MySQL `courtzon_v3`, 330 tables. Pool: `backend/src/database/mysql.ts`.
- ✅ Tenancy: `organisations→branches→resources`; `user_role_scopes` (org/branch/resource).
- ✅ Financial model (unified): `financial_entitlements → settlement_entitlements → settlements → settlement_transfers`; `gateway_settlements/gateway_setlement_transactions`.
- ✅ Accounting: `chart_of_accounts`, `ledger_entries` (event-sourced, `uk_dedup`), `general_ledger` (projection), ⚠️ `financial_journal_entries` **unused (0 rows)**.
- ✅ Payments: `payment_transactions` (unique `idempotency_key`, `gateway_reference`), `payment_allocations`, `payment_methods`, `payment_gateway_config`, `invoices/invoice_items`.
- ✅ Idempotency matrix: many UNIQUE keys (see `04_DATABASE_AUDIT.md`).
- 🔴 Known drift: baseline file missing `payment_allocations` (created by M178 only).

## 6. Redis

- ✅ Redis 7.4.9 standalone on :6379, `docker-compose.yml`: `--maxmemory 512mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`.
- ✅ Usage: BullMQ queues/workers/repeat jobs, outbox cursor, processed-events dedup.
- ❓ No Socket.IO redis adapter (in-process pubsub only).

## 7. Queue/worker architecture

- ✅ BullMQ queues: `default` (business jobs) + `notifications` (notification delivery).
- ✅ 30 job-handlers registered in `server.ts` (full list in `17_BACKEND_AUDIT.md` and `31_DEVOPS_DEPLOYMENT.md`).
- ✅ Repeatable cron jobs scheduled at boot (UTC; 1-min to daily cadence).
- ✅ Retry/backoff: default `attempts:3` (queue), `attempts:6` (event subscribers) with exponential backoff; `removeOnComplete/removeOnFail` TTLs.
- ⚠️ Workers run inside the backend process — horizontal scaling requires moving workers to separate processes.

## 8. EventBus architecture

- ✅ `shared/event-bus/event-bus.v2.ts` (in-memory EventEmitter2-like).
- ✅ Durable layer: `shared/event-bus/outbox-poller.ts` + `processed_events`/`processed_commands` (UNIQUE `uk_event_subscriber`/`uk_command_subscriber`).
- ✅ Durable subscribers via BullMQ queues keyed per subscriber (`bull:entitlement-*`, `bull:accounting-replay`, `bull:notifications` — observed live in Redis).
- ✅ Command workflow registry: `ConfirmBooking`, `CancelBooking`, `ExpireBooking`, `CompleteBooking`, `ProcessPayment`, `DepositWallet`, `WithdrawWallet`.
- ✅ Observed live queues: `bull:notifications:*, bull:default:*, bull:entitlement-{booking,academy,marketplace,tournament}-*, bull:accounting-replay:*`, tournament reminders.

## 9. Socket.IO / realtime

- ✅ `backend/src/realtime/index.ts` `setupRealtime(app)`; auth via cookie or `handshake.auth.token`; `join` rooms: `user:{id}`, `role:{slug}`, `org:{id}`, `booking:{id}`, `match:{id}`, `conversation:{id}`, `resource:{id}`, `ADMIN_ROOM`, `PLAYER_ROOM`.
- ✅ Client events: `join:booking|match|conversation|resource`, `leave:*`, `device:register`.
- ✅ Server emissions centralized in `modules/realtime/application/socket-publisher.ts` with `canJoinRoom` permission checks; health endpoint `/health/socket`.
- ⚠️ Rooms only joined when the page explicitly calls `join:*` → pages that skip joining miss updates (stale UI risk).

## 10. Notifications architecture

- ✅ Engine: `notification-engine.ts` subscribes **130+ domain events** → `dispatcher.service.ts` (all/branch/org/role/userIds) → providers; rate limits, quiet hours, prefs respected.
- ✅ Providers registered at boot: InApp, Push, Email, SMS, WhatsApp, Webhook.
- ✅ Templates (versioned), categories, digests (hourly/daily/weekly), cleanup policies, DLQ + reprocess, audit trail (20 lifecycle events).
- ⏳ Push & SMS providers are **mock** (return success without real delivery) — documented in `.env.example`.

## 11. Payments

- ✅ Paymob integration: `PAYMENT_GATEWAY_PROVIDER=paymob` (sandbox). `payment.service.ts` — `charge` (wallet/gateway), `handleWebhook(signature)`, `confirmPayment`, `refund`, `syncPendingPayments`, `expireStalePayments`, `recoverPayment`, reconciliation service.
- ✅ Idempotency at DB level (unique keys) and event level.
- ⏳ Real gateway behavior untestable locally — see `10_PAYMENT_SYSTEM.md`.

## 12. Accounting

- ✅ Event-driven postings: `accounting-event.listener.ts` (per-entity in-process mutex) → `accounting-engine.service.ts` → `ledger_entries` → `gl-projection.service.ts` → `general_ledger`.
- ✅ CoA seeds: `004_chart_of_accounts.sql`, `005_accounting_defaults.sql` (event→mapping), `006_account_templates.sql` (3 templates/26 lines).
- ⚠️ `financial_journal_entries` dormant; two ledger systems coexist (business decision required).

## 13. File storage

- ✅ Local uploads: `@fastify/static` `/uploads/`, `upload.service.ts` hardening (file type/size), multipart limits (6MB×6). Backend volume `./backend/uploads`.
- ⏳ S3/R2 optional (env `STORAGE_PROVIDER=s3|r2`) — not active (`storageProvider=local` per `/health/version`).

## 14. External services

- Paymob (sandbox) · SMTP (optional) · Twilio/Vonage (mock) · FCM/APNs (mock) · S3/R2 (optional) · webhooks (HMAC, provider registered) · Coolify/Hostinger (docs).

## 15. Docker

- ✅ `docker compose` services: mysql(3307→3306), redis(6379), backend(3000, health /health/ready), frontend(nginx 80→5173), prometheus(9090), grafana(3001) w/ monitoring profile active.
- ✅ Volumes: mysql_data, redis_data, backend_backups, prometheus_data, grafana_data. Network: `courtzon`.
- ✅ Backend image multi-stage node:22-alpine; entrypoint = migration guard (fail-closed for LOCAL_DOCKER_ONLY), fixes uploads perms, drops to `appuser`.
- ⚠️ `GIT_COMMIT` build arg not passed → `/app/git-commit.txt` = `unknown` (traceability gap).

## 16. Reverse proxy

- ✅ `frontend/nginx.conf`: prooxy `/api/`, `/auth/`, `/admin/` (Accept-header SPA/API routing), `/socket.io/` w/ long timeouts; `security-headers.conf` incl. CSP; caching policy; preserves `X-Forwarded-Proto` (Coolify/HTTPS loop prevention).

## 17. Production infrastructure / CI-CD

- ✅ Production landing: Hostinger/Coolify per `docs/`, `DEPLOYMENT.md`, `scripts/verify-production.sh` (local unverified).
- ✅ GitHub workflows: build.yml, ci.yml, lint.yml, migration-validation.yml, restore-validation.yml, security-scan.yml, test.yml.

## 18. Monitoring

- ✅ `/metrics` (Prometheus) guarded by METRICS_TOKEN in prod; `/health/*` suite; per-service healthchecks; alerts.yml (6 rules) in `monitoring/`.
- ✅ Grafana provisioned datasource.
- ❓ Production alert routing (MSSG/PagerDuty etc.) not verified.

## 19. Request/data lifecycle (booking example)

```
POST /bookings (authMiddleware→route) 
 → booking.controller → bookingService.createBooking (tx, aggregate_version)
 → events emitted: booking:created, etc.
 → in-process listeners: realtime publish (if room), notification engine offers event
 → outbox → BullMQ → entitlement/accounting replay workers
 → socket emit to booking:{id} + user:{id} rooms
 UI: React Query invalidation via RealtimeCacheUpdater
```

## 20. Cross-cutting gaps (summary)

| Area | Verdict | Evidence |
|---|---|---|
| Settlement execution | ⏳ never run live | `settlements`=0 |
| Marketplace orders | ⏳ never run live | `orders`=0 |
| Membership G11.22 purchase | ⏳ never run live | `membership_subscriptions`=0 |
| Push/SMS delivery | ⏳ mock | providers + `.env.example` |
| Baseline parity | ❌ drift | `payment_allocations` missing from baseline |
| Socket.IO scaling | ❌ no redis adapter | `realtime/index.ts` code |
| Frontend /admin gate | 🟡 role-list based | `App.tsx` |
| Concurrency locking | ⚠️ optimistic-only | no verified FOR UPDATE |