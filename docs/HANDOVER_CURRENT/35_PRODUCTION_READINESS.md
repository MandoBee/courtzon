# 35 — PRODUCTION READINESS

**Audit:** 2026-10-04 · Verdict below is evidence-based, not marketing.

---

## VERDICT: ⚠️ CONDITIONALLY READY — not ready for real users/money today

The platform is **feature-complete on paper** but **data-evidence-starved for money** and has **known integrity risks**. Tests passing locally does not equal production readiness.

### Why not "Ready"

1. Real payment gateway never exercised (Paymob sandbox; 0 merchant transactions).
2. Settlement & clearing pipeline has **zero records** ever.
3. Marketplace checkout→order→settlement **never ran** (orders=0).
4. New membership billing model (G11.22) **never purchased** (subscriptions=0).
5. Baseline SQL drift: `payment_allocations` missing → fresh deployments break.
6. Push/SMS/WhatsApp providers = mocks.
7. Concurrency (slot/stock lock), CSRF, HMAC verification unproven.
8. Leadership/ops visibility (traces, retention, dashboards) incomplete.

---

## Action gate by priority

### P0 — MUST FIX BEFORE REAL USERS
| # | Action | Evidence ref |
|---|---|---|
| 1 | Verify & test payment webhook HMAC; align keys | U1, 29 |
| 2 | Run a real Paymob **sandbox-to-prod** pilot (charge→callback→refund) | U2 |
| 3 | Execute end-to-end settlement (booking & a new marketplace order) — produce first `settlements` rows | U3/U4 |
| 4 | Regenerate baseline so `payment_allocations` is included | D1 |
| 5 | Decide + document money-path concurrency (FOR UPDATE on slot/stock) with race tests | U6 |
| 6 | Fix eligibility: block real users until payment+settlement flows verified | — |

### P1 — SHOULD FIX IMMEDIATELY
| # | Action |
|---|---|
| 1 | CSRF / SameSite cookie review + enforce |
| 2 | Permission-based frontend admin gate (remove role-list guards) |
| 3 | CI guardrail: forbid `RELAX_RATE_LIMIT=true` in any prod-flagged env |
| 4 | Trace `ledger_entries` membership rows source (U18) |
| 5 | Confirm report generators read `ledger_entries`/`general_ledger` (not `financial_journal_entries`) |
| 6 | Late-webhook / payment-after-expiry test + decision policy |
| 7 | Org subscription wire trial/grace or explicitly de-scope |

### P2 — IMPORTANT (before scale)
| # | Action |
|---|---|
| 1 | Real SMS/Push integration or explicit "unavailable" flag |
| 2 | Socket.IO Redis adapter + worker container split |
| 3 | Permission cache to cut auth middleware DB round-trips |
| 4 | GL balance nightly check + alerting |
| 5 | Notifications template/event drift check; DLQ alerting |
| 6 | OTP for phone verification; i18n completeness |
| 7 | Ledger/general_ledger partitioning + index EXPLAIN pass |

### P3 — FUTURE
| # | Action |
|---|---|
| 1 | Migration renumbering; V2 cleanup; S3 storage; BI/CRM/HR activation; 2FA |

---

## Gate definitions for "Ready"

Exit criteria (all must pass green):
1. P0 items 1–5 verified with UAT evidence (rows + screenshots + balance audits).
2. Sandbox merchant UAT on booking/payment/marketplace/membership/settlement — see `24` matrix (P0/P1 rows).
3. Test suites green: `npm test`, `npm run test:int`, Playwright smoke, `node scripts/ci-validate.js`.
4. Security sweep re-run (webhook HMAC, CSRF, cross-org, role gates).
5. Ops runbook exercised (backup→restore, migration apply, health/monitoring).
6. Business sign-off on rules in `20_BUSINESS_RULES.md` (⚖️ items).