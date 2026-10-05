# 36 — PRODUCTION ROADMAP

**Audit:** 2026-10-04 · From current state to real users/payments/clubs/operations.

Legend: 🟩 done · 🟨 in progress · ⬜ pending.

---

## PHASE 0 — HANDOVER / VERIFICATION (this handover)
**Prerequisites:** current commit `aa9e3d18`, DB `courtzon_v3`@194, stack healthy.
**Tasks:**
- [⬜] Read all 38 files (start with 00, 35, 36).
- [⬜] Resolve all `UNVERIFIED`/`❓` items that gate P0 (see 25).
- [⬜] Run test suites (local bash issue noted: use Git Bash/WSL for migrate/seed).
**Exit criteria:** new engineer can repo-map; unverified list triaged.

## PHASE 1 — CRITICAL BUGS & SECURITY
**Prerequisites:** Phase 0 done.
**Tasks:**
- [ ] Webhook HMAC verification + test (P0)
- [ ] CSRF/SameSite (P1)
- [ ] Permission-based admin gate (P1)
- [ ] `RELAX_RATE_LIMIT` guard (P1)
- [ ] Registration of `GIT_COMMIT` + version stamping (P2)
- [ ] Fix baseline drift (regenerate) (P0)
**Tests:** security matrix rows (24-SE-*), CI green.
**Exit criteria:** security sweep re-run passes; baseline parity verified.
**Rollback:** revert single commits; DB untouched (baseline regenerated only in CI snapshot).

## PHASE 2 — DATA / PAYMENT / ACCOUNTING INTEGRITY
**Prerequisites:** Phase 1.
**Tasks:**
- [ ] FOR UPDATE on slot & stock + race tests (P0)
- [ ] First marketplace order end-to-end (COD + online) to settlement (P0)
- [ ] First membership G11.22 purchase (cash/card/installments) (P0)
- [ ] Settlement end-to-end incl. transfers + accounting rows (P0)
- [ ] GL balance check job + ledger reconciliation (P1)
- [ ] Trace membership ledger rows (U18)
**Tests:** 24 AC-*/MP-*/MS-* rows; e2e.
**Exit criteria:** at least 1 order, 1 settlement, 1 subscription, all with correct ledger/entitlements.
**Rollback:** all money flows reversible via refunds/corrections; keep new data isolated to staging first.

## PHASE 3 — FULL SYSTEM TESTING
**Prerequisites:** Phase 2 data exists.
**Tasks:**
- [ ] Full 24-matrix manual UAT (P0/P1 rows) via real UI
- [ ] Two-window realtime; PWA offline; notification delivery verification
- [ ] Reconciliation of payments ↔ ledger ↔ entitlements
- [ ] Load smoke (30–50 RPS booking/checkout)
**Tests:** Playwright suites expanded; k6 smoke.
**Exit criteria:** matrix green; no P0/P1 new issues open.

## PHASE 4 — STAGING / PILOT
**Prerequisites:** Phase 3.
**Tasks:**
- [ ] Deploy staging (Coolify/Hostinger) from CI with `production` migration env
- [ ] Restore latest production backup → staging (validated restore)
- [ ] Sandbox merchant pilot with real org login
**Tests:** banner/maintenance mode; pilot club bookings.
**Exit criteria:** pilot club completes booking + payment(sandbox) + settlement in staging.

## PHASE 5 — LIMITED REAL USERS
**Prerequisites:** Phase 4 sign-off.
**Tasks:**
- [ ] Enable production Paymob (dev-flagged merchant) — after HMAC + merch config pass
- [ ] 1–3 pilot clubs live; monitor P0 telemetry (payments, queues, GL balance)
- [ ] Security/ops runbook on-call readiness
**Exit criteria:** stable 2 weeks; no P0/P1 incidents; real settlement succeeds.
**Rollback:** feature-flag gate; manual refund path exercised.

## PHASE 6 — PRODUCTION LAUNCH
**Prerequisites:** Phase 5 exit criteria.
**Tasks:**
- [ ] Marketing/legal/pricing sign-off (rules in 20)
- [ ] Scale checks (workers container, socket adapter if needed)
- [ ] Launch comms + support trained
**Exit criteria:** public availability.

## PHASE 7 — POST-LAUNCH MONITORING
**Tasks:**
- [ ] Dashboards/alerts (33); daily GL check; weekly settlement review
- [ ] Quarterly UAT regression (24 matrix)
- [ ] Performance EXPLAIN at 100/1000 concurrent
**Exit criteria:** SLA met; incident playbooks updated.

---

## Cross-cutting dependencies
1. Real payments depend on Phase 1 HMAC first.
2. Settlements depend on Phase 2 orders + entitlements.
3. Notifications real channels independent (can parallel-track).
4. Any migration AFTER this audit must: add file → run → **regenerate baseline** → record. Failing that reopens the D1 drift.