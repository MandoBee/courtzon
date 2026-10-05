# 19 — SEQUENCE DIAGRAMS

**Audit:** 2026-10-04 · Diagrams reflect the CURRENT code behavior (verified parts) + assumptions marked `%%`.

---

## 1. Normal court booking (cash or card)

```mermaid
sequenceDiagram
  participant P as Player
  participant FE as Frontend
  participant API as Fastify API
  participant BK as BookingService
  participant DB as MySQL
  participant EV as EventBusV2
  participant W as BullMQ worker
  P->>FE: open /book/:resourceId
  FE->>API: GET availability (slots)
  API->>DB: booking_slots query
  DB-->>API: slots
  P->>FE: submit booking form
  FE->>API: POST /bookings (auth+perm)
  API->>BK: createBooking()
  BK->>DB: INSERT bookings(status=pending) + booking_slots (tx)
  API-->>FE: booking created
  alt card
    FE->>API: POST /payments/charge (gateway)
    API->>Paymob(sandbox): intent
    Paymob-->>P: redirect/checkout
    Paymob-->>API: webhook
    API->>EV: emit payment:succeeded
  else cash
    Receptionist->>API: confirm cash
    API->>EV: emit payment:succeeded
  end
  EV->>W: listener booking-payment → bookings.confirmed
  EV->>W: accounting-listener → ledger_entries (+general_ledger)
  EV->>W: entitlement-booking → financial_entitlements
  API-->>FE: booking confirmed (realtime notify)
```

## 2. Card booking / 3. Cash booking — covered above (card vs cash branch).

## 4. Failed payment

```mermaid
sequenceDiagram
  Paymob->>API: webhook (failed)
  API->>PaymentService: handleWebhook → confirm/fail
  API->>EV: emit payment:failed
  EV->>W: booking-payment-listener → compensateFailedBooking (cancel + maybe refund)
  EV->>W: marketplace listener → order failed
  API-->>FE: booking cancelled + notification
```

## 5. Late webhook

```mermaid
sequenceDiagram
  Paymob->>API: webhook (arrives late after timeout)
  API->>PaymentService: verify gateway_reference (unique)
  DB-->>API: payment found (expired) → handle state
  alt still payable
    API->>EV: emit payment:succeeded → listeners run (booking already expired → refund decision `%risky`)
  else already paid
    API-->>Paymob: 200 idempotent (no-op)
  end
```
`%% Late-webhook ordering vs booking expiry needs UAT (see 09, 22).`

## 6. Duplicate webhook

```mermaid
sequenceDiagram
  Paymob->>API: webhook #1
  API->>DB: check gateway_reference → miss → confirm + POST
  Paymob->>API: webhook #2
  API->>DB: check gateway_reference → hit → 200 identity no-op
```

## 7. Booking expiration

```mermaid
sequenceDiagram
  loop every 2 min
    W->>API: cancel_expired_bookings worker
    API->>DB: UPDATE bookings SET booking_status=expired WHERE pending_payment AND expired
    API->>EV: emit booking:expired
  end
```

## 8. Cancellation

```mermaid
sequenceDiagram
  P->>API: POST /bookings/:id/cancel
  API->>BK: cancelBooking (window policy + policy snapshot)
  API->>DB: INSERT booking_cancellations(booking_id UNIQUE, refund_status)
  API->>EV: emit booking:cancelled (+ payment:refunded if paid)
  EV->>W: accounting → reversal entries; entitlement → cancel
```

## 9. Refund

```mermaid
sequenceDiagram
  Admin/Receptionist->>API: POST /payments/:id/refund (perm)
  API->>PaymentService: refund(amount, reason)
  API->>DB: payment_transactions.status=refunded
  API->>EV: emit payment:refunded
  EV->>W: booking_cancellations processed; ledger reversal; wallet credit (if wallet)
```

## 10. Marketplace purchase

```mermaid
sequenceDiagram
  Buyer->>API: POST /marketplace/cart (reservation)
  Buyer->>API: POST /marketplace/checkout
  API->>DB: INSERT orders (per seller) + order_items (stock decrement ⚠️ lock unverified)
  API->>Paymob: charge
  Paymob->>API: webhook → payment:succeeded (ref=order)
  API->>EV: marketplace-payment-listener → orders.confirmed
  EV->>W: entitlement-marketplace → entitlements; ledger entries
```

## 11. Marketplace refund — like #9 but `settlement_status` on order_items + marketplace refund calc.

## 12. Membership purchase

```mermaid
sequenceDiagram
  OrgAdmin->>API: create plan → version → activate
  Player->>API: POST /organisations/:orgId/membership/subscriptions
  API->>DB: membership_subscriptions (snapshot) + membership_installments
  alt cash
    Receptionist->>API: confirm-cash → pays → payment:succeeded(ref=membership_subscription)
  else card
    API->>Paymob: charge → webhook → payment:succeeded
  end
  EV->>W: membership-p1 listener → finalizePaidSubscription → subscriptions.active
  EV->>W: entitlement-membership → financial_entitlements (P3)
  loop daily
    W->>API: membership_subscription_expiry / installment_overdue / reminders
  end
```

## 13. Gateway settlement

```mermaid
sequenceDiagram
  Admin->>API: create gateway settlement batch
  API->>DB: INSERT gateway_settlements(completed) + gateway_settlement_transactions
  API->>DB: UPDATE payment_transactions SET gateway_settlement_id
  API->>EV: emit settlement event → accounting (clearing)
  %% Entire pipeline: 0 live rows — never executed
```

## 14. Accounting posting

```mermaid
sequenceDiagram
  EV->>API: accounting-listener (mutex per entity)
  API->>api: accounting-engine.createLedgerLines(debit+credit)
  API->>DB: INSERT ledger_entries (uk_dedup)
  API->>DB: gl-projection → general_ledger
```

## 15. Realtime booking update

```mermaid
sequenceDiagram
  API->>socket-publisher: map event(booking) → room booking:{id}+user:{id}
  socket-publisher-->>FE: emit('booking:updated', payload)
  FE->>FE: RealtimeCacheUpdater → invalidateQueries(['bookings'])
```

## 16. Notification flow

```mermaid
sequenceDiagram
  EV->>API: notification-engine.handleEvent(event)
  API->>API: dispatcher (rate-limit, quiet, prefs)
  API->>W: BullMQ notifications queue (per channel)
  W->>Provider: deliver (InApp/Email real; Push/SMS mock)
  W->>DB: notification_delivery + notification_audit_trail
  W-->>FE: in-app via socket user:{id}
```