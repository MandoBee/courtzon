# 10 — PAYMENT SYSTEM DEEP AUDIT

**Audit:** 2026-10-04 · Sources: `modules/payment/{application/payment.service.ts, presentation/payment.routes.ts}`, `server.ts` cron, live `payment_transactions` (1,086 rows; 1,080 paid) + `payment_allocations` (0).

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT IMPLEMENTED · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Payment methods (code + live)

- `payment_method` ENUM: `wallet`, `cash`, `card`, `bank_transfer`, `online`.
- Live distribution: card 1083, wallet 2, cash 1 (1,086 total).
- Reference types seen live: `booking` (62), `wallet_topup` (340), `subscription` (1), `tournament` (1), `booking_prepare` (2), NULL (680).
- ⏳ No `membership_subscription` reference_type rows yet (G11.22 unused).

## 2. Lifecycle (verified code)

### 2.1 Charge
`POST /payments/charge` (perm `financial.payment.charge`) → `PaymentService.charge(userId, input)`:
- `chargeByWallet` — sufficient balance check, atomically debit wallet + create payment.
- `chargeByGateway` — create Paymob intent (`createGatewayIntention`), store `payment_transactions` (status `processing`/`pending`), `idempotency_key` set.

### 2.2 Confirmation & webhook
- Gateway POST `/payments/webhook` (unauth) → `handleWebhook(payload, signature)` → `confirmPayment(paymentId)` → emit `payment:succeeded` (+ listeners: booking, marketplace, academy, wallet, tournament, registration, membership P1, accounting, entitlements).
- Admin/manual: `POST /payments/confirm` (perm confirm), refund `POST /payments/:id/refund` (perm `financial.reconcile`).

### 2.3 Sync / expiry / recovery
- `syncPendingPayments` (5-min cron) — queries gateway status for pending.
- `expireStalePayments(15)` (2-min cron) — expires stale → `expired` (6 live rows).
- `recoverPayment(gatewayReference)` — admin re-check of a gateway reference.

### 2.4 Reconciliation
- `/payments/reconciliation/run` → `reconciliation.service.ts`; history endpoint; production-readiness endpoint.
- Financial reconciliation service in `modules/financial` (`reconciliation.service.ts`) — cross-checks gateway vs db.

## 3. Idempotency & retries (verified constraints)

- `payment_transactions.idempotency_key` UNIQUE — repeated client POST dedup.
- `payment_transactions.gateway_reference` UNIQUE — duplicate webhooks safe.
- Event-level: outbox + `processed_events` + `uk_dedup` on ledger.
- Webhook retried by gateway (Network) — safely re-entrant due to unique keys.

## 4. Financial lifecycle per method

```
CASH:   terminal confirm (receptionist/admin) → payment_transactions(paid) → events
CARD:   intent (processing) → Paymob redirect → webhook → confirmPayment → paid → events
WALLET: debit wallet → payment .paid → events
FAILED: payment:failed → listeners (booking compensation, marketplace handlePaymentFailed)
EXPIRED: expireStalePayments → status expired (no postings)
REFUND: refund(paymentId, amount, reason) → payment_status refunded (+ ledger reversal + booking_cancellations)
```

## 5. Accounting treatment (verified in `accounting-event.listener.ts`)

- `refTypeToSourceType`: `booking→booking`, `order→marketplace`, `wallet_topup→wallet`, default identity (e.g. `membership_subscription` → `membership`).
- Order economics: `grossMerchandise − discount − commission = merchantNet` (2106/2202 pattern), tax liability separate, shipping payable separate.
- Booking economics: `total_amount`, `tax`, `commission_amount`, `net_amount`, `club_amount` per booking snapshot → commission to platform, net to org earning entitlement.
- Ledger: `ledger_entries` debit/credit pair per event, verified balance (`validateLedgerBalance`), projected into `general_ledger`.

## 6. What CANNOT be verified locally (❌ hard)

- Real Paymob charge + redirect + callback reconciliation (sandbox only).
- HMAC veracity against real payloads.
- Gateway settlement files / payout timing.
- Card decline/BIN/3DS behavior inside Paymob.
- Cross-border / currencies beyond EGP.
- SCA/3DS mandates on real merchant.

These are the **top UAT pairing with the real gateway** — see 24/35/36.

## 7. Known failure scenarios (see also 22 file)

| Scenario | Behavior | Status |
|---|---|---|
| Webhook twice | dedup via gateway_reference | ✅ |
| Webhook late | syncPendingPayments + recover | ✅ |
| Payment succeeds after booking expired | booking listener verifies payment status; expired booking stays expired (money may need manual refund) | 🟡 needs UAT |
| Server crash between DB write and emit | outbox relay + durable BullMQ | ✅ |
| Wallet double-spend | DB debit within tx + wallet version | ✅ |
| Refund after settlement | `settlement-correction.service.ts` present; **0 usage** | 🟡 unproven |
| Cancellation during payment | booking status guard + compensation | ✅ |
| Partial refund | refund(amount) supports amount; marketplace-refund-calc exists | 🟡 UAT |
| Rounding | DECIMAL(14,2), Math.round(×100)/100 | ✅ (unit-ish) |

## 8. Payment production readiness verdict

**🟡 PARTIALLY READY — development-level only.** Sandbox flows are implemented and idempotent; nothing is proven against the real gateway, and gateway settlement / clearing postings were never produced (0 rows). Do NOT flip `PAYMENT_GATEWAY_PROVIDER` production until: HMAC verified, refund tested, settlement tested.