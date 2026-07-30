# CourtZon Enterprise Platform — Volume 15: Notifications

## Notification Architecture

CourtZon uses a unified, event-driven notification system with multi-channel delivery.

**Components:**
- **Event Bus** — `EventBusV2` emits typed domain events
- **Notification Engine** — `notification-engine.ts` consumes events, creates notification records
- **Dispatcher** — `dispatcher.service.ts` routes to channels (in-app, push, email, SMS, WhatsApp, webhook)
- **Providers** — Individual channel implementations
- **Queue** — BullMQ processed by workers

**Evidence:** `modules/notifications/` has 61 files — the largest module.

## Flow

```
Domain Event (e.g., booking:confirmed)
  → EventBusV2.emit()
    → Notification Engine (in-memory handler)
      → Creates notification record
        → Dispatcher
          → In-app (notifications table)
          → Push (FCM/APNs via push provider)
          → Email (mailer service)
          → SMS (Twilio/Vonage)
          → WhatsApp (provider)
          → Webhook (HMAC-signed POST)
```

## 80+ Supported Events

### Bookings (12 events)
`booking:created`, `booking:confirmed`, `booking:cancelled`, `booking:reminder`, `booking:completed`, `booking:auto-cancelled`, `booking:application-declined`, `booking:expired`, `booking:no-show`, `booking:check-in`, `booking:fully-booked`, `booking:rescheduled`

### Payments (5 events)
`payment:completed`, `payment:failed`, `payment:refunded`, `wallet:low-balance`, `wallet:deposit`, `wallet:withdrawal`

### Marketplace (13 events)
`marketplace:order-placed`, `order-confirmed`, `order-shipped`, `order-delivered`, `order-cancelled`, `order-refunded`, `order-status-changed`, `new-review`, `product-back-in-stock`, `price-drop`, `flash-sale`, `new-seller-registered`

### User/Auth (10 events)
`user:registered`, `user:approved`, `user:rejected`, `user:suspended`, `user:activated`, `user:profile-updated`, `user:deleted`, `auth:password-changed`, `auth:password-reset`, `auth:login`, `auth:logout`

### Coaching (4 events)
`coaching:session-scheduled`, `coaching:session-reminder`, `coaching:session-cancelled`, `coach:invited`

### Tournaments (5 events)
`tournament:created`, `tournament:starting-soon`, `tournament:match-scheduled`, `tournament:result`, `tournament:registration-open`

### Academy (3 events)
`academy:enrolled`, `academy:graduated`, `academy:session-reminder`

### HR (available for integration)
Events ready for HR leave approval, payroll posted, etc.

**Evidence:** `modules/notifications/application/template.service.ts` registers 80+ templates in both English and Arabic.

## Notification Preferences

Users can control notification delivery per category:
- **Endpoints:** `GET/PUT /notification-preferences`
- **Per-category toggles:** In-app, push, email, SMS
- **Quiet hours:** `GET/POST/DELETE /notifications/quiet-hours`
- **Channel preferences:** `GET/PUT /notifications/channel-preferences`

**Evidence:** `notification.routes.ts:9-12,39-45`

## Broadcast System

Admins can send broadcast notifications:
- **Target scopes:** `all`, `role`, `organisation`, `branch`, `users`
- **Scheduling:** Optional future date
- **Priority:** low, normal, high, critical

**Evidence:** `admin-broadcast.service.ts`, `AdminBroadcastPage.tsx`

## Webhook Delivery

Outbound webhooks deliver events to external systems:
- **HMAC signing** with SHA-256 per-webhook secret
- **Headers:** `X-CourtZon-Signature`, `X-CourtZon-Event`
- **Timeout:** 10 seconds
- **Retry tracking:** Failed count per webhook

**Evidence:** `notifications/infrastructure/providers/webhook.provider.ts`

## Security Notice (CRITICAL)

25 admin notification routes currently lack permission guards. Any authenticated user can access broadcast, analytics, template, webhook, and A/B test management endpoints. This must be fixed before production.

**Evidence:** `notification.routes.ts:13-46` — routes have `authMiddleware` only.
