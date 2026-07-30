---
document_id: "TECH-ARCH-13"
document_name: "Payment Flow Deep Dive"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-09", "TECH-MOD-10", "TECH-ARCH-02"]
  related: ["TECH-MOD-03", "TECH-MOD-12", "TECH-MOD-30"]
---

# Payment Flow Deep Dive (TECH-ARCH-13)

## 1. Overview

The Payment flow handles all monetary transactions in CourtZon. It supports two primary execution paths — **wallet** (internal balance deduction) and **gateway** (Paymob Intention API / Accept API) — plus webhook-based async reconciliation, manual recovery, scheduled sync, and refund processing. The payment module is generic (not coupled to any business domain); business modules subscribe to events like `payment:succeeded` for their own fulfillment.

**Source files referenced:**
- `backend/src/modules/payment/application/payment.service.ts` (~933 lines, main orchestrator)
- `backend/src/modules/payment/domain/payment-aggregate.ts` (state machine, 43 lines)
- `backend/src/modules/payment/application/reconciliation.service.ts` (260 lines)
- `backend/src/modules/payment/infrastructure/repositories/payment.repository.ts` (211 lines)
- `backend/src/modules/payment/presentation/payment.controller.ts` (361 lines)
- `backend/src/modules/payment/presentation/payment.routes.ts` (30 lines)
- `backend/src/modules/payment/commands/process-payment.command.ts` (59 lines)
- `backend/src/modules/payment/infrastructure/payment-cron.worker.ts` (24 lines)
- `backend/src/modules/wallet/application/wallet.service.ts` (283 lines)
- `backend/src/modules/wallet/domain/wallet-aggregate.ts` (57 lines)
- `backend/src/shared/services/gateway/gateway-factory.ts` (gateway abstraction)

## 2. Charge Flow

Entry point: `POST /payments/charge` → `payment.controller.ts:12` → `paymentService.charge()`

```
payment.service.ts:52-61
├── if PAYMENT_V2_PROCESS feature flag → chargeV2() (pipeline approach)
├── if input.paymentMethod === 'wallet' → chargeByWallet()
└── else → chargeByGateway()
```

### 2.1 Wallet Path

```
payment.service.ts:63-111 → chargeByWallet()
├── walletService.withdraw(userId, amount, description)
│   ├── wallet.service.ts:102-146: balance check → lock → deduct
│   │   ├── getMyWallet(userId) → ensure wallet exists
│   │   ├── if balance < amount → throw 'Insufficient balance'
│   │   └── withTransaction:
│   │       ├── walletRepository.lockAndGetBalance(wallet.id, conn)  ← FOR UPDATE
│   │       ├── walletRepository.updateBalance(id, newBalance, version, conn) ← optimistic lock
│   │       ├── INSERT wallet_transactions record
│   │       └── transactionService.createWalletWithdraw()
│   └── eventBusV2.emit('wallet:withdrawal', ...)
│   └── if newBalance < 50 → emit 'wallet:low-balance'
├── paymentRepository.create() → INSERT payment_transactions (status='pending', provider='wallet_system')
├── withTransaction:
│   ├── paymentRepository.lockById(paymentId, conn)  ← FOR UPDATE
│   └── _processPaymentOutcome(conn, locked, 'paid', gatewayRef, traceId, 'wallet')
│       ├── Skips if already in FINAL_STATES
│       ├── UPDATE payment_transactions SET payment_status='paid', paid_at=NOW()
│       │   WHERE id=? AND payment_status NOT IN ('paid','failed','cancelled','expired','refunded')
│       ├── Emits payment:succeeded + payment:completed events
│       └── INSERT financial_journal_entries (debit='Cash', credit='Revenue')
├── paymentRepository.createJournalEntry() — business-specific journal entry
└── Returns { success: true, paymentId, status: 'paid', balance, traceId }
```

**Source evidence:** `payment.service.ts:63-111` (wallet path), `wallet.service.ts:102-146` (withdraw), `wallet.repository.ts:57-78` (lockAndGetBalance + updateBalance with version check).

### 2.2 Gateway Path

```
payment.service.ts:113-188 → chargeByGateway()
├── Idempotency check: if input.idempotencyKey exists
│   └── paymentRepository.findByIdempotencyKey() → return existing if paid/pending
├── paymentGateway.charge({ amount, currency, referenceId, returnUrl, customer* })
│   └── Creates Paymob Intention (or mock equivalent)
├── if !paymentResult.success → return { success: false, errorMessage }
├── paymentRepository.create() → INSERT payment_transactions:
│   ├── status='pending'
│   ├── gatewayProvider = paymentGateway.provider ('paymob' | 'mock')
│   ├── gatewayReference = paymentResult.gatewayReference
│   └── gatewayResponse = sanitizeGatewayResponse(paymentResult.rawResponse)
│       └── PCI-sensitive fields stripped: pan, card_number, cvv, exp, source_data, etc.
└── Return { success: true, paymentId, paymentUrl, clientSecret, intentionId }
```

**Source evidence:** `payment.service.ts:113-188` (gateway path), `payment.service.ts:25-47` (PCI sanitization).

### 2.3 V2 Pipeline Path

```
payment.service.ts:838-873 → chargeV2()
├── paymentRepository.create() → INSERT payment_transactions
├── Build Command object: { commandType: 'ProcessPayment', aggregateId, payload }
├── commandPipeline.execute(command, { validate, execute, events })
│   └── processPaymentHandler: payment-aggregate.ts planTransition() → persistTransition()
└── Return { paymentId, traceId, success: true, status: 'paid' }
```

**Source evidence:** `payment.service.ts:838-873` (chargeV2), `process-payment.command.ts:20-58` (handler).

## 3. Gateway Intention Creation (Prepare Flow)

Used by the booking prepare flow — must return a `clientSecret` for the frontend card widget. Bypasses V2 pipeline.

```
payment.service.ts:880-926 → createGatewayIntention()
├── paymentGateway.charge() → create Paymob intention
├── paymentRepository.create() → INSERT payment_transactions
└── Return { clientSecret, intentionId }
```

**Source evidence:** `payment.service.ts:880-926`.

## 4. Webhook Processing

Entry point: `POST /payments/webhook` → `payment.controller.ts:76-112` → `paymentService.handleWebhook()`

### 4.1 HMAC Verification

```
payment.service.ts:200-211
├── Signature read from:
│   ├── Query param 'hmac' (Intention API webhooks)
│   └── Header 'x-paymob-signature' (Accept API webhooks) or 'x-fawry-signature'
├── paymentGateway.verifyWebhook(payload, signature)
├── If invalid → throw Error('Invalid webhook signature') → 401
└── controller.ts:96-98: returns 401 for HMAC/signature rejection
```

**Source evidence:** `payment.controller.ts:78-81` (signature extraction), `payment.service.ts:200-211`.

### 4.2 Replay Protection (Redis-based Dedup)

```
payment.service.ts:217-233
├── Extract webhookId from payload (obj.id / intention_id / transaction_id)
├── Replay key: `webhook:processed:{webhookId}`
├── redis.get(replayKey) → if exists → return { received: true, note: 'duplicate (replay protected)' }
├── redis.set(replayKey, '1', 'EX', 86400)  ← 24-hour TTL
└── Non-blocking: if Redis unavailable, webhook still processes (try/catch, warning log)
```

**Source evidence:** `payment.service.ts:217-233`.

### 4.3 Payload Resolution and Status Mapping

```
payment.service.ts:235-306
├── Timestamp check: log warning if age > 5min (informational only)
├── Collect possible gateway references: intention_order_id, intention_id, order.id, etc.
├── Intention API flag detection: isIntentionWebhook = !!data.obj
├── Status mapping:
│   ├── Intention: obj.success===true → 'paid', obj.pending===true → ignored
│   └── Accept: obj.success===true → 'paid', obj.pending===true → ignored
│   └── Neither: 'failed'
└── cancelled/expired status → direct status update + emit payment:cancelled-event
```

### 4.4 Gateway Reference Resolution

```
payment.service.ts:308-337
├── For each possibleRef → paymentRepository.findByGatewayRef(ref)
├── Fallback: parse merchant_order_id → split('_') → find by reference
├── If not found → NotFoundError('Payment transaction') → controller returns 200
│   (gateway may retry; don't trigger error alert)
└── Lock row: paymentRepository.lockByGatewayRef() → FOR UPDATE
```

### 4.5 Unified Outcome Processing

```
payment.service.ts:489-603 → _processPaymentOutcome()
├── Called by: webhook, sync, manual recovery, confirm, wallet paths
├── Idempotency: if FINAL_STATES.has(transaction.payment_status) → { idempotent: true }
├── UPDATE payment_transactions SET payment_status=?, paid_at=...
│   WHERE id=? AND payment_status NOT IN (final states)
├── If affectedRows === 0 → race condition, return { idempotent: true }
├── Emit events (within transaction via conn):
│   ├── paid → payment:succeeded + payment:completed
│   └── failed → payment:failed-event + payment:failed
│   └── Events include: paymentId, referenceType, referenceId, amount, metadata (gatewayRef, userId, currency)
├── INSERT financial_journal_entries:
│   ├── paid: debit='Cash', credit='Revenue'
│   └── failed: debit='Bad Debt', credit='Cash'
└── Log every status change BEFORE every UPDATE (source, oldStatus, newStatus, gatewayRef)
```

**Source evidence:** `payment.service.ts:489-603`.

## 5. Reconciliation

### 5.1 Sync Pending Payments

```
payment.service.ts:391-431 → syncPendingPayments()
├── paymentRepository.findPendingPayments(olderThanMinutes=1)
│   └── SELECT * FROM payment_transactions WHERE status IN ('created','pending','processing')
│       AND gateway_provider='paymob' AND created_at < NOW() - INTERVAL ? MINUTE
├── For each: paymentGateway.getTransactionStatus(gatewayRef) → poll Paymob
├── Map remote status → newStatus: 'paid' | 'failed' | null
├── If newStatus → _processPaymentOutcome(conn, locked, newStatus, gatewayRef, traceId, 'sync')
└── Scheduled job: handleSyncPendingPayments() in payment-cron.worker.ts:7-14
```

**Source evidence:** `payment.service.ts:391-431`, `payment-cron.worker.ts:7-14`.

### 5.2 Manual Recovery

```
payment.service.ts:438-475 → recoverPayment(gatewayReference, initiatedBy)
├── Admin-initiated via POST /payments/recover/:gatewayReference
├── paymentRepository.findByGatewayRef() → paymentGateway.getTransactionStatus()
├── Map status → _processPaymentOutcome() with source='manual'
├── Audit event: PAYMENT.RECOVER
└── Returns { recovered, idempotent, paymentStatus, remoteStatus }
```

**Source evidence:** `payment.service.ts:438-475`, `payment.controller.ts:132-146`.

### 5.3 Expire Stale Payments

```
payment.service.ts:802-836 → expireStalePayments(timeoutMinutes=15)
├── paymentRepository.findPendingPayments(timeoutMinutes)
├── For each: UPDATE payment_transactions SET payment_status='expired'
│   WHERE id=? AND payment_status NOT IN (final states)
├── Emit payment:expired-event
└── Scheduled job: handleExpireStalePayments() in payment-cron.worker.ts:16-24
```

**Source evidence:** `payment.service.ts:802-836`, `payment-cron.worker.ts:16-24`.

### 5.4 Reconciliation Run

```
reconciliation.service.ts:45-244 → run()
├── 6 checks:
│   1. Gateway paid → local pending (CRITICAL, auto-fixable)
│   2. Local paid → booking not confirmed (WARNING)
│   3. Wallet deducted → payment not complete (CRITICAL)
│   4. Paid payment → no linked reference (WARNING, orphan)
│   5. Booking confirmed → no paid payment (INFO, normal for COD)
│   6. Auto-fix: calls recoverPayment() for CRITICAL auto-fixable issues
├── Audit event: RECONCILIATION.RUN
└── GET /payments/reconciliation/history → reads audit_logs by action
```

**Source evidence:** `reconciliation.service.ts:45-244`, `reconciliation.service.ts:247-257`.

## 6. Confirmation Endpoint

```
payment.service.ts:610-743 → confirmPayment(paymentId)
├── Load transaction → if already paid → idempotent success
├── Poll Paymob getTransactionStatus() with retry:
│   ├── RETRY_MS = 60,000 (60 seconds)
│   ├── POLL_INTERVAL = 1,000 (1 second)
│   └── Break on 'paid' or 'failed'
├── If paymobStatus is paid/failed → _processPaymentOutcome(source='confirm')
├── If polling timeout → return { confirmed: false, pending }
└── Events already emitted inside _processPaymentOutcome
```

**Source evidence:** `payment.service.ts:610-743`.

## 7. Refund Processing

```
payment.service.ts:769-796 → refund(paymentId, amount, reason)
├── paymentRepository.findById() → throw if not found
├── paymentGateway.refund({ transactionId, amount, reason })
├── eventBusV2.emit('payment:refunded', ...)
├── INSERT financial_journal_entries (debit='Refund Expense', credit='Cash')
├── Audit event: PAYMENT.REFUND
└── Permission: financial.reconcile
```

**Source evidence:** `payment.service.ts:769-796`, `payment.controller.ts:59-73`.

## 8. Payment Lifecycle State Machine

Defined in `payment-aggregate.ts:3-11`:

```
┌─────────────┐
│   created   │──→ pending (upon charge creation)
└──────┬──────┘
       │──→ cancelled (terminal)
       ▼
┌─────────────┐
│   pending   │──→ paid (webhook/sync/confirm)
└──────┬──────┘──→ failed (webhook/sync/confirm)
       │──→ cancelled (webhook)
       │──→ expired (cron job / webhook)
       ▼
┌─────────────┐
│    paid     │──→ refunded (admin refund)
└─────────────┘

Terminal states: paid, failed, cancelled, expired, refunded
```

**Transitions Table:**

| From | To | Trigger | Source |
|------|----|---------|--------|
| created | pending | paymentRepository.create() | `payment-aggregate.ts:4` |
| created | cancelled | Direct cancellation | `payment-aggregate.ts:4` |
| pending | paid | Webhook / sync / confirm / wallet | `payment-aggregate.ts:5` |
| pending | failed | Webhook / sync / confirm | `payment-aggregate.ts:5` |
| pending | cancelled | Webhook (cancelled status) | `payment-aggregate.ts:5` |
| pending | expired | expireStalePayments() cron / webhook | `payment-aggregate.ts:5` |
| paid | refunded | refund() endpoint | `payment-aggregate.ts:6` |

**Source evidence:** `payment-aggregate.ts:3-11` (ALLOWED_TRANSITIONS), `payment-aggregate.ts:36-38` (`isFinal()`), `payment.service.ts:23` (FINAL_STATES Set).

## 9. Payment Health Monitoring

```
payment.controller.ts:148-241 → healthHandler()
├── Provider info (PAYMENT_GATEWAY_PROVIDER env)
├── Gateway connectivity check (HTTPS GET to accept.paymob.com, 5s timeout)
├── Pending payments grouped by status
├── Stale > 15min count
├── Failed in last hour count
├── Last webhook timestamp (from financial_journal_entries)
├── 7-day metrics: total, success count, fail count, success rate %, refund count
├── DB migration version check
└── Gateway configuration check (PAYMOB_API_KEY, PAYMOB_SECRET, PAYMOB_HMAC_SECRET)
```

**Source evidence:** `payment.controller.ts:148-241`.

## 10. Production Readiness Checks

```
payment.controller.ts:255-361 → productionReadinessHandler()
├── 10 checks:
│   1. Gateway configured (not mock, all keys present) → FAIL if mock
│   2. Webhook URL configured (WEBHOOK_BASE_URL)
│   3. DB schema aligned (payment_status ENUM has 'processing' state)
│   4. Replay protection (Redis ping)
│   5. Reconciliation service available
│   6. Refund workflow verified
│   7. Gateway connectivity (HTTPS to accept.paymob.com)
│   8. Migrations applied
│   9. Metrics operational
│   10. Audit trail verified
└── Overall: READY / NOT_READY / NEEDS_ATTENTION
```

**Source evidence:** `payment.controller.ts:255-361`.

## 11. API Route Map

Defined in `payment.routes.ts:7-30`:

| Method | Path | Auth | Source |
|--------|------|------|--------|
| POST | `/payments/webhook` | No | `payment.routes.ts:7` |
| POST | `/payments/charge` | Yes | `payment.routes.ts:10` |
| POST | `/payments/confirm` | Yes | `payment.routes.ts:11` |
| GET | `/payments/status/:id` | Yes | `payment.routes.ts:12` |
| POST | `/payments/:id/refund` | Yes + `financial.reconcile` | `payment.routes.ts:13` |
| GET | `/payments/transactions` | Yes | `payment.routes.ts:14` |
| POST | `/payments/sync` | Yes + `financial.reconcile` | `payment.routes.ts:17` |
| POST | `/payments/expire` | Yes + `financial.reconcile` | `payment.routes.ts:18` |
| POST | `/payments/recover/:gatewayReference` | Yes + `financial.reconcile` | `payment.routes.ts:19` |
| GET | `/payments/health` | Yes + `financial.reconcile` | `payment.routes.ts:22` |
| POST | `/payments/reconciliation/run` | Yes + `financial.reconcile` | `payment.routes.ts:25` |
| GET | `/payments/reconciliation/history` | Yes + `financial.reconcile` | `payment.routes.ts:26` |
| GET | `/payments/production-readiness` | Yes + `financial.reconcile` | `payment.routes.ts:29` |

## 12. Key Configuration

| Config | Default | Location | Purpose |
|--------|---------|----------|---------|
| `PAYMENT_GATEWAY_PROVIDER` | `mock` | env | Gateway implementation |
| `PAYMOB_API_KEY` | — | env | Paymob API key |
| `PAYMOB_SECRET` | — | env | Paymob secret |
| `PAYMOB_HMAC_SECRET` | — | env | HMAC key for webhook verification |
| `PAYMOB_PUBLIC_KEY` | — | env | Public key for iframes |
| `WEBHOOK_BASE_URL` | — | env | Public webhook URL base |
| Webhook replay TTL | 86400s (24h) | `payment.service.ts:229` | Redis dedup key expiry |
| Webhook timestamp window | 5 min | `payment.service.ts:241` | Informational age check |
| Confirm retry MS | 60,000 | `payment.service.ts:634` | Polling timeout for confirm |
| Confirm poll interval | 1,000ms | `payment.service.ts:635` | Polling frequency |
| Stale payment timeout | 15 min | `payment.service.ts:802` | Expiry cron threshold |
| `PAYMENT_V2_PROCESS` | off | `isFeatureEnabled()` | Feature flag for V2 pipeline |

**Source evidence:** `payment.controller.ts:182-203` (env vars), `payment.service.ts:634-635` (confirm timing), `payment.service.ts:229` (replay TTL).
