# 18 — DATA FLOW MAP

**Audit:** 2026-10-04 · Verified data flows (code/DB).

---

## 1. Booking

```
Player → /bookings POST (auth) → bookingService.createBooking
  → pricing-engine (computeBookingEconomics: total, tax, commission, net, club)
  → INSERT bookings(status=pending) + booking_slots
  → (optional) prepareGatewayBooking → payment_transactions(reference_type=booking)
  → webhook/confirm → listener booking-payment → bookings.payment_status=paid
  → events booking:confirmed → realtime(booking:{id}) + notification engine
  → entitlement-booking-worker → financial_entitlements(ORGANIZATION_EARNING + COURTZON_COMMISSION)
  → check-in → auto-complete → completed
  → cancel → booking_cancellations → refund (payment) → ledger reversal
```

## 2. Payment

```
POST /payments/charge → route(perm) → PaymentService.charge
  → chargeByWallet / chargeByGateway(Paymob intent)
  → payment_transactions(created/pending/processing)
  → gateway webhook → handleWebhook → confirmPayment → paid
  → emit payment:succeeded → micro-listeners (booking/marketplace/academy/wallet/tournament/membership)
  → accounting-event-listener → ledger_entries → general_ledger
  → entitlement-release workers → financial_entitlements
  → notification engine + realtime
```

## 3. Marketplace

```
Seller → products CRUD → LISTING
Buyer → cart (reservation) → checkout (split per seller) → orders(pending) + order_items
  → payment:succeeded on order ref → marketplace-payment-listener → orders.confirmed
  → fulfilment (shipped/delivered) → settlement eligibility
  → requestSettlement → unified settlement (entitlements) → settlement_transfers
  → marketplace_ledger_entries postings
Refund → marketplace-refund-calc → reversed entries → order_items.settlement_status
Complaint → complaint lifecycle + escalation workers
```

## 4. Membership (G11.22)

```
Org admin → create plan → create version (components/branches/settings) → activate
Player → POST /organisations/:orgId/membership/subscriptions → membership_subscriptions(snapshot, pending)
  → payment (cash: confirm-cash OR card: complete-card / installment confirm/complete)
  → payment:succeeded(refType=membership_subscription) → membership-p1 listener finalizePaidSubscription → active
  → installment due → membership_installment(paid) → entitlement (P3 worker, source_type=membership)
  → renewal (renewHandler) / cancel (void future) / refund (refundInstallments)
  → sweep workers: expiry/overdue/reminders
```

## 5. Subscription (org billing)

```
Org → subscription plan → organisation_subscriptions
Workers expire_subscriptions/send_subscription_reminders → events → notifications
Payment (card) refType=subscription → ledger posting → entitlement? (❓ no explicit org-subscription entitlement verified)
```

## 6. Refund

```
Refund trigger (booking cancel/membership cancel/marketplace cancel/admin)
  → payment:refunded event → payment_transactions.status=refunded
  → booking_cancellations.refund_status=processed
  → accounting reversal (ledger_entries reversed via same event; positive/negative)
  → wallet credit if wallet method
  → notification
```

## 7. Settlement

```
financial_entitlements (AVAILABLE) → settle request (unified-settlement) → settlements(requested)
  → calculates → approved → paid → settlement_entitlements linked
  → settlement_transfers (direction) → bank/payout
  → corrections: settlement-correction.service (post-payment edits)
  → gateway settlements: gateway_settlement batch → payment_transactions.gateway_settlement_id set
  ⚠️ Entire settlement pipeline: 0 rows live (never executed)
```

## 8. Accounting

```
Event → accounting-event-listener → per-entity mutex → accounting-engine
  → createLedgerLines (debit+credit, source_type/source_id/event_type)
  → validateLedgerBalance → INSERT ledger_entries (dedup uk_dedup)
  → gl-projection → general_ledger
  → durable replay: bull:accounting-replay
```

## 9. Notification

```
Domain event → EventBusV2 → notification-engine (130+ subscribed events)
  → dispatcher (rate-limited, quiet hours, prefs) → channels (InApp/Push/Email/SMS/Webhook)
  → notification_delivery → notification_audit_trail
  → BullMQ notifications queue → worker → provider
  → realtime push to user:{id}
```

## 10. Logging/audit

```
Audit-gated mutations → recordAudit → audit_logs (pattern-based)
Client errors → /client/errors → client_error_reports
Web vitals → /client/web-vitals → web_vitals_metrics
```