# 03 — PROJECT STRUCTURE

**Audit:** 2026-10-04 · **Git:** `aa9e3d1895e849691f145d409c12b997435536b2`

This is an analysis of the CURRENT repository layout — not a dry file list.

---

## Top level

```
backend/      Fastify API (TS, ESM, Node 22)
frontend/     React SPA (Vite)
database/     schema baseline, migrations, seeds
scripts/      ops/validation shell scripts (migrate.sh, seed.sh, backup.sh, restore.sh, ci-validate.js, ...)
docs/         existing documentation (47 files) + this HANDOVER_CURRENT/
monitoring/   prometheus.yml, alert rules, grafana datasource
deployment/   deployment assets
e2e/          Playwright end-to-end (tests live here)
packages/shared/  shared library (deps for backend)
archive/      legacy archived migrations (128 files) + old artifacts — AUDIT ONLY
release/ artifacts/ backups/  ops artifacts
.github/workflows/  7 CI workflows
test-results/  Playwright last-run state
docker-compose.yml, .env, .env.example, package.json
```

---

## backend/

### `backend/src/`

| Path | Responsibility | Key files |
|---|---|---|
| `app.ts` | Fastify assembly: middleware, CORS/CSP/rateLimit, auth glue, ALL route registration (lines 511–584), error handler | ✅ **critical** |
| `server.ts` | Bootstrap: register 30 job handlers, commands, providers, cron repeat jobs, realtime, outbox poller, startup schema validation | ✅ **critical** |
| `config/env.ts` | zod env schema (fail-fast; production requires SESSION_SECRET etc.; rejects `mock` payment provider in prod) | ✅ **critical** |
| `database/` | mysql2 pool (`mysql.ts`) | ✅ |
| `infrastructure/` | queue (`queue.service.ts`, `worker.ts`), redis client, health, metrics, backup, startup-validator, event-store, command, dead-letter | ✅ |
| `shared/` | event-bus (v2 + outbox poller), middleware (auth, route-guard, feature-flag, maintenance), errors (`AppError`), workflow command registry, utils (token, business-date, logger) | ✅ |
| `realtime/index.ts` | Socket.IO setup + room auth | ✅ |
| `modules/` | **55 modules** (see list below) | ✅ |
| `tests/`, `types/`, `utils/` | helpers, shared types | ✅ |

### Modules (`backend/src/modules/` — 55)

academy · accounting · activities · admin · amenities · app-settings · approvals · audit-log · auth · banks · bi · booking · brute-force · cities · cms · coaches · community · countries · coupon · crm · currencies · design-tokens · financial · geo · hr · integration · languages · leagues · marketplace · match · match-result · membership · mobile · notifications · organisations · payment · player-experience · pricing · profiles · provinces · rbac · realtime · reference-data · reports · scheduling · security · settlement · sidebar-layout · sports-engine · support · time · tournaments · translations · upload · wallet

Each module is layered: `presentation/` (routes+dto+controller) · `application/` (services/listeners/workers) · `domain/` (aggregates/types) · `infrastructure/` (repositories/workers) · `__tests__/`.

### Module structure example (membership — G11.22)
- presentation: `membership.routes.ts` + `membership-p1.routes.ts` (plans/versions/subscriptions/installments), controllers, DTOs.
- application: plan-version, subscription, installment, cancellation/refund, lifecycle, renewal, eligibility services + `membership-p1.listeners.ts` (reacts to `payment:succeeded` refType=membership_subscription).
- domain: `membership-p1.types.ts`, `membership-p2.types.ts`, `membership-p3.types.ts`, `membership-aggregate.ts`.
- infrastructure: `repositories/membership-p1.repository.ts`, `membership-p2.repository.ts`, workers `membership-subscription-lifecycle.worker.ts` (expiry/overdue/reminders).

### `backend/scripts/` (ops)
`migrate.js` (wrapper→`scripts/migrate.sh` — requires bash), `seed.js`, `sync-ui-registry.js`, `sync-role-permissions.mjs`, `role-permission-templates.mjs`, `backup.js`/`restore.js`, `emergency-repair.js`, `migration-guard.sh`, `setup-db-users.sql`, `e2e-validation.mjs` (hits live Docker backend).

### `backend/Dockerfile` + `docker-entrypoint.sh`
Multi-stage node:22-alpine; entrypoint runs migration-guard then drops to `appuser`; healthcheck `/health/ready`; writes `/app/{build-time,git-commit,version,expected-migration}.txt`.

---

## frontend/

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Router + guards + providers (QQuery/Toast/Socket/i18n/Theme) — **critical** |
| `src/pages/` | 21 route-page folders (admin, org, player, booking, membership, marketplace, tournaments, academies, coaches, auth, ...) |
| `src/services/` | axios `api.ts` (base URL, refresh interceptor, fingerprint) + per-domain API modules (`membership.p1.ts`, `tournament.ts`, `match.api.ts`, `notifications.ts`, `pricing.ts`, `upload`... ) |
| `src/store/` | Zustand stores (auth, theme, workspace, currency, appearance, feature-flags, app-settings) |
| `src/permissions/` | `registry.ts` (942 UI elements + fields/buttons/tabs), `Can.tsx`, `useCan` hook, types |
| `src/components/` | layouts (BottomNav, AdminSidebar, CoachLayout...), ui (Toast, Modal...), auth, notifications, branding, admin widgets |
| `src/hooks/` | `useCan`, `useRealtimeCacheUpdates`, `usePlayerNavCounts`, `useHaptics`, `useFeatureFlag`, useSocket... |
| `src/i18n/` | index + generated `translation-keys.registry.ts` (synced at backend boot) |
| `src/realtime/` | SocketContext, socket-client, RealtimeCacheUpdater, useResourceRoom/useSocket |
| `src/lib/` | queryClient |
| `src/theme/` · `src/constants/` · `src/utils/` · `src/types/` | theming (design tokens), constants (PWA reload key, login splash), utils (organisation, currency, dates) |

`nginx.conf`, `Dockerfile`, `vite.config.ts`, `package.json`.

---

## database/

- `baseline/001_courtzon_v3.sql` — **328 CREATE TABLEs**, the single authoritative schema for fresh installs. ⚠️ DRIFT: live DB (330) contains `payment_allocations` absent here.
- `migrations/` — 201 SQL files (001→194 with non-sequential/duplicate numbers: three `002_*`, no 001/076). All 201 applied in live DB; one applied-but-orphaned row `103b_coa_cleanup.sql` in `migration_history`.
- `seeds/` — 001_baseline (reference + permissions + roles + org data), 002_academy_programs, 003_player_demo, 004_chart_of_accounts, 005_accounting_defaults, 006_account_templates, 007_tournament_translations.
- `Dockerfile` + `.gitkeep` (migrations dir placeholder).

---

## scripts/ (root)

`migrate.sh`, `seed.sh`, `backup.sh`, `restore.sh`, `ci-validate.js`, `ci-arch-check.sh`, `e2e-smoke.js`, `verify-production.sh`, `validate-shared-contracts.sh`, `backup-cron.sh`, `architecture/` (validate-all.js, metrics.js).

---

## docs/ (existing 47 files — NOT authoritative)
Include pre-existing marketing/analysis documents (final-status-report.md, PRODUCTION_READINESS_REPORT.md, enterprise dossiers, etc.). **Do not treat them as evidence**: many describe planned states. This `HANDOVER_CURRENT/` folder is the evidence-based handover.

---

## Important cross-cutting facts

- **Entry points:** backend `dist/server.js` (from `src/server.ts`); frontend `index.html` → `src/main.tsx`.
- **Workers:** server-side only (in-process).
- **Critical files that must not change casually:** `app.ts`, `server.ts`, `config/env.ts`, `shared/event-bus/*`, `infrastructure/queue/*`, `infrastructure/startup/startup-validator.ts`, `database/baseline/001_courtzon_v3.sql`, `permissions/registry.ts` + `backend/scripts/sync-ui-registry.js` (linked), `i18n/translation-keys.registry.ts` (auto-synced at boot), `docker-compose.yml`, `.env`.
- **Legacy/dead areas:** `archive/` (old migrations), `courtzon_v2` XAMPP DB and legacy V2 Docker images (not in compose), `financial_journal_entries` table (unused), `courtzon_v3_baseline` DB on the server (stale, 317 tables).
- **Suspicious:**
  - `metadata` JSON columns with unknown shape (orders/participants) — inspect before relying.
  - `organisation.routes.ts` (86 routes) is the largest surface — review permission spread before exposing.
  - Duplicate semantic endpoint pairs (`/admin/settlements` redirect, legacy `/academies/:id` redirect).
  - Regenerated file `translation-keys.registry.ts` is committed; manual edits can be clobbered by boot sync.