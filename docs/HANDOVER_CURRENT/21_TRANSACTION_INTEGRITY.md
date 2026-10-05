# 21 — TRANSACTION INTEGRITY AUDIT

**Audit:** 2026-10-04 · Analysis of critical multi-step operations.

Legend: ✅ VERIFIED SOUND · 🟡 RISK-FLAGGED · ❌ HOLES FOUND · ❓ UNVERIFIED · ⚖️ DECISION

---

## 1. Booking + Payment

| Aspect | Finding |
|---|---|
| Transaction boundary | booking create (INSERT bookings+slots) typically one tx. Payment creation separate tx. |
| Commit/rollback | Service-managed `BEGIN/COMMIT/ROLLBACK`. |
| afterCommit | ❓ no explicit afterCommit helper; events may be emitted after writes inside the same call — verify ordering per listener. |
| Idempotency | booking status guards; payment dedup unique keys. |
| Race | two users same slot (see 09): optimistic only, **no verified FOR UPDATE** → ❌ risk. |
| Recovery | cancel_expired_bookings + compensation listener. |

## 2. Payment + Accounting

| Aspect | Finding |
|---|---|
| Boundary | payment confirmed → emit allocation: `payment:succeeded`. Accounting listener runs separately but with **per-entity in-process mutex** + `uk_dedup` → idempotent even on double trigger. |
| Race | two in-process triggers (payment:succeeded AND booking:paid) serialized by mutex. Cross-process safe via unique. ✅ |
| Rollback | ledger insert is the single truth; a lost posting is repaired by replay (`accounting-replay`) ❓ (verify replay completeness). |

## 3. Marketplace + Inventory

| Aspect | Finding |
|---|---|
| Boundary | checkout → orders INSERT + stock decrement in one service call; exact tx boundary ❓ |
| Overselling | relies on app check + reserved_quantity; **no verified FOR UPDATE** → ❌ concurrent buyers risk oversell. |
| Recovery | abandoned order worker (30-min) releases reserved stock? (❓ item-level verification). |

## 4. Refund + Accounting

| Aspect | Finding |
|---|---|
| Boundary | refund() updates payment_transactions → events → ledger reversal via same idempotent path; booking_cancellations processed. ✅ |
| Race | double refund blocked by payment status transitions + unique keys ❓ (payment status NOT in (refunded) before refund allowed). |

## 5. Settlement + Accounting

| Aspect | Finding |
|---|---|
| Boundary | settlement lifecycle (requested→…→paid) + entitlement linking + `settlement_transfers`. |
| Race | 0 live rows → unproven. `settlement-correction.service.ts` exists for post-payment edits. 🟡 |
| Idempotency | `settlement_entitlements.entitlement_id` UNIQUE → one settlement per entitlement ✅ schema-level. |

## 6. Subscription + Payment

| Aspect | Finding |
|---|---|
| Boundary | membership subscription → payment → P1 listener finalize → active. Installments one-per-seq unique. ✅ |
| Race | two payment paths (cash+card) on same subscription: guarded by payment_status transitions; installments have `(subscription_id,seq)` unique. ✅ mostly |
| Recovery | overdue sweep + reminders. ✅ |

## 7. Cross-cutting issues

| # | Finding | Severity |
|---|---|---|
| T1 | No explicit transaction-boundary framework; service-managed patterns are easy to slip | MED |
| T2 | Event emission may precede commit in some services (verify; outbox exists but only durable for subscribers that use it) | MED |
| T3 | FOR UPDATE missing on slot & stock | HIGH |
| T4 | Settlement & membership money flows have 0 evidence | HIGH (validation gap) |
| T5 | No distributed trace across queue jobs (requestId not propagated to jobs) | LOW |
| T6 | Concurrency tests exist? — unit specs for recurring series + settlement correction exist; **no dedicated race test suite found** | MED |

## 8. Recommended hardening
1. Introduce `db.afterCommit(fn)` helper used by every mutation that emits events.
2. Add `SELECT ... FOR UPDATE` on booking slot & product stock rows.
3. Verify all `processed_events`/replay completeness with a balance audit job.
4. Add cashier/operator double-submit protection at UI + API (idempotency token on cash confirm).
5. Add a nightly GL-balance-check job (sum debits=credits, reconcile to payments).