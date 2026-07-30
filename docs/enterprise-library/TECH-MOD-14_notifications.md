---
document_id: "TECH-MOD-14"
document_name: "Notifications Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-04"]
  related: ["TECH-MOD-15", "TECH-MOD-20"]
---

# Notifications Module (TECH-MOD-14)

**Source:** `backend/src/modules/notifications/` (6 entries: domain/, application/, commands/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Multi-channel notification delivery system: in-app, push, email, SMS, WhatsApp, webhook. 80+ event types. Supports broadcast, template management with versioning, A/B testing, dead letter queue, quiet hours, channel preferences, device management, client error reporting, web vitals tracking.

## 2. Architecture

```
presentation/ (15 files — largest presentation layer)
  notification.routes.ts           — User notification endpoints
  notification.controller.ts
  notification.dto.ts
  notification-type.routes.ts      — Notification type CRUD
  notification-type.controller.ts
  notification-type.dto.ts
  template-management.routes.ts    — Template CRUD + versioning
  template-management.controller.ts
  template-management.dto.ts
  admin-broadcast.routes.ts        — Broadcast + analytics
  admin-broadcast.controller.ts
  admin-broadcast.dto.ts
  enterprise-admin.controller.ts   — Feature flags, A/B tests, cleanup, webhooks
  monitoring.controller.ts         — Client errors, web vitals
  communication-preference.routes.ts / controller.ts
domain/
  (notification types, templates, delivery)
application/
  (service layer)
infrastructure/
  (repositories, delivery channels)
```

**Evidence:** `notification.routes.ts` (87 lines, 48 routes total across all sub-routers). Template routes file (73 lines).

## 3. Routes (48)

**User notifications** (`notification.routes.ts:11-24`):
- `GET /notifications` — List
- `GET /notifications/unread-count` — Unread count
- `GET /notifications/filters` — Filter options
- `PUT /notifications/:id/read` — Mark read
- `PUT /notifications/read-all` — Mark all read
- `PUT /notifications/:id/archive` — Archive
- `PUT /notifications/archive-all` — Archive all
- `DELETE /notifications/:id` — Delete
- `GET /notification-preferences` — Get preferences
- `PUT /notification-preferences` — Update preferences
- `GET /notifications/reconnect-queue` — Reconnect queue
- `POST /notifications/track` — Track event

**Broadcast (5):** Create, list broadcast history, cancel, analytics, dead letters
**Presence (1):** `GET /admin/notifications/presence`
**Feature Flags (2):** Get, set enterprise feature flags
**A/B Tests (4):** List, create, toggle, get results
**Cleanup (3):** Get policy, update, run
**Event Replay (2):** Replay logs, replay event
**Templates (6):** List, get, create, update, delete, publish, archive, duplicate, preview
**Webhooks (4):** List, create, update, delete
**Channel Preferences (2):** Get, update
**Quiet Hours (3):** Get, upsert, delete
**Devices (2):** List, register
**Audit Trail (1):** Get audit trail
**Monitoring (2):** `POST /client/errors`, `POST /client/web-vitals`

## 4. Permissions

- `notification_templates.view`, `notification_templates.create`, `notification_templates.update`, `notification_templates.delete`, `notification_templates.publish`
- `notification_types.view`, `notification_types.create`, `notification_types.update`, `notification_types.delete`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Notification | `notifications` | `id, user_id, type, title, body, channel, status, read_at, archived_at` |
| Notification Type | `notification_types` | `id, slug, name, channels, category` |
| Template | `notification_templates` | `id, type_id, channel, subject, body, variables, version, status` |
| Broadcast | `notification_broadcasts` | `id, title, body, channels, segment_ids, status, scheduled_at` |
| Device | `user_devices` | `id, user_id, platform, token, is_active` |
| Channel Preference | `notification_channel_preferences` | `id, user_id, channel, enabled` |
| Quiet Hour | `notification_quiet_hours` | `id, user_id, day_of_week, start_time, end_time` |
| Dead Letter | `notification_dead_letters` | `id, notification_id, channel, error, retry_count, status` |
| A/B Test | `notification_ab_tests` | `id, name, type_id, variant_a_template_id, variant_b_template_id, status, results` |
| Cleanup Policy | `notification_cleanup_policies` | `id, retention_days, max_records, enabled` |
| Webhook | `notification_webhooks` | `id, url, events, secret, is_active` |
| Web Vitals | `web_vitals_metrics` | `id, name, value, rating, url, user_agent, created_at` |
| Client Error | `client_error_reports` | `id, message, stack, url, user_agent, created_at` |

## 6. Event Types (80+)

Notification types cover:
- `booking.*` — Created, cancelled, reminder, check-in reminder, matchmaking
- `user.*` — Registered, welcome, password reset, reactivation
- `payment.*` — Charged, confirmed, refunded, failed
- `wallet.*` — Deposit, withdrawal, low balance
- `marketplace.*` — Order placed, shipped, delivered, seller upgrade
- `academy.*` — Enrollment confirmed, session reminder, attendance
- `tournament.*` — Registration confirmed, match scheduled, result
- `league.*` — Team confirmed, match reminder, result
- `organisation.*` — Staff added, coach invited, subscription expiry
- `support.*` — Ticket created, reply, resolved
- `admin.*` — System alerts, security alerts

## 7. Audit Events

- `UPLOAD.CREATE` / `UPLOAD.DELETE` — Upload events
- `SETTINGS.UPDATE` — Settings changes
- `FEATURE_FLAG.TOGGLE` — Feature flag toggles
- `CMS.UPDATE` — CMS content updates

**Evidence:** `audit-log.types.ts` lines 36-42.

## 8. Monitoring

`POST /client/errors` — Client-side JS error reporting (stored in `client_error_reports`)
`POST /client/web-vitals` — Web Vitals (LCP, CLS, FCP, TTFB) reporting (stored in `web_vitals_metrics`)

## 9. Configuration

| Feature | Description |
|---------|-------------|
| Quiet Hours | Per-user time ranges when non-critical notifications are suppressed |
| Channel Preferences | Per-user opt-in/opt-out per channel (email, push, SMS, WhatsApp) |
| Dead Letter Queue | Failed deliveries stored with retry count for manual resolution |
| A/B Testing | Template variant testing with statistical results |
| Event Replay | Re-publish archived events |
| Cleanup Policies | Configurable retention and max records |
| Template Versioning | Full history with rollback support |
| Webhook Management | Per-event-type webhook endpoints with HMAC signing |
