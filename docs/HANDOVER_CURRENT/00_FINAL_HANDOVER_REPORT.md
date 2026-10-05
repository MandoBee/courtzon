# 00 — FINAL HANDOVER REPORT

**COURTZON — Current-State Handover & Production Readiness Audit**
**Audit performed:** 2026-10-04 (read-only; nothing modified)
**Audited Git:** branch `master`, commit **`aa9e3d1895e849691f145d409c12b997435536b2`** (`feat(membership): implement membership lifecycle P3`, 2026-10-04 19:32 +0300). Working tree clean (only pre-existing untracked `opencode.json.backup`).
**Audited database:** MySQL container `courtzon-mysql` → db **`courtzon_v3`**, **330 tables**, migration chain applied through **`194_membership_entitlements.sql`** (`migration_history` = 202 rows, all `up`). Baseline file has 328 CREATE TABLEs (drift D1: `payment_allocations` missing).
**Audited Docker/config:** `docker compose up` 6/6 healthy (backend :3000, frontend :5173, mysql :3307, redis :6379, prometheus :9090, grafana :3001). `.env` present (values redacted).
**Method:** source code read + live DB SELECT-only + Redis/Docker inspection + migrations/seed/tests inventory. Test suites NOT executed during audit (no test run performed; see §25 Unverified).

---

## 1. Current system state
CourtZon is a multi-tenant SaaS for sports clubs/facilities: bookings, memberships, tournaments, academies, coaching, marketplace, wallet, payments (Paymob sandbox), accounting/ledger, entitlements, unified settlement, notifications, full RBAC, org/branch tenancy. Functionally broad (55 backend modules, 1289 API handlers, 942 UI permissions), live data is **thin on money paths** (see evidence numbers below), so the system is best described as **feature-complete on paper, data-evidence-starved for finance**.

**Live data snapshot (verified):** 74 users · 66 orgs · 60 branches · 92 roles (26 global) · 965 permissions · 25 bookings · 1,086 payment_transactions (1,080 paid sandbox) · 33 financial_entitlements · 3 tournaments · 58 products · 2,571 notifications · 34,816 ledger_entries · 45,890 general_ledger · 254 wallets · 409 wallet_transactions · **0** orders · **0** settlements · **0** gateway_settlements · **0** academies · **0** coach_profiles · **0** seller_profiles · **0** membership_subscriptions · **0** financial_journal_entries.

## 2. Architecture (condensed)
React SPA (Vite+PWA) → nginx → Fastify 5 (global authMiddleware) → MySQL+Redis; in-process BullMQ workers (30 handlers + 2 queues) + EventBusV2 with durable outbox + per-subscriber queues (`bull:entitlement-*`, `bull:accounting-replay`, `bull:notifications`); Socket.IO rooms; Notification Engine (130+ events, 6 providers). Details: `02_SYSTEM_ARCHITECTURE.md`.

## 3. Modules
55 modules; inventory + status in `08_MODULE_INVENTORY.md`. Money-path modules mostly 🟡 (code complete, zero live rows) except booking/payment(wallet/cash/card sandbox)/wallet/accounting(booking-led)/notifications.

## 4. Database
330 tables; domain tables + keys + enums + soft-deletes + uniques in `04_DATABASE_AUDIT.md`. **Critical drift:** baseline lacks `payment_allocations` (D1). **Dormant:** `financial_journal_entries` (0 rows).

## 5. API
1289 registered handlers across 71 route files; static inventory `05_API_INVENTORY.md`. Largest surfaces: `organisation.routes.ts` (86), `tournament.routes.ts` (80), `academy.routes.ts` (77), `org-portal.routes.ts` (76), `marketplace.routes.ts` (71), `accounting.routes.ts` (67).

## 6. Security
Session cookies (hash in `user_sessions`) + refresh rotation + RBAC + rate limits + CSP/HSTS + zod validation + parameterized SQL. Weaknesses register in `29_SECURITY_RISK_REGISTER.md` (top: webhook HMAC unproven, CSRF absent, sandbox-only payments, role-list frontend gate).

## 7. RBAC
26 global roles; 92 total w/ org roles; 965 perms; frontend registry 942. Full matrix `07_RBAC_PERMISSION_MATRIX.md`. Issues: frontend `/admin` guard = hardcoded roles; org role copies; per-route permission audit recommended.

## 8. Booking
Full lifecycle: availability→slot→create→pending_payment→paid/confirmed→check-in→completed; expiry 15-min; cancel w/ policy; refund; series; matchmaking. Statuses & transitions: `09_BOOKING_ENGINE.md`. **Concurrency risk (no verified FOR UPDATE).**

## 9. Payments
Wallet/cash/card via Paymob sandbox; webhook dedup via uniques; sync/expire/recover/reconcile. `10_PAYMENT_SYSTEM.md`. **Real gateway unverifiable locally.**

## 10. Accounting
Event-driven `ledger_entries` (+`general_ledger` projection) with per-entity mutex + `uk_dedup`; CoA 141 accounts; event matrix `34_ACCOUNTING_EVENT_MATRIX.md`; `financial_journal_entries` unused. Settlement/clearing postings never produced.

## 11. Marketplace
Products/variants (58), cart reservation, checkout split, orders (0 live), complaints, inventory; `12_MARKETPLACE.md`. Oversell risk unverified lock.

## 12. Memberships / Subscriptions
Legacy tables + new G11.22 (versions/subscriptions/installments/entitlements) with full API/UI/workers; **0 live purchases**. Org subscriptions expire/remind only (no trial/grace). `13_SUBSCRIPTIONS_MEMBERSHIPS.md`.

## 13. Events / Notifications
EventBusV2 + outbox; 130+ notification events; providers InApp/Email real, Push/SMS/WhatsApp mock; digests; DLQ. `14_NOTIFICATIONS_EVENTS.md`.

## 14. Realtime
Socket.IO rooms (user/role/org/booking/match/conversation/resource); client joins rooms; cache invalidation; **no Redis adapter; reconnect re-join unverified**. `15_REALTIME_SOCKETIO.md`.

## 15. Testing
419 backend specs (149 integration) + 100 frontend tests + Playwright (last-run passed, breadth ❓). Not executed in this audit. Coverage gaps concentrated on money/consistency/E2E. `23_TESTING_AUDIT.md`, matrix in `24_COMPLETE_TEST_MATRIX.md`.

## 16–19. Known issues / missing features / tech debt / unverified
- Known issues (evidence-backed): `26_KNOWN_ISSUES.md` (top: baseline drift, sandbox-only payments, zero settlement/orders/membership rows, mock push/SMS, role-list guard, CSRF, dormant journal).
- Missing features (`27_MISSING_FEATURES.md`): real gateway, settlement execution, live marketplace order, membership purchase, CSRF/OTP/2FA, socket scaling, offline queue, packaging admin alerts.
- Tech debt (`28_TECHNICAL_DEBT.md`): dual ledger, monoliths, huge route surfaces, legacy data systems, non-uniform migrations.
- Unverified (`25_UNVERIFIED_ITEMS.md`): 28 items incl. HMAC, FOR UPDATE, event-after-commit, CSRF attributes, DST, no-show, reports' ledger source, membership ledger 1,715-row legacy, test-suite greenness, E2E breadth, permissions drift.

## 20. Production readiness — **⚠️ CONDITIONALLY READY (NOT READY for money today)**
Details + P0/P1/P2/P3 in `35_PRODUCTION_READINESS.md`.

## 21. Production roadmap
Phases 0–7 in `36_PRODUCTION_ROADMAP.md` (verification → security → data/payment/accounting integrity → full testing → staging/pilot → limited users → launch → monitoring).

## 22. Top 30 risks (prioritized)
1. Payment webhook HMAC unverified (forgery) 2. Real gateway never exercised 3. Settlement pipeline never executed 4. Marketplace orders never run 5. Membership billing never run 6. Baseline drift (payment_allocations) breaks fresh installs 7. Slot/stock concurrency lock absent 8. CSRF absent 9. Frontend role-list admin gate 10. Push/SMS mock "delivered" 11. `financial.reconcile` over-broad 12. RELAX_RATE_LIMIT config leak 13. Notifications DLQ silent 14. Late-webhook/booking-expiry ordering 15. Refund-after-settlement unproven 16. DST/fixed-date date-math untested 17. No trace across workers 18. No GL auto-balance check 19. Reports may read dormant journal 20. Multi-instance socket scaling blocked 21. Queue contention single process 22. Auth middleware DB-per-request 23. N+1 in series/orders loops 24. gateway_response LONGTEXT growth 25. Org role copies drift 26. Temporary reset email-only 27. Phone "verified" nominal 28. Network retry/offline stale UI 29. Upload abuse/media hygiene 30. Production alerting not wired.

## 23. Top 30 actions (ordered)
1. Verify+test webhook HMAC 2. Paymob pilot (sandbox→prod) 3. Execute first settlement end-to-end 4. Execute first marketplace order end-to-end 5. Execute first membership G11.22 purchase 6. Regenerate baseline (payment_allocations) 7. Add FOR UPDATE + race tests 8. CSRF/SameSite review 9. Permission-based admin gate 10. CI guard RELAX_RATE_LIMIT 11. Permission cache 12. Real push/SMS or flag-unavailable 13. GL nightly balance check 14. Template/event drift check 15. DLQ/queue alerting 16. Fix `ledger_entries` membership lineage 17. Verify report data sources 18. DST & fixed-date test suites 19. Socket reconnect room re-join 20. Redis socket adapter + worker split 21. OTP phone verification 22. i18n completeness 23. Late-webhook policy UAT 24. Refund-after-settlement UAT 25. Offline PWA/Ux pass 26. S3/R2 storage 27. Index/EXPLAIN pass 28. Migration renumbering + cleanup 29. Observability (traces, retention) 30. Quarterly UAT regression cycle.

## 24. Top 20 things the new engineer must know
1. **`payment_allocations` missing from baseline** — fresh restores break recurring-series payments.
2. **Payments are Paymob SANDBOX only** — real gateway behavior never proved.
3. **Settlements/gateway_settlements = 0 rows** — the entire settlement engine has never run.
4. **Marketplace orders = 0** — checkout→stock→fulfilment→settlement unproven.
5. **Membership G11.22 subscriptions = 0** — the new billing model has never been purchased.
6. **`financial_journal_entries` is dormant** — real accounting = `ledger_entries` + `general_ledger`.
7. **`ledger_entries` has 1,715 `membership` rows with no subscriptions** — unresolved lineage (investigate before trusting old money data).
8. **SMS/Push/WhatsApp providers are mocks** — "delivered" ≠ real send.
9. **EventBusV2 + outbox + durable queues** — payments/entitlements/accounting rely on this; workers live in the API process.
10. **Auth = HttpOnly session cookies** with DB-hashed tokens + proactive refresh; permissions propagate without re-login.
11. **RBAC is enforced both ends**; always run `sync-ui-registry.js` when adding permission keys.
12. **Frontend `/admin` guard uses hardcoded role slugs** — inconsistent with permission-first; fix before scale.
13. **All cron sweeps are UTC by explicit design (BE-6)** — don't "fix" them into local time.
14. **migrate/seed scripts require bash (WSL/Git-Bash)** — plain Windows PowerShell cannot run them (observed).
15. **Slot & stock locking (FOR UPDATE) not verified** — concurrency safety relies on optimistic checks.
16. **CSRF token not found**; cookie SameSite unverified — verify before real users.
17. **Webhook endpoint is unauthenticated; HMAC path must be proven** before production gateway.
18. **`GIT_COMMIT` = unknown in images** — no artifact traceability until CI passes the build arg.
19. **`COURTZON_MIGRATION_ENV=local` is the compose default**; production must set `production` (guard is fail-closed).
20. **Money-path UAT is the single highest-value activity** — run `24_COMPLETE_TEST_MATRIX.md` P0/P1 rows before launch.

---

# HANDOVER COMPLETION STATUS

**Status: SUFFICIENTLY DOCUMENTED — the current system has been fully mapped for ownership transfer.** ✅

- The repository, live database, migrations, seeds, Docker/config, tests, and runtime state were inspected **directly** from the current working tree and live containers (no prior handover/report/ZIP/old SQL was used as evidence).
- All 38 requested files exist in `docs/HANDOVER_CURRENT/` and reference the audited commit.
- Areas that could not be proven are **explicitly marked ❓/UNVERIFIED** (file `25_UNVERIFIED_ITEMS.md`) rather than assumed — candidly, the top unproven areas (webhook HMAC, FOR UPDATE, CSRF attributes, real-gateway behavior, test-suite greenness) are exactly the ones that must be verified next.
- **Audited evidence references:**
  - Git: `aa9e3d1895e849691f145d409c12b997435536b2` (master; origin in sync)
  - DB: MySQL `courtzon_v3` @3307, 330 tables, migrations through `194_membership_entitlements.sql` (202 history rows), baseline 328 tables (drift: `payment_allocations`)
  - Docker: 6/6 services healthy (backend/frontend/mysql/redis/prometheus/grafana); images built 2026-10-04
  - Runtime: `/health/version` → applicationVersion 1.0.0, expectedMigration `194_membership_entitlements`, node v22.22.3, gitCommit **unknown** (known gap)
- **Boundary honored:** no application code changed; no DB changed; no destructive action; no secrets exposed.

**Next step for the new engineer:** follow `37_HANDOVER_CHECKLIST.md` (A→H), resolve `25` items P0 first, then execute the `24` matrix P0/P1 UAT against the current local stack before considering any production move (see `35`/`36`).