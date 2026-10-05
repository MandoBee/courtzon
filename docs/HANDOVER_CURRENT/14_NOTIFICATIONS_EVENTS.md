# 14 — NOTIFICATIONS & EVENTS

**Audit:** 2026-10-04 · Sources: `notification-engine.ts` (event list), `dispatcher.service.ts`, providers, `server.ts`, Redis queues, live counts (2,571 notifications).

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT/❌ · ❓ UNVERIFIED

---

## 1. EventBus (verified)

- ✅ In-memory `eventBusV2.emit(eventName, data)`.
- ✅ Durable: `OutboxPoller` relays to per-subscriber BullMQ queues; `processed_events` UNIQUE dedup.
- ✅ Command workflow registry (ConfirmBooking, CancelBooking, ExpireBooking, CompleteBooking, ProcessPayment, DepositWallet, WithdrawWallet).

## 2. EVENT → PUBLISHER → CONSUMER → ACTION map (verified domain events)

Representative rows (full list ~130 in engine subscription + business publisher sites):

| Event | Publisher | Consumer → Action | Channel |
|---|---|---|---|
| `payment:succeeded` | payment.service | booking-payment.listener (confirm) · marketplace (order) · academy (enrollment) · wallet (topup) · tournament (registration) · membership P1 (finalize) · accounting (postings) · entitlement-* (release) | in_app/email/push(sim) |
| `payment:failed` | payment.service | booking compensate · marketplace handlePaymentFailed | in_app |
| `payment:refunded` | refund path | entitlement cancel · accounting reversal · booking_cancellations | in_app |
| `booking:created/confirmed/cancelled/expired/checked-in/completed` | booking.service | notification engine; realtime | in_app |
| `marketplace:order-placed/confirmed/shipped/delivered/cancelled/refunded` | marketplace | engine | in_app |
| `marketplace:complaint-*` | complaint service | engine (fresh complaints, decisions, escalation) | in_app |
| `tournament:registration-paid/started/prize-awarded/team-invitation/cancelled/archived/refunded/…` | tournament services | engine | in_app |
| `academy:enrollment-paid/…` | academy | engine | in_app |
| `membership:expiring/payment-received/installment-due/overdue/grace-*/renewal-*` | membership services/workers | engine | in_app |
| `wallet:withdrawal-*` | wallet | engine | in_app |
| `user:registered/approved/…` · `organisation:*` · `auth:password-*` · `security:suspicious-login` | auth/org/security | engine | in_app/email |
| `match:result-*` · `session:*` · `waiting_list:*` · `join_request:*` · `chat:*` etc. | match services | engine | in_app |
| `setting:updated` (security./wallet./payments./booking.) | app-settings | engine → dispatchByPermission(`app-settings.view`) | in_app |

## 3. Engine internals (verified)

- Categories via `getCategorySlug` (bookings / payments / marketplace / tournament / system).
- Dispatch targets: `all`, `role`, `organisation`, `branch`, `users` (bulk) — `dispatcher.service.ts`.
- Respects: `notification_rate_limits`, `user_quiet_hours`, `user_channel_preferences`, category `is_active`, provider priority, feature flags.
- Templates: versioned, draft/publish/archive, scheduled publishing, A/B tests; seeded at boot (`seedTemplates`).
- Digests: hourly (1 min trigger), daily 08:00, weekly Mon 09:00; `processDueDigests`.
- Outbox for notification events is via the same EventBus → BullMQ `notifications` queue.

## 4. Channels (verified)

| Channel | Provider | Status |
|---|---|---|
| In-App | InAppProvider (DB + Socket push) | ✅ PRODUCTION |
| Email | EmailProvider (SMTP or log-only) | 🟡 configured unless SMTP set |
| Push | PushProvider (FCM/APNs) | ⏳ MOCK (returns success) |
| SMS | SMSProvider (Twilio/Vonage) | ⏳ MOCK |
| WhatsApp | WhatsAppProvider | ⏳ NOT REAL (mock/placeholder) |
| Webhook | WebhookProvider (HMAC) | ✅ registered; configured via `notification_webhooks` |

## 5. Failure handling

- ✅ DLQ `notification_dead_letter_queue` + reprocess handler; `process_dead_letter`; provider fallback chain (failover design doc).
- ✅ Audit trail: 20 lifecycle events per notification (`notification_audit_trail`); analytics per channel.
- ✅ Retry: BullMQ attempts + exponential backoff.
- ❓ Real delivery verification for email/SMS/push — nominal.

## 6. Risks / findings

| # | Issue | Severity |
|---|---|---|
| N1 | Push/SMS/WhatsApp deliver **mock success**; users are marked delivered without actual send | MED-HIGH (compliance) |
| N2 | Historical G11.5 defect (prize-awarded subscribed-but-no-op) noted as fixed in code comment; **no regression test found** | MED |
| N3 | `language` for notification defaults `en` in broadcast path (Arabic content gaps) | LOW-MED |
| N4 | Notification rate limits/quiet-hours default values not verified in seeds | ❓ |
| N5 | Orphan events: engine subscribes to events some publishers may never emit (e.g. `auth:2fa-setup`, `club:*`) — harmless but untested | LOW |
| N6 | No global kill-switch UI for notifications besides feature flags | LOW |

## 7. Recommended next verification
1. Run one payment → assert in-app notification + delivery row + socket emit.
2. Enable email dev transport → assert MailHog/SMTP receive.
3. Review `notification_templates` seed completeness vs engine event list (drift check).