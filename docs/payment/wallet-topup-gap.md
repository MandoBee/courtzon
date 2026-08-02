# Wallet Top-Up Payment Integration Gap

**Status:** ✅ ACCEPTED — fixed (2026-08-02). See resolution below and `docs/payment/wallet-card-payment.md`.
**Severity:** High — wallet top-up via Paymob will fail at the webhook stage
**Date identified:** 2026-07-26
**Affected flows:** `POST /wallets/deposit` (both V1 and V2 feature-flag paths)

---

## Resolution (2026-08-02)

Fixed per the plan in this document:

1. `wallet.service.deposit()` now calls `paymentService.createGatewayIntention()` **before** any gateway interaction, which inserts a `payment_transactions` row with `reference_type = 'wallet_topup'` and returns `{ paymentId, clientSecret }`. The deprecated `depositV2()` path was removed (both paths were identical).
2. New listener `backend/src/modules/wallet/application/wallet-payment.listener.ts` subscribes to `payment:succeeded` (filtered on `referenceType === 'wallet_topup'`), credits the wallet via the `DepositWallet` command + `createWalletTopup` ledger entry (keyed on `source_type='wallet_topup'` / `source_id=paymentId` for idempotency), and emits `wallet:deposit` for realtime cache refresh. Registered in `server.ts` after the booking listener.
3. The frontend player WalletPage now uses the shared `PaymobPixelCard` + `usePaymentConfirm` + `PaymentStatusPoller` flow (same as booking/marketplace) instead of the iframe redirect, and aligns its React Query keys (`['wallet','me']`, `['transactions']`) with the realtime cache invalidator.
4. Realtime wallet event names corrected to match the socket mapper (`wallet.deposit` / `wallet.withdrawal`).
5. `GET /wallets/my` and `GET /wallets/my/transactions` aliases added so the e2e wallet suite targets real endpoints.

The webhook / `sync_pending_payments` / `confirm` paths all resolve the payment row and run `_processPaymentOutcome()`, which now emits `payment:succeeded` for the wallet listener to credit.

---

## Problem

When a user tops up their wallet via Paymob, the `charge()` call always returns `status: 'pending'` (the Paymob Intention API never returns a synchronous success — it always requires a webhook callback). Because no `payment_transactions` row is created upfront, the webhook handler cannot locate the payment and fails with `NotFoundError('Payment transaction')` → HTTP 404.

**Net effect:** Wallet top-up via card is permanently broken in the webhook path. Users are redirected to Paymob, complete payment, but the wallet balance is never credited.

---

## Root Cause

### V1 path (`wallet.service.deposit()`)

```ts
// wallet.service.ts:55
const paymentResult = await paymentGateway.charge(paymentRequest);

if (paymentResult.success && paymentResult.status === 'paid') {
  // Credit wallet — NEVER REACHED (status is always 'pending')
}
// Falls through to redirect response
```

`paymentGateway.charge()` → `paymobGateway.chargeByIntention()` creates an Intention and returns `{ status: 'pending' }`. The `if` block that credits the wallet is never entered. No `payment_transactions` row is written.

### V2 path (`wallet.service.depositV2()`)

```ts
// wallet.service.ts:159
const paymentResult = await paymentGateway.charge(paymentRequest);
if (!paymentResult.success || paymentResult.status !== 'paid') {
  // Always true — returns redirect response
}
```

Same issue: always returns redirect. No `payment_transactions` row.

### Webhook arrives

```ts
// payment.service.ts:handleWebhook()
const preCheck = await pool.execute(
  `SELECT ... FROM payment_transactions WHERE gateway_reference = ? ...`,
  [resolvedGatewayRef, resolvedGatewayRef, ...]
);
// preCheck is empty → throws NotFoundError('Payment transaction')
// Returns HTTP 404 to Paymob
```

Paymob expects HTTP 200. A 404 may trigger retry delivery, which will also fail.

---

## Why Booking & Marketplace Don't Have This Problem

Court bookings and marketplace orders create a `payment_transactions` row **before** calling the gateway:

```
paymentService.initiatePayment()
  → INSERT INTO payment_transactions (gateway_reference, ...) VALUES (?, ...)
  → paymentGateway.charge()
  → returns pending → user redirected
  → webhook arrives → finds the row → _processPaymentOutcome() → emits events
```

Wallet top-up bypasses `paymentService.initiatePayment()` entirely.

---

## Fix Required (not implemented)

1. **Before** calling `paymentGateway.charge()`, create a `payment_transactions` row via `paymentService.initiatePayment()` (or equivalent insert) so the webhook can find it.
2. Add a listener for `wallet:deposit` events OR route wallet top-up through `_processPaymentOutcome()` when the webhook arrives.
3. Ensure `referenceType: 'wallet_topup'` is handled by the payment outcome pipeline (currently only `booking` and `order` have listeners; wallet would need its own or a generic credit handler).

### Minimal fix sketch

```ts
// In wallet.service.deposit(), BEFORE paymentGateway.charge():
const paymentRow = await paymentService.initiatePayment({
  userId,
  amount,
  currency: wallet.currencyCode,
  referenceId: wallet.id,
  referenceType: 'wallet_topup',
  paymentMethod: paymentMethod,
});
// paymentRow now has a gateway_reference that the webhook can match

const paymentResult = await paymentGateway.charge({
  ...paymentRequest,
  // Ensure the gateway reference matches the payment_transactions row
});
```

Then in the webhook handler, when `referenceType === 'wallet_topup'`:
- Credit the wallet balance
- Emit `wallet:deposit` event
- Log the transaction

---

## Scope Impact

- **Membership purchases:** Not affected (direct DB insert, no Paymob)
- **Tournament entry fees:** Not affected (no payment logic)
- **Academy enrollments:** Not affected (no payment logic)
- **Court bookings:** Working correctly (uses `initiatePayment()`)
- **Marketplace orders:** Working correctly (uses `initiatePayment()`)
- **Wallet top-up:** BROKEN — needs fix before production use

---

## Recommendation

Fix this before enabling wallet top-up for end users. If wallet top-up is not yet launched, this can remain as documented technical debt. If it is live, this is a **P0 bug** — users paying via card will lose money without wallet credit.
