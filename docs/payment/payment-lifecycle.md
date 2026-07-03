# Payment Lifecycle

## Order & Payment State Machine

```
                    checkout()
                       │
                       ▼
              ┌──────────────┐
              │    ORDER      │
              │   pending     │
              │   unpaid      │
              └──────┬───────┘
                     │
              ┌──────┴───────┐
              │  PAYMENT TXN  │
              │   created     │
              │   (pending)   │
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌──────────┐
   │ webhook │ │  sync   │ │  expiry  │
   │  paid   │ │  paid   │ │ expired  │
   └────┬────┘ └────┬────┘ └────┬─────┘
        │            │            │
        ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │  ORDER    │ │  ORDER   │ │  ORDER   │
   │ confirmed │ │confirmed │ │ pending  │
   │   paid    │ │  paid    │ │ unpaid   │
   │cart clear │ │cart clear│ │cart stays│
   └──────────┘ └──────────┘ └──────────┘
```

## Payment Statuses

| Status | Meaning | Order Status | Cart |
|--------|---------|-------------|------|
| `created` | Payment intention created, awaiting payment | `pending` | Preserved |
| `pending` | Payment in progress (user on Paymob page) | `pending` | Preserved |
| `processing` | Payment being processed | `pending` | Preserved |
| `paid` | Payment confirmed by gateway | `confirmed` | Cleared |
| `failed` | Payment failed/rejected by gateway or user | `pending` | Preserved |
| `expired` | Payment timed out (15 min) | `pending` | Preserved |
| `refunded` | Payment was refunded | Reverted | N/A |
| `cancelled` | Payment was cancelled | Reverted | N/A |

## Order Statuses

| Status | Description |
|--------|-------------|
| `pending` | Order created, awaiting payment/confirmation |
| `confirmed` | Payment received, order is active |
| `processing` | Order is being prepared |
| `completed` | Order fulfilled/delivered |
| `cancelled` | Order was cancelled |
| `refunded` | Order was refunded |

## Payment Scenarios

### Scenario 1: Successful Card Payment

```
User → Add to cart → Checkout → Card payment selected
     → POST /marketplace/orders → Intention API call
     → Redirect to Paymob Unified Checkout
     → Enter card details → Pay
     → Paymob webhook POST → _processPaymentOutcome
     → _fulfillOrder: order=confirmed, txn=paid, journal created, cart cleared
```

### Scenario 2: Abandoned Payment (User closes Paymob tab)

```
User → Add to cart → Checkout → Card payment selected
     → Redirect to Paymob
     → Closes tab / goes back
     → Order stays pending/unpaid
     → Cart is PRESERVED (user can retry)
     → Payment transaction stays pending
     → May expire after 15 minutes
```

### Scenario 3: Webhook Replay (Idempotency)

```
Paymob sends webhook → Transaction paid
     → Paymob resends same webhook (network retry)
     → Duplicate detected (gateway_reference already processed)
     → Returns 200 { idempotent: true }
     → No duplicate fulfillment, no duplicate journals
```

### Scenario 4: Expired Payment

```
User creates payment intention → Never completes payment
     → 15 minutes pass (no webhook received)
     → expire_stale_payments job runs
     → Payment transaction: status='expired'
     → Order stays pending/unpaid
     → Cart preserved (user can retry with new payment)
```

### Scenario 5: Wallet Payment

```
User → Add to cart → Checkout → Wallet payment selected
     → Immediate wallet deduction
     → Order confirmed, payment paid, journal created
     → Cart cleared
```

### Scenario 6: Cash Payment

```
User → Add to cart → Checkout → Cash payment selected
     → Order confirmed per business rules
     → Payment marked as cash (manual verification)
     → Cart cleared
```

## Cart Clearance Rule

The cart is ONLY cleared in `_fulfillOrder()` when payment is confirmed:

```
payment confirmed → _fulfillOrder() → clearCart(orderId)
```

The cart is NEVER cleared at checkout time. This preserves the cart if the user abandons the payment at the Paymob redirect page.
