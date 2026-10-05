# 23 — TESTING AUDIT

**Audit:** 2026-10-04 · Counts from repository inventory (not executed in this audit — no test run performed; see Unverified section).

Legend: ✅ PRESENT · 🟡 PARTIAL · ❌ MISSING · ❓ UNVERIFIED

---

## 1. Test counts (disk evidence)

- Backend spec files: **419** (`*.spec.ts`), of which **149** `*.integration.spec.ts` (Testcontainers-backed MySQL+Redis).
- Frontend test files: **100** (Vitest+jsdom; e.g. `Can.test.tsx`, `useRealtimeCacheUpdates*.test.tsx`, toast tests, appBadge, notificationSound).
- E2E: Playwright configured (`playwright.config.ts`, `e2e/` dir); last `test-results/.last-run.json` = `passed`, no failed tests (2026-10-02). **Number of executed tests unknown.**

## 2. Distribution (backed up by module counts; top areas)

tournaments 65 · booking 53 · financial 43 · notifications 25 · academy 24 · marketplace 21 · organisations 21 · payment 14 · accounting 13 · activities 12 · wallet 11 · settlement 11 · match-result 10 · membership 10 · match 9 · rbac 7 · scheduling 7 · auth 7 · realtime 4 · security 4 · time 3 · others…

## 3. What the layers prove (or not)

| Layer | Proves | Limits |
|---|---|---|
| Unit (`*.spec.ts`) | service/domain invariants (e.g. slot-generator, booking-window policy, recurring-series R5B, tournament settlement G11.4, accounting entry events) | no DB/endpoint integration |
| Integration (`*.integration.spec.ts`, Testcontainers) | repository + service + DB behavior; real SQL flows (subscription-cash-accounting, settlement-correction, recurring-series-payment R5B) | heavy setup; not part of npm test (separate script) |
| Frontend unit | components/stores/selectors | no browser |
| Playwright E2E | full UI journeys | **minimal/empty now** (e2e/ almost empty) |

## 4. Critical untested areas (evidence)

- ❌ Full membership G11.22 purchase→installment→entitlement E2E (no live data, and no integration spec found beyond service unit).
- ❌ Marketplace checkout→order→settlement chain E2E (orders=0 live, no commerce E2E spec found).
- ❌ Real Paymob webhook (only mocks).
- ❌ Concurrency: double-booking race, double-stock race (unit specs exist for blocks but no race integration).
- ❌ CSRF/XSS/SQLi security suite (security specs exist in `security` module? — 4 files; not comprehensive).
- ❌ DST boundary suite.
- ❌ GL balance/audit reconciliation automated check.
- ❌ Two-window socket E2E.

## 5. False confidence areas

- Release notes claim "all 26 roles synced, zero drift" — **not re-verified in this audit** (DB snapshot could drift after new permissions added).
- `.last-run.json` passed with `failedTests:[]` — if the suite executed near-zero tests it gives false assurance. **Verify `test:e2e` actually enumerates journeys.**
- Testcontainers integration suite cleans data via explicit deletes — assertion on that path is fragile.

## 6. Missing-test priority list (→ 24 matrix)

1. Booking: race double-booking FOR UPDATE; payment-after-expiry.
2. Payments: HMAC wrong signature; duplicate + late webhook; partial refund.
3. Accounting: GL balance for booking/marketplace/membership; refund reversal; settlement post-payment correction.
4. Membership: purchase cash+card, installments, overdue, grace, cancel, refund, entitlement release, renewal.
5. Marketplace: checkout, stock race, refund on COD/online, complaint escalation.
6. Realms: Socket two-window; reconnect room re-join; PWA offline.
7. Security: org-isolation cross-access, rate-limit, brute-force, CSRF.

## 7. Status verdict

Test suite is **substantial and focused on the hard parts** (tournaments, G11 accounting), but money-path E2E / gateway / concurrency coverage is thin relative to the platform's surface. Treat current green outputs as **necessary, not sufficient** for production.