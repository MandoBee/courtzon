# Webhook Flow

## Overview

The webhook is the **PRIMARY** payment completion mechanism. Paymob sends a POST request to `/payments/webhook` when a payment completes (success or failure). The sync worker is only a recovery fallback.

## Endpoint

```
POST /payments/webhook
No authentication required (HMAC signature verification)
```

## Flow Diagram

```
Customer completes payment on Paymob
           │
           ▼
   Paymob sends POST /payments/webhook
   Query: ?hmac=<signature>
   Body: { obj: { id, success, status, ... } }
           │
           ▼
   Controller extracts signature
   Priority: query.hmac > x-paymob-signature header
           │
           ▼
   verifyWebhook(payload, signature)
   Intention API: HMAC-SHA512(JSON.stringify(obj), secret)
   Accept API:   HMAC-SHA512(concatFields, secret)
           │
      ┌────┴────┐
      │ Invalid  │────▶ 401 Unauthorized
      └────┬────┘
      │ Valid
      ▼
   Extract gateway_reference from payload
           │
      ┌────┴────┐
      │ Not found│────▶ 200 (idempotent: "transaction not found")
      └────┬────┘
      │ Found
      ▼
   _processPaymentOutcome()
      │
      ├─ Status = "paid" → _fulfillOrder()
      │    ├─ Update order: status=confirmed, payment_status=paid, paid_at=NOW()
      │    ├─ Update payment_transaction: payment_status=paid, paid_at=NOW()
      │    ├─ Record financial_journal_entry (debit: payment_receivable, credit: revenue)
      │    └─ Clear cart_items for this order
      │
      ├─ Status = "failed" → _failPayment()
      │    └─ Update payment_transaction: payment_status=failed
      │
      └─ Already processed → 200 (idempotent response)
```

## HMAC Signature Priority

```typescript
// payment.controller.ts:47
const signature = (
  (request.query as any)?.hmac ||           // Intention API (query param)
  request.headers['x-paymob-signature'] ||  // Accept API header
  request.headers['x-fawry-signature'] ||   // Fawry header (future)
  ''
) as string;
```

**Why**: Intention API webhooks send the HMAC only as `?hmac=` query parameter. The `x-paymob-signature` header uses the Accept API format with a different HMAC computation. Query param gets priority because it correctly identifies the webhook source.

## Idempotency

- The `gateway_reference` column has a `UNIQUE` index (`uk_gateway_reference`)
- Duplicate webhooks are detected and return `200` without reprocessing
- No duplicate journal entries or double fulfillment

## Error Handling

| Status | Condition | Action |
|--------|-----------|--------|
| 401 | Invalid HMAC signature | Reject (gateway may retry) |
| 400 | Missing gateway reference | Validation error |
| 200 | Transaction not found | Idempotent response (no error) |
| 200 | Already processed | Idempotent response |
| 500 | Unexpected error | Log error, return 500 |

## Verification

The webhook is the primary path if:
- Webhook endpoint is publicly accessible
- HMAC secret matches Paymob dashboard
- Paymob Intention notification_url is correct
- Webhooks are received and processed correctly
- Sync worker reports `synced: 0` (no recovery needed)
