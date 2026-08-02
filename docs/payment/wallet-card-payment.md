# Wallet Card Top-Up Payment Flow

**Status:** Implemented (2026-08-02)
**Related:** `docs/payment/wallet-topup-gap.md` (resolved)

This document describes how wallet top-up via card (Paymob) works after the webhook gap was closed.

---

## Flow Overview

```
Player → POST /wallets/deposit {amount, paymentMethod:'card'}
   │
   ▼
wallet.service.deposit()
   ├─ getMyWallet()
   ├─ paymentService.createGatewayIntention(userId, {
   │     referenceType: 'wallet_topup',
   │     referenceId: wallet.id, amount, currency, paymentMethod:'card',
   │     customerName/Phone/Email })
   │     └─ INSERT INTO payment_transactions (reference_type='wallet_topup', status='pending', gateway_reference=…)
   │        └─ returns { paymentId, clientSecret }
   │
   ▼
POST /wallets/deposit → 200 { success:false, paymentId, clientSecret, publicKey, status:'pending' }

Player WalletPage (frontend)
   ├─ opens <Modal> with PaymobPixelCard (clientSecret)
   ├─ onComplete → POST /payments/confirm { paymentId }
   │     └─ if confirmed → invalidate cache, success toast
   │     └─ else → PaymentStatusPoller on GET /payments/status/:id (webhook will settle)
   ▼
Payment marked 'paid' (webhook / confirm / sync_pending_payments)
   └─ _processPaymentOutcome() emits payment:succeeded {paymentId, referenceType:'wallet_topup', amount, metadata.userId}
        └─ wallet-payment.listener credits wallet (idempotent) + emits wallet:deposit
             └─ frontend realtime invalidates ['wallet'] / ['transactions']
```

---

## Backend

### `backend/src/modules/wallet/application/wallet.service.ts` — `deposit()`

- Creates the `payment_transactions` row up-front via `paymentService.createGatewayIntention()` (the canonical Paymob Intention path used by bookings and marketplace).
- Returns `{ success:false, paymentId, clientSecret, publicKey, status:'pending', message }` so the client can render the Paymob Pixel widget.
- Does **not** credit the wallet synchronously — Paymob's Intention API is always async (`pending`).
- The legacy `depositV2()` and the synchronous `success:true` credit branch were removed.

### `backend/src/modules/wallet/application/wallet-payment.listener.ts` — new

- `registerWalletPaymentListeners()` subscribes to:
  - `payment:succeeded` → credits the wallet (the credit path)
  - `payment:failed-event` / `payment:cancelled-event` / `payment:expired-event` → logs, no credit
- Credit is idempotent: it checks `transactions` for `source_type='wallet_topup'` + `source_id=paymentId` before running `DepositWallet` command + `createWalletTopup` ledger entry inside one transaction.
- Emits `wallet:deposit` (+ `wallet:low-balance` when balance < 50) for realtime cache invalidation.

### Registration

- `backend/src/server.ts` — `registerWalletPaymentListeners()` is called after the booking payment listener.

### Routes

- `GET /wallets/me`, `POST /wallets/deposit`, `POST /wallets/withdraw`, `GET /wallets/transactions` (canonical, used by the frontend).
- `GET /wallets/my`, `GET /wallets/my/transactions` (aliases so the e2e wallet suite exercises real endpoints).

---

## Frontend

### `frontend/src/pages/player/WalletPage.tsx`

- Deposit mutation:
  - `result.clientSecret` → open the Paymob Pixel modal (`setPixelClientSecret`, `setPaymentId`)
  - `result.paymentUrl` → legacy iframe fallback (kept for gateways that return a URL only)
  - `result.success` → legacy synchronous-credit branch (defensive; backend no longer returns it)
- After the Pixel card completes: `confirmPayment(paymentId)` (via `usePaymentConfirm`); if not confirmed, `PaymentStatusPoller` polls `GET /payments/status/:id` until `paymentStatus === 'paid'` (or times out after 90s with a warning).
- Query keys aligned with the realtime invalidator: wallet `['wallet','me']`, transactions `['transactions', page]` — so `wallet.deposit` / `payment.completed` socket events refresh the page automatically.
- Fixed pagination to use a local `PAGE_SIZE` (the `/wallets/transactions` response has no `limit` field).

### `frontend/src/realtime/useRealtimeCacheUpdates.ts`

- Wallet socket event names corrected to what the backend mapper actually emits:
  - `wallet.deposited` → `wallet.deposit`
  - `wallet.withdrawn` → `wallet.withdrawal`
- Both invalidate `['wallet']` and `['transactions']`.

---

## Failure / Edge Cases

| Case | Behaviour |
|------|-----------|
| Gateway rejects intention | `success:false` + `status:'failed'` returned; frontend shows error toast |
| User cancels Pixel card | `onCancel` closes modal, warning toast, no credit |
| Payment succeeds but confirm times out | `PaymentStatusPoller` shows warning; webhook/`sync_pending_payments` credits the wallet within ~5 min |
| Duplicate `payment:succeeded` (webhook + confirm race) | Ledger idempotency check (`source_id=paymentId`) skips re-credit |
| Payment failed/cancelled/expired | Logged, no credit |
| `sync_pending_payments` job finds stuck pending payment | Calls `_processPaymentOutcome('sync')` → same listener credits wallet |

---

## Testing

- Backend unit: `npx vitest run src/modules/wallet src/modules/payment` (69 tests)
- Backend build: `npm run build` (backend/)
- Frontend build: `npm run build` (frontend/)
- Frontend tests: `npm test` (frontend/)
- E2E: `node backend/scripts/e2e-validation.mjs` wallet suite (deposit must return 200; `GET /wallets/my/transactions` returns `{ data }`)
