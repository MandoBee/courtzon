# 37 — FINAL HANDOVER CHECKLIST

**For the engineer taking over CourtZon.** Check each box only when you understand & verified the referenced artifact. Work in the given order.

---

## A. Environment & source
- [ ] I can run `docker compose ps` and see 6 healthy services (backend/frontend/mysql/redis/prometheus/grafana).
- [ ] I can identify the audited commit: `git log -1` == `aa3e9d18` (message: membership lifecycle P3).
- [ ] I know `GET /health`, `/health/version`, `/health/socket` outputs (expectedMigration=194_membership_entitlements).
- [ ] I know migration semantics: `migration_history` (202 rows), `direction`, `filename` UNIQUE, migration-guard fail-closed, `COURTZON_MIGRATION_ENV`.
- [ ] I know the DB drift: baseline is missing `payment_allocations` (M178) — and that any fresh import without it breaks recurring series.

## B. Architecture & project
- [ ] I can draw the request path (browser→nginx→fastify→service→repo→MySQL→events→outbox→BullMQ→workers→socket).
- [ ] I know `server.ts` boot order (handlers, providers, cron, realtime, outbox, listeners) and the 30+2 queue setup.
- [ ] I know the module pattern (presentation/application/domain/infrastructure + __tests__) and the 55 modules.
- [ ] I know the event model: EventBusV2 + `processed_events` + outbox + durable queues (`bull:entitlement-*`, `bull:accounting-replay`).

## C. Database
- [ ] I know the 330-table layout, key domains, and their UNIQUE idempotency keys.
- [ ] I know tenancy (org→branch→resource; user_role_scopes; guards).
- [ ] I know two ledger systems (`ledger_entries`+`general_ledger` live; `financial_journal_entries` dormant).
- [ ] I know seeds 001–007 and that 004/005/006 are NOT part of 001_baseline.

## D. APIs & permissions
- [ ] I have read `05_API_INVENTORY.md` (1289 endpoints) and know the biggest surfaces (`organisation` 86, `tournament` 80, `academy` 77).
- [ ] I know auth endpoints & session flow (5/identifier brute-force, 30/min refresh, single-flight).
- [ ] I know how to add a permission (registry → sync script → role templates → `<Can>` + `requirePermission`).
- [ ] I know the frontend `/admin` gate uses hardcoded role lists (flagged risk).

## E. Business flows
- [ ] Booking lifecycle incl. statuses, expiry (15-min), cancellation/refund, series, matchmaking.
- [ ] Payment lifecycle (wallet/cash/card, webhook, dedup, sync, recover, expire, reconcile).
- [ ] Accounting: per-event debit/credit (34 file), balance validation, replay.
- [ ] Marketplace: product→cart→checkout→orders→stock→fulfilment→complaints→settlement.
- [ ] Memberships: legacy vs G11.22 (plans/versions/subscriptions/installments/entitlements).
- [ ] Subscriptions (org): expire/remind workers; no trial/grace.
- [ ] Notifications: 130+ events, categories, channels (in-app real; push/SMS mock), digests, DLQ.
- [ ] Realtime rooms & room-join model + stale-UI caveats.

## F. Money-path knowledge
- [ ] I know settlement has **0 live rows** and marketplace orders **0** and membership subscriptions **0** — highest UAT priorities.
- [ ] I know FOR UPDATE carries, CSRF, HMAC verification are unproven (see 25/29).
- [ ] I know real Paymob is sandbox-only; SMS/Push mock.

## G. Ops
- [ ] I know compose services, ports, volumes, healthchecks, monitoring stack.
- [ ] I know migrate/seed require bash (WSL/Git-Bash on Windows).
- [ ] I know backups (`backup.js`) and prod note about `COURTZON_MIGRATION_ENV=production`.
- [ ] I know `GIT_COMMIT` is `unknown` (traceability gap) and how to fix.

## H. Readiness
- [ ] Verdict understood: CONDITIONALLY READY (not ready for money today).
- [ ] I have the P0/P1/P2/P3 action list (35) and roadmap (36).
- [ ] I have the full test matrix (24) and know how to run manual UAT rows.

## Final sanity
- [ ] I can answer the 16 self-verification questions from `00_FINAL_HANDOVER_REPORT.md` §Checklist.
- [ ] I have not modified application code, DB, or seeds while taking handover (read-only by design).