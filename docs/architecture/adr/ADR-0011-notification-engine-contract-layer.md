# ADR-0011: Notification Engine & Contract Layer

## Status

Accepted

## Context

CourtZon sends notifications for a wide variety of events — over 80 distinct event types across bookings, payments, marketplace, matches, coaching, tournaments, and system events. Each notification must:

1. Be triggerable from any module via EventBus events
2. Support multiple delivery channels (in-app, push, email, SMS)
3. Use configurable templates per event + locale
4. Rate-limit users per category to prevent spam
5. Support digest summaries for non-urgent notifications
6. Provide quiet hours support (don't send at night)
7. Track delivery status (queued, delivered, failed)
8. Support A/B testing of message variants

The notification system needed to be scalable, configurable, and decoupled from individual modules.

## Decision

Build a **Notification Engine** with the following architecture:

**1. Event-driven dispatch**

The `NotificationEngine` subscribes to `eventBusV2` events via `eventBusV2.on()` and routes them to handlers defined in `eventGroups`. Each handler calls `dispatchToUser()` which:

1. Resolves a template via `TemplateService` (Handlebars templates per event + locale)
2. Checks rate limits per user + category
3. Accumulates digestable notifications into digest windows
4. Creates a `notifications` database record
5. Adds a `process_notification` job to the BullMQ queue

**2. Template system**

Templates are stored in the `notification_templates` table with:
- `event_name` + `locale` as the lookup key
- Handlebars syntax for variable interpolation
- `title_template`, `body_template`, `action_key` fields
- Versioning for tracking changes over time

**3. Multi-channel delivery pipeline**

The queue worker (`notification.worker.ts`):
1. Checks quiet hours (per-user or global configuration)
2. Routes to channel providers via the provider registry:
   - `InAppProvider` — emits Socket.IO events for real-time display
   - `PushProvider` — sends push notifications (future)
   - `EmailProvider` — sends transactional emails (future)
3. Tracks delivery status in `notification_delivery` table
4. Retries failed deliveries with exponential backoff
5. Dead-letter queue for persistently failing notifications

**4. Deep linking contract**

Every notification includes an `action` field (see ADR-0002):

```typescript
interface NotificationAction {
  route: string;
  tab?: string;
  params?: Record<string, ...>;
}
```

The backend is the single source of truth for navigation — the frontend simply calls `navigate(action.route)`.

**5. NotificationAction contract**

The `NotificationAction` type is defined in `@courtzon/shared` and shared between backend and frontend (see ADR-0001, ADR-0012).

## Consequences

**Benefits:**
- Event-driven architecture decouples notification logic from business logic
- Template system makes notification copy configurable without code changes
- Rate limiting prevents abuse
- Digest support reduces notification fatigue
- Multi-channel delivery enables future push/email/SMS support
- Complete delivery tracking (queued → processing → delivered/failed)
- Deep linking ensures users always navigate to the correct screen

**Trade-offs:**
- The template system adds complexity — each event needs a template per locale
- The queue-based delivery pipeline adds latency (milliseconds for in-app, seconds for push/email)
- Rate limiting means some notifications are silently dropped — users may miss events if they exceed limits
- The notification system is one of the most complex subsystems in the platform

**Alternatives rejected:**
- *Synchronous notification dispatch*: Would slow down the API response; more importantly, a failed notification (e.g., email server down) would cause the API request to fail
- *No templates*: Notification copy would be hardcoded in TypeScript, requiring code changes for text updates
- *No rate limiting*: Risk of spam (e.g., 50 booking reminders in 5 minutes)
- *Centralised notification service*: Separate service would add network latency and deployment complexity

**Future considerations:**
- Push notifications via Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNS)
- Email notifications via SendGrid or AWS SES
- SMS notifications for critical alerts (booking reminders, payment confirmations)
- Webhook notifications for enterprise integrations
- Unsubscribe/preference management per notification category
- The `OutboxPoller` should be activated for reliable dispatch of notifications whose events were emitted during a transaction
