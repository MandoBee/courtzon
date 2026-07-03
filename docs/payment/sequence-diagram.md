# Payment Sequence Diagram

## Successful Card Payment (Webhook Path)

```
User        Frontend      Backend       Paymob        DB         Redis
 │            │             │             │            │           │
 │  Checkout  │             │             │            │           │
 ├───────────▶│             │             │            │           │
 │            │  POST /pay  │             │            │           │
 │            ├────────────▶│             │            │           │
 │            │             │  POST Intention API     │           │
 │            │             ├────────────▶│           │           │
 │            │             │  {id, client_secret}   │           │
 │            │             │◀────────────┤           │           │
 │            │             │             │            │           │
 │            │             │  INSERT payment_txn     │           │
 │            │             ├────────────────────────▶│           │
 │            │             │             │            │           │
 │            │  pay_url    │             │            │           │
 │            │◀────────────┤             │            │           │
 │            │             │             │            │           │
 │  Redirect to Paymob      │             │            │           │
 ├───────────▶───────────────────────────▶│            │           │
 │            │             │             │            │           │
 │  Enter card & pay        │             │            │           │
 │◀──────────────────────────────────────▶│            │           │
 │            │             │             │            │           │
 │            │             │  POST /payments/webhook │           │
 │            │             │◀────────────┤           │           │
 │            │             │             │            │           │
 │            │             │  HMAC verify             │           │
 │            │             ├─────────────────────────────────────▶│
 │            │             │             │            │           │
 │            │             │  Find txn by gateway_ref │           │
 │            │             ├────────────────────────▶│           │
 │            │             │  {txn found}             │           │
 │            │             │◀────────────────────────┤           │
 │            │             │             │            │           │
 │            │             │  _fulfillOrder()        │           │
 │            │             ├────────────────────────▶│           │
 │            │             │  UPDATE order confirmed  │           │
 │            │             │  UPDATE txn paid         │           │
 │            │             │  INSERT journal          │           │
 │            │             │  DELETE cart_items       │           │
 │            │             │◀────────────────────────┤           │
 │            │             │             │            │           │
 │            │             │  200 OK     │            │           │
 │            │             ├────────────▶│            │           │
 │            │             │             │            │           │
 │  Redirect to success page│             │            │           │
 │◀───────────▶───────────────────────────▶│            │           │
```

## Sync Recovery Path (Fallback)

```
Timer        Backend       Paymob        DB
 │             │             │            │
 │  30s tick   │             │            │
 ├────────────▶│             │            │
 │             │  SELECT pending txns     │
 │             ├────────────────────────▶│
 │             │  [{id, gateway_ref}]     │
 │             │◀────────────────────────┤
 │             │             │            │
 │             │  For each: GET status    │
 │             ├────────────▶│            │
 │             │  {status: paid}          │
 │             │◀────────────┤            │
 │             │             │            │
 │             │  _fulfillOrder()         │
 │             ├────────────────────────▶│
 │             │◀────────────────────────┤
 │             │             │            │
 │             │  Log: {synced: 1}        │
```

## Expiry Path

```
Timer        Backend       DB
 │             │            │
 │  60s tick   │            │
 ├────────────▶│            │
 │             │  SELECT stale txns       │
 │             │  (created > 15 min ago)  │
 │             ├────────────────────────▶│
 │             │  [{id, ...}]│            │
 │             │◀────────────────────────┤
 │             │             │            │
 │             │  UPDATE txn expired      │
 │             ├────────────────────────▶│
 │             │◀────────────────────────┤
 │             │             │            │
 │             │  Log: {expired: N}       │
```

## Idempotent Webhook Replay

```
Paymob       Backend       DB
 │             │            │
 │  POST webhook (retry)    │
 ├────────────▶│            │
 │             │  HMAC verify            │
 │             │  Find txn by gateway_ref│
 │             ├────────────────────────▶│
 │             │  {txn already paid}     │
 │             │◀────────────────────────┤
 │             │             │            │
 │             │  200 {idempotent: true} │
 │             ├────────────▶│            │
```

## Key Decision Points

1. **Query param HMAC vs Header HMAC**: Intention API webhooks use query param `?hmac=`. Our controller checks query param FIRST, then falls back to `x-paymob-signature` header.

2. **Webhook not found → 200 (not 4xx)**: If a webhook references a transaction not in our DB, we return 200 to prevent Paymob from considering it a failure. This is intentional idempotent design.

3. **Cart cleared only in _fulfillOrder()**: Cart is preserved until payment is confirmed. If user abandons the Paymob page, cart stays for retry.

4. **Sync only covers last 1 hour**: The sync worker only queries transactions from the last hour to avoid processing ancient abandoned payments.
