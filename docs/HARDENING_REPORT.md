# CourtZon V3 — Final Hardening Report

**Scope:** Wallet / refund / reservation money-invariant hardening (W1–W4, R4, Finding 6, P3 housekeeping)
**Date:** 2026-08-29
**Status:** ✅ COMPLETE — all targeted fixes verified, deployed, and pushed
**Commit:** `3fb51f8` (pushed to `origin/master`)
**Branch:** `master`

---

## 1. Business Analysis

The 6 MUST-FIX findings and 4 P3 housekeeping items target the four paths where CourtZon could, under failure or defect, mutate money incorrectly:

| Finding | Business effect before fix |
|---|---|
| **W1** | COD booking: cash double-entry drifted to the *buyer's wallet* (`is_cash=1`), irreversibly inflating wallet balances with no actual credit event (F-2 violation). |
| **W2** | Wallet `available = balance` ignored `reserved_balance` (pending withdrawals); a charge could spend the same funds a withdrawal already reserved → overdraw. |
| **W3** | Withdrawal completion/reject-release ignored `affectedRows`; a missing or concurrently-modified wallet row was treated as success → funds lost or reservations leaked. |
| **W4** | Booking + marketplace refunds changed state (`cancelled`/`refunded`) *before* money moved; a failed gateway/wallet refund was swallowed (`log.error` + return), so orders claimed refunded while the gateway kept the funds. |
| **R4** | `paymentService.refund` had no wallet branch → wallet-paid bookings could never be refunded through the canonical admin path; succeeded via booking route only. |
| **F6** | Entitlement listener swallowed commission-calculation failure → entitlement revocation silently skipped. |
| **P3-9** | Booking refund cap ignored the tax component of the booking total → partial refund could exceed the economically refundable amount. |

Downstream impact analysis: the wallet is the single money ledger for users; bookings and marketplace orders are the two largest revenue flows. Both touch `payment_transactions`, `wallet_transactions`, and double-entry ledgers. Reordering money-first and adding idempotency anchors was chosen over redesign, per the "extend, never redesign" rule.

## 2. Root Cause (if bug)

| Finding | Root cause |
|---|---|
| W1 | COD helpers appended a canonical cash double-entry into `user_wallets` and `wallet_transactions` (using `is_cash=1` outside `createTransaction`, bypassing its wallet-credit semantics), plus `_refundCODWallet` emitted `wallet:transaction` without any wallet mutation. |
| W2 | `lockAndGetBalance` did not `SELECT reserved_balance`, so callers could not compute availability; `chargeByWallet` compared against full balance. |
| W3 | `UPDATE ... WHERE id = ? AND version = ?` (and `WHERE id = ?`) results were not checked; `affectedRows === 0` (missing row, version conflict, already-released) returned success with no funds moved. |
| W4 | `cancelBooking` committed state first, then failed refunds were logged-and-returned; `updateOrderStatus` mutated the order then swallowed refund failures; wallet `_processOrderRefund` had no idempotency anchor. |
| R4 | `paymentService.refund` only implemented card/gateway; wallet payments had no canonical refund path. |
| F6 | `commitBooking` catch block logged and returned instead of rethrowing. |

**All six are code defects, not schema defects.** The production baseline is correct and was not modified.

## 3. Architecture Impact

- **Classification:** Bug Fix + targeted hardening (extending existing architecture; no redesign).
- Booking refund helpers were a "record-only" reimplementation of the money ledger as data — converted to **single-authority**: only `updateBalance` + `createTransaction` (with a `conn` for atomicity) mutate wallet/ledger rows.
- `lockAndGetBalance` now returns the reservation-aware account state `{ balance, reserved_balance, version }`; availability is computed at the money-authority layer, not by callers.
- Idempotency anchors: wallet refunds for bookings use the pre-existing `uq_wallet_txn_ref` unique on `(reference_type, reference_id)`; marketplace uses `order_refund` pseudo-type so a charge's `('order', orderId)` row cannot be reused by a refund.
- R4 wallet branch is atomic inside `withTransaction`: version-locked credit → anchor row → `paid → refunded` guard → canonical `payment:refunded` event.
- The card branch of `paymentService.refund` is intentionally unchanged (multi-seller group card refunds legitimately refund one payment multiple times).

## 4. Database Impact

- **No schema or DDL changes.** No migration added, baseline untouched.
- Relies on existing constraints:
  - `user_wallets.UNIQUE(uk_wallet_user)`, `is_locked`, `version` column.
  - `wallet_transactions.UNIQUE uq_wallet_txn_ref (reference_type, reference_id)` (baseline line 6261).
  - MySQL unique index allows multiple NULLs → the R4 `payment_refund` anchor is safe for multiple refunds of the same payment (only one anchor row per `(payment_refund, paymentId)`, unique pair first-write-wins).
- Historical-data policy respected: no destructive FKs touched; `payment_refund` and `order_refund` rows are per-event anchors that never cascade.

## 5. RBAC Impact

- No new endpoints, pages, buttons, or fields added.
- Existing guard keys already cover the mutated routes (`payments.refund`, `bookings.cancel`, `marketplace.order.manage`, etc.). No new permission keys registered; UI registry count unchanged (805).
- Defense-in-depth unchanged — these are service-layer API changes, not new surfaces.

## 6. Realtime Impact

- No new socket events. Realtime consumers of the existing events (`wallet:transaction`, `booking:refunded`, `payment:refunded`, `booking.cancelled`, order-status events) receive the *same* payloads on success, now with the guarantee that money moved before the event fires — eliminating the "state says refunded, wallet unchanged" UI lie.
- Wallet balance broadcasts triggered by the canonical `wallet:transaction` event now reflect the true ledger.

## 7. Notification Impact

- **Strategy preserved.** No business module sends notifications directly; all flow through Domain Events (config table: `notification_categories.is_active`, rate limits, quiet hours, channels, retention — unchanged).
- Behavioral change: `payment:refunded` / `booking:refunded` now only fire after money has actually moved and the transaction row was written, so the "refund processed" notification can no longer precede a failed refund. The R4 emit carries the F-12 contract fields (`paymentId`, `userId`, `amount`, `reason`, `traceId`, `referenceType`, `referenceId`, `metadata`).
- Failed refunds now **surface as errors** (API 500 + audit), not as silent skips → no false-success notifications.

## 8. Audit Impact

- Every mutation path still flows through the command/saga infrastructure.
- New failure modes are **auditable and recoverable**: W3 thrown errors leave the withdrawal request `pending` (operator-visible); W4 throws leave the booking `cancelled` with `payment_status='paid'`/`refunded_amount=0` (recoverable via `POST /payments/:id/refund`); R4 duplicates are rejected by the unique anchor and the `payments` route logs.
- `_processRefund` writes the canonical `wallet:transaction` + booking refund accounting so the double-entry ledger and the recorded audit trail match the wallet ledger exactly.

## 9. API Changes

| Endpoint | Change |
|---|---|
| `POST /payments/:id/refund` | Now supports wallet-paid payments (R4): atomic credit + anchor row + `paid→refunded`; rejects duplicates. Card behavior unchanged. |
| `POST /bookings/:id/cancel` | Refund failures now throw (HTTP 500 with booking state intact) instead of silent success. |
| marketplace order status/refund endpoints | Same money-first semantics; wallet refunds idempotent on retry. |
| Internal `chargeByWallet` | Now rejects when `available = balance - reserved_balance < amount` (`ConflictError "Insufficient available wallet balance"`). |
| No new routes, no version changes, DTOs unchanged. | |

## 10. UI Changes

- **None.** No screens, components, fields, or copy changed.
- Users see correct final states (wallet not inflated, refund failures surface as actionable errors) rather than the previous silent success.

## 11. Translation Changes

- **None.** No user-facing strings added or changed; translation registry untouched (1678 keys).

## 12. Modified Files

### Source
| File | Change |
|---|---|
| `backend/src/modules/booking/application/booking.service.ts` | W1: COD helpers record-only (`_recordCODWalletEntry`, `_recordCODWalletTransaction`, `_settleCODWallet`, `_refundCODWallet`); `_computeRefundCap` (total + tax − already-refunded); W4: `_processRefund`/`_processGatewayRefund` money-first + throw. |
| `backend/src/modules/wallet/infrastructure/repositories/wallet.repository.ts` | W2: `lockAndGetBalance` selects/returns `reserved_balance`. |
| `backend/src/modules/payment/application/payment.service.ts` | W2: `chargeByWallet` availability check; R4: `refund` wallet branch (withTransaction). |
| `backend/src/modules/wallet/application/withdrawal.service.ts` | W3: completed-debit + reject/release check `affectedRows === 0` → throw. |
| `backend/src/modules/marketplace/application/marketplace.service.ts` | W4: `updateOrderStatus`/`_processOrderRefund` money-first + throw; wallet idempotency skip via `findTransactionsByReference('order_refund', orderId)`. |
| `backend/src/modules/financial/application/entitlement-booking.listener.ts` | F6: rethrow commission failure (BullMQ retry path). |

### Tests (new)
| File | Coverage |
|---|---|
| `backend/src/modules/booking/__tests__/hardening-booking-refund-money.spec.ts` | W1 + W4 booking integration (6 tests). |
| `backend/src/modules/payment/__tests__/hardening-payment-refund.spec.ts` | R4 wallet-refund integration (2 tests). |
| `backend/src/modules/payment/__tests__/hardening-chargebywallet-reservation.spec.ts` | W2 availability (3 tests). |
| `backend/src/modules/financial/__tests__/hardening-entitlement-rethrow.spec.ts` | F6 rethrow (2 tests). |
| `backend/src/modules/wallet/__tests__/hardening-legacy-withdraw-reservation.spec.ts` | W3 affectedRows (updated mock + new cases). |

## 13. Database Migrations

- **None added.** `migration_history` latest applied = `147_subscription_revenue_account.sql` (= `expectedMigration` 147). Verified by direct DB query (155 history rows incl. prior `down` records).
- Docker DB `courtzon_v3` requires no data changes.

## 14. Verification

| Check | Result |
|---|---|
| Backend unit+integration suite (`npm test`, vitest) | ✅ **167 files / 1448 tests passed** (was 1433 → +15 new) |
| Hardening/regression subset (12 specs incl. F-12/F-13/refund/COD/replay) | ✅ **68 / 68 passed** |
| Affected-module suites (financial+wallet+booking; payment+marketplace+financial) | ✅ 463 / 463 and 455 / 455 passed |
| Backend build (`npm run build`) | ✅ clean, 1678 translation keys generated |
| CI validator (`node scripts/ci-validate.js`) | ✅ **226 errors — identical to pre-change baseline** (193 SQL-outside-repo + 31 presentation DB + 1 legacy eventBus check + 1 legacy import; all pre-existing, none introduced) |
| Frontend | not touched; `npm run build` not required |
| NEW tests exercised the failure paths directly (locked wallet, missing reservation row, duplicate refund, no-payment-record booking, gateway-fail booking) | ✅ all verified |

## 15. Docker Health

| Check | Result |
|---|---|
| `docker compose build backend` | ✅ rebuilt with `3fb51f8` |
| `docker compose up -d backend` | ✅ container recreated |
| `GET http://localhost:3000/health` | ✅ `status: ok`, DB latency 6ms, Redis ok, memory 19% |
| `GET http://localhost:3000/health` (HTTP) | ✅ 200 |
| `GET http://localhost:5173` | ✅ 200 |

## 16. Commit Hash

- **`3fb51f8`** `fix(financial): hardening — refund/wallet invariants, reservation integrity, entitlement rethrow`
- Pushed to `origin/master`; working tree clean; local files, Docker image, and Docker DB all at the same code. Hostinger auto-deploys from `master` (CI/CD).

## 17. Residual Risks & Deferred Items

| Item | Status | Rationale |
|---|---|---|
| Multi-seller group **card** sibling double-refund window | Residual (documented) | If a group card order is refunded, a sibling retry re-invokes the gateway refund — no refund-execution queue prevents that specific duplication. Out of scope: requires a refund-execution queue + gateway idempotency keys. All other group-card paths are already idempotent (`_findPaymentForOrder`, paid→refunded guard). |
| P3-7 settlement `paidAmount` snapshot | Deferred | Would change settlement payment semantics; no current defect. |
| P3-8 payroll paid-GL posting | Deferred | Requires a payroll-specific accounting event mapping. |
| P3-10 raw-SQL dedup for concurrent double-refunds | Deferred | Concurrency now protected by `withTransaction` + version locks + unique anchors; raw SQL dedup adds fragility. |
| P3-9 booking refund tax | **Covered** | `_computeRefundCap` = `total_amount + tax_amount − already-refunded`. |

## 18. Can CourtZon Now Safely Prevent the Four Failure Classes?

| Failure class | Can CourtZon prevent it now? | Mechanism |
|---|---|---|
| **(a) Wallet inflation** | **YES** | COD cash no longer performs any wallet mutation (`_refundCODWallet` capped, record-only); the only wallet write paths that credit are `updateBalance` version-locked inside `withTransaction` + canonical `createTransaction`. W1 tests prove no `wallet_transactions` row and no balance drift on COD refund; repeated cancel is rejected. |
| **(b) Spending reserved funds** | **YES** | `lockAndGetBalance` returns `reserved_balance`; every charge path checks `available = balance − reserved_balance` and throws `ConflictError` on shortfall. W2 + legacy-withdraw W3 tests prove reserved funds are not spendable and that a missing reservation row aborts with the request left `pending`. |
| **(c) False successful refunds** | **YES** | Money-first ordering (W4) + throw-on-failure means `refunded`/`cancelled` state is only reachable after the wallet/gateway refund actually persisted. Wallet refunds are idempotent via `uq_wallet_txn_ref` (`payment_refund` / `order_refund`) plus `findTransactionsByReference` skip; `paymentService.refund` is atomic in a transaction. Gateway failures now surface as errors instead of silent skip. Booking no-payment-record and gateway-fail tests assert the pre-fix success behavior is gone. Residual: the group **card sibling** double-refund window in §17 (not a false success — a documented double-charge edge). |
| **(d) Entitlement loss** | **YES** | F6 rethrows commission-calculation failure; BullMQ retries the job instead of silently dropping the revocation; idempotent-skip behavior preserved when data is consistent. |

## 19. Financial Data / Schema Integrity Statement

- **No financial data was modified, migrated, backfilled, or remediated in this task.**
- **No schema changes** (DDL) were introduced; the baseline (`database/baseline/001_courtzon_v3.sql`) is unchanged; no migrations added.
- All fixes are **code + verification** only: existing money ledgers keep their historical records intact; the unique anchors only become relevant on future write attempts.
- `user_wallets`, `wallet_transactions`, `payment_transactions`, and double-entry ledgers remain structurally and data-wise untouched — the fix prevents *future* incorrect mutations, it does not rewrite the past.