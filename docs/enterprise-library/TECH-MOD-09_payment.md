---
document_id: "TECH-MOD-09"
document_name: "Payment Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Security Lead"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-10"]
  related: ["TECH-MOD-12", "TECH-MOD-03"]
---

# Payment Module (TECH-MOD-09)

**Source:** `backend/src/modules/payment/` (5 entries: domain/, application/, commands/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Payment processing via Paymob gateway (Intention API + Accept API). Manages payment lifecycle, webhook HMAC verification, reconciliation, refunds, and payment health monitoring. 13 routes.

## 2. Architecture

```
domain/
  payment-aggregate.ts      — Payment state machine (7 statuses, 43 lines)
application/
  payment.service.ts        — Charge, confirm, refund, webhook handling
  reconciliation.service.ts — Payment reconciliation logic
commands/
  (payment commands)
infrastructure/
  (repositories)
presentation/
  payment.routes.ts         — 13 endpoints
  payment.controller.ts     — 361 lines, request handlers
  payment.dto.ts            — Zod schemas
```

**Evidence:** `payment.routes.ts` (30 lines, 13 routes), `domain/payment-aggregate.ts` (43 lines), `payment.controller.ts` (361 lines).

## 3. Routes (13)

Defined in `payment.routes.ts:7-30`:

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 1 | POST | `/payments/webhook` | No | Paymob webhook handler |
| 2 | POST | `/payments/charge` | Yes | Initiate payment charge |
| 3 | POST | `/payments/confirm` | Yes | Confirm payment |
| 4 | GET | `/payments/status/:id` | Yes | Get payment status |
| 5 | POST | `/payments/:id/refund` | Yes+`financial.reconcile` | Process refund |
| 6 | GET | `/payments/transactions` | Yes | List transactions |
| 7 | POST | `/payments/sync` | Yes+`financial.reconcile` | Sync pending payments |
| 8 | POST | `/payments/expire` | Yes+`financial.reconcile` | Expire stale payments |
| 9 | POST | `/payments/recover/:gatewayReference` | Yes+`financial.reconcile` | Recover payment |
| 10 | GET | `/payments/health` | Yes+`financial.reconcile` | Payment health check |
| 11 | POST | `/payments/reconciliation/run` | Yes+`financial.reconcile` | Run reconciliation |
| 12 | GET | `/payments/reconciliation/history` | Yes+`financial.reconcile` | Reconciliation history |
| 13 | GET | `/payments/production-readiness` | Yes+`financial.reconcile` | Production readiness check |

## 4. Permissions

- `financial.reconcile` — Required for admin payment operations (refund, sync, expire, recover, health, reconciliation)

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Payment Transaction | `payment_transactions` | `id, user_id, reference_type, reference_id, amount, currency, payment_status, gateway_reference, aggregate_version` |
| Journal Entry | `financial_journal_entries` | `id, reference_type, reference_id, source, created_at` |
| Reconciliation Run | `reconciliation_runs` | `id, date_from, date_to, status, summary` |

## 6. State Machine

Payment lifecycle defined in `payment-aggregate.ts:3-11`:

```
created → pending | cancelled
pending → paid | failed | cancelled | expired
paid → refunded
failed → (terminal)
cancelled → (terminal)
expired → (terminal)
refunded → (terminal)
```

**Final states:** `paid`, `failed`, `cancelled`, `expired`, `refunded`

**Evidence:** `payment-aggregate.ts:3-11` defines `ALLOWED_TRANSITIONS`. `payment-aggregate.ts:36-38` defines `isFinal()`.

## 7. Webhook HMAC Verification

`payment.controller.ts:76-112` handles webhook processing:
- Signature read from query param `hmac` (Intention API) or header `x-paymob-signature` (Accept API)
- HMAC verification via `paymentService.handleWebhook()`
- HMAC/signature rejection returns 401
- Missing gateway reference returns 400
- Unknown transaction returns 200 (idempotent)

## 8. Events

- `payment:charged` — Payment initiated
- `payment:confirmed` — Payment confirmed
- `payment:webhook_received` — Webhook from gateway
- `payment:refunded` — Refund processed
- `payment:recovered` — Payment recovered from gateway
- `payment:reconciliation_completed` — Reconciliation run finished

## 9. Audit Events

- `PAYMENT.PROCESS` — Payment initiated (see `payment.controller.ts:16-31`)
- `PAYMENT.CONFIRM` — Payment confirmed (see `payment.controller.ts:37-46`)
- `PAYMENT.REFUND` — Refund processed (see `payment.controller.ts:63-73`)
- `PAYMENT.WEBHOOK` — Webhook received (see `payment.controller.ts:84-92`)
- `PAYMENT.RECOVER` — Payment recovered (see `payment.controller.ts:136-146`)

## 10. Configuration

| Env Var | Description |
|---------|-------------|
| `PAYMENT_GATEWAY_PROVIDER` | `paymob` or `mock` |
| `PAYMOB_API_KEY` | Paymob API key |
| `PAYMOB_SECRET` | Paymob secret |
| `PAYMOB_HMAC_SECRET` | HMAC secret for webhook verification |
| `PAYMOB_PUBLIC_KEY` | Paymob public key (iframes) |
| `WEBHOOK_BASE_URL` | Public base URL for webhook endpoint |

**Evidence:** `payment.controller.ts:182-262` reads these env vars in `healthHandler` and `productionReadinessHandler`.
