# Communication Center — Implementation Roadmap

## Overview

This roadmap translates the approved architecture documents into executable phases. Each phase is independently testable, deployable, and does not break production.

**Status of all architecture documents:** FINAL ✅

---

## Phase Summary

| Phase | Name | Duration | Dependencies | Risk |
|-------|------|----------|-------------|------|
| 0 | Foundation — CLP Expansion | 2 weeks | None | Low |
| 1 | Navigation & Permissions | 1 week | Phase 0 | Low |
| 2 | Notification Types | 2 weeks | Phase 0, 1 | Medium |
| 3 | Template Engine — Translation Keys | 3 weeks | Phase 0, 2 | High |
| 4 | Template Management UI | 2 weeks | Phase 3 | Medium |
| 5 | Campaign Management | 2 weeks | Phase 0, 1 | Medium |
| 6 | Broadcast Engine | 3 weeks | Phase 5 | High |
| 7 | Communication Preferences | 2 weeks | Phase 0, 1 | Low |
| 8 | Email Integration | 3 weeks | Phase 3 | High |
| 9 | SMS Integration | 2 weeks | Phase 3 | Medium |
| 10 | Push Notification Integration | 2 weeks | Phase 3 | Medium |
| 11 | Notification History & Analytics | 2 weeks | Phase 2, 6 | Low |
| 12 | Content Lifecycle Enforcement | 1 week | Phase 0, 2, 5 | Low |

**Total estimated duration:** 23 weeks (sequential) / ~12 weeks (parallelized)

---

## Phase 0: Foundation — CLP Expansion

### Description

Expand the existing translation system to become the CLP. Add translation keys for all modules that are currently missing them (tournament, match, wallet, coach, academy, etc.). This is purely additive — no existing behavior changes.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | No schema changes needed | None | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | translations |
| Services | translations.service — no changes (existing infrastructure handles new keys) |
| Repositories | None |
| Controllers | None |
| Routes | None |
| Events | None |
| Permissions | None |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | None |
| Components | None |
| Stores | None |
| Routes | None |
| Permissions | None |
| **Action** | Add ~200+ new translation keys to `translation-keys.registry.ts` for missing modules |

### Tasks

1. Audit all modules for hardcoded English text currently missing translation keys
2. Add keys to `frontend/src/i18n/translation-keys.registry.ts` for:
   - `tournament.*` (tournament module)
   - `match.*` (match module)
   - `wallet.*` (wallet module)
   - `coach.*` (coach module)
   - `academy.*` (academy module)
   - `membership.*` (membership module)
   - `report.*` (report module)
   - `error.*`, `success.*` (error/success messages)
   - `validation.*` (validation messages — new)
   - `notification.*` (all notification templates)
3. Run `node backend/scripts/sync-translation-keys.js` to sync to database
4. Verify all new keys appear in the admin translation grid
5. Replace hardcoded English strings in components with `t('...')`

### Testing

| Type | Details |
|------|---------|
| Unit | Registry parser outputs correct key count |
| Integration | Sync script inserts expected keys |
| Manual | Admin grid shows all new keys |

### Acceptance Criteria

- [ ] All frontend modules use `t()` for translatable text
- [ ] Admin translation grid lists all 400+ system keys
- [ ] English fallback works for all existing text
- [ ] No regression in existing translations

---

## Phase 1: Navigation & Permissions

### Description

Add sidebar navigation entry for Communication Center. Add permission keys for Communication Center modules.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Permissions use existing RBAC tables | None | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | rbac |
| Services | None |
| Repositories | None |
| Controllers | None |
| Routes | None |
| Events | None |
| Permissions | Add `communication.*` permission keys to `permission_modules` and `permissions` tables |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | None |
| Components | Sidebar menu item for Communication Center |
| Stores | None |
| Routes | Add `/communication/*` route group |
| Permissions | `sidebar.communication` for sidebar visibility, `communication.view` for page access |

### Tasks

1. Register permission keys in `frontend/src/permissions/registry.ts`:
   - `communication.view` — page access
   - `communication.settings` — settings tab
   - `communication.templates` — template management
   - `communication.campaigns` — campaign management
   - `communication.broadcast` — send broadcasts
   - `communication.analytics` — view analytics
   - `communication.publish` — publish campaigns/templates
   - `sidebar.communication` — sidebar tab
2. Run `node backend/scripts/sync-ui-registry.js`
3. Assign permissions to roles via seed data
4. Add sidebar navigation under `/communication`
5. Add route group with permission guard

### Testing

| Type | Details |
|------|---------|
| Unit | Permission keys registered |
| Integration | API returns permissions for communication module |
| Manual | Sidebar shows/hides based on role; unauthorized users get 403 |

### Acceptance Criteria

- [ ] Sidebar shows "Communication" item for authorized roles
- [ ] Permission keys visible in admin UI Permissions screen
- [ ] Routes return 401/403 for unauthorized access

---

## Phase 2: Notification Types

### Description

Create the Notification Types management interface. Admins can view, create, edit, and manage notification types.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Rework `notification_types` table | Current `notification_events` table may need restructuring | Medium | Revert migration | Mandatory |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `NotificationTypeService` — CRUD for notification types |
| Repositories | `NotificationTypeRepository` — find, create, update, delete |
| Controllers | `NotificationTypeController` — REST endpoints |
| Routes | `GET /communication/types`, `POST /communication/types`, `PUT /communication/types/:id`, `DELETE /communication/types/:id` |
| Events | `communication:type-created`, `communication:type-updated`, `communication:type-deleted` |
| Permissions | `communication.templates` |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/communication/types` — list page with table |
| Components | `NotificationTypeForm` — create/edit form, `NotificationTypeTable` — paginated table |
| Dialogs | `DeleteConfirmDialog` |
| Tables | Paginated table with search, filter by module |
| Forms | Name, module, category, icon, enabled/disabled toggle |
| Hooks | `useNotificationTypes` — React Query hooks |
| Stores | None |
| Routes | `/communication/types`, `/communication/types/new`, `/communication/types/:id/edit` |
| Permissions | `communication.templates` |

### Tasks

1. Design `notification_types` table schema
2. Implement backend CRUD
3. Implement frontend list page with table
4. Implement create/edit form
5. Add delete with confirmation
6. Wire permission checks

### Testing

| Type | Details |
|------|---------|
| Unit | Repository CRUD operations, validation |
| Integration | API endpoints return correct data |
| Manual | Create, edit, delete notification types via UI |

### Acceptance Criteria

- [ ] Admin can list all notification types
- [ ] Admin can create a new type
- [ ] Admin can edit existing type
- [ ] Admin can delete type (with confirmation)
- [ ] Types are gated by `communication.templates` permission
- [ ] Validation prevents empty names, duplicate keys

---

## Phase 3: Template Engine — Translation Keys

### Description

The most critical phase. Migrate notification/email/SMS/push templates from storing raw text to storing translation keys. Text moves to `translation_keys`. Templates store key references.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Add `title_key`, `body_key` columns to `notification_templates` | Store translation key references | Medium | `ALTER TABLE DROP COLUMN` | Mandatory |
| Add `variables` JSON column to `notification_templates` | Store expected variable names | Low | `ALTER TABLE DROP COLUMN` | Recommended |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications, translations |
| Services | `TemplateService` — updated to resolve translation keys instead of raw text |
| Repositories | `NotificationTemplateRepository` — CRUD |
| Controllers | `TemplateController` — CRUD endpoints |
| Routes | `GET /communication/templates`, `POST /communication/templates`, `PUT /communication/templates/:id` |
| Events | `communication:template-created`, `communication:template-updated`, `communication:template-deleted` |
| Permissions | `communication.templates` |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/communication/templates` — list page, `/communication/templates/:id` — editor |
| Components | `TemplateEditor` — key selector + variable list, `TemplatePreview` — rendered preview per locale |
| Dialogs | `TemplateVariableDialog` — define expected variables |
| Tables | List of templates with name, type, last modified |
| Forms | Template name, select notification type, title key, body key, variables |
| Hooks | `useTemplates`, `useTranslationKeys` (for key selector) |
| Stores | None |
| Routes | `/communication/templates`, `/communication/templates/:id/edit` |
| Permissions | `communication.templates` |

### Key Design Decision

The template stores KEYS, not text:

```
notification_templates:
  id: 42
  notification_type_id: 1
  title_key: "notification.booking.confirmed.title"
  body_key: "notification.booking.confirmed.body"
  variables: ["bookingId", "courtName", "date"]
  channels: ["in_app", "push", "email"]
```

At dispatch time:
```
title = t(title_key, locale, data)  // Resolved from CLP
body = t(body_key, locale, data)     // Resolved from CLP
```

### Migration Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ MIGRATION PATH FOR EXISTING TEMPLATES                       │
│                                                             │
│ 1. Add title_key, body_key columns (nullable)               │
│ 2. Create correspoding translation_keys for each template   │
│ 3. Migrate existing title_template → translation_keys       │
│ 4. Migrate existing body_template → translation_keys        │
│ 5. Update dispatch logic to use keys when available          │
│ 6. Fallback to raw text if keys are not set (backward compat)│
│ 7. After all templates migrated: deprecate raw text columns │
└─────────────────────────────────────────────────────────────┘
```

### Backward Compatibility

The dispatch logic checks: if `title_key` is set, resolve from CLP. If not, use existing `title_template` as raw text. This allows incremental migration.

### Testing

| Type | Details |
|------|---------|
| Unit | Template resolution from keys, variable interpolation |
| Integration | Dispatch uses keys, resolves correct locale |
| Manual | Create template with keys, trigger notification, verify text loads from CLP |
| Regression | Existing templates without keys still work |

### Acceptance Criteria

- [ ] Admin can create/edit notification templates
- [ ] Title and body are selected from CLP translation keys
- [ ] Template preview renders resolved text per locale
- [ ] Variables are defined and validated against CLP keys
- [ ] Old templates without keys continue to work (backward compat)
- [ ] Notification dispatch uses keys when available

---

## Phase 4: Template Management UI

### Description

Build the full template management admin interface. This extends Phase 3 to include template versioning, variable management, channel configuration, and preview.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Uses tables from Phase 3 | N/A | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | Template versioning (uses existing `template_version` column) |
| Repositories | None |
| Controllers | Extend Phase 3 controllers with version history endpoint |
| Routes | `GET /communication/templates/:id/versions` |
| Events | None |
| Permissions | None |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | Extend Phase 3 pages |
| Components | `TemplateVersionHistory` — version list with diff, `ChannelSelector` — per-channel toggles |
| Dialogs | `VersionDiffDialog` — show changes between versions |
| Tables | Version history table |
| Forms | Channel selection (in_app, push, email, sms), priority selector |
| Hooks | `useTemplateVersions` |

### Acceptance Criteria

- [ ] Template saves increment version number
- [ ] Version history shows all versions with timestamps and authors
- [ ] Admin can view diff between versions
- [ ] Channel selection is persisted
- [ ] Priority setting is persisted

---

## Phase 5: Campaign Management

### Description

Build the campaign management system. Admins create, schedule, and manage marketing campaigns.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Create `campaigns` table | Store campaign metadata, schedule, locale content | Medium | `DROP TABLE` | Mandatory |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `CampaignService` — CRUD, scheduling |
| Repositories | `CampaignRepository` |
| Controllers | `CampaignController` |
| Routes | `GET /communication/campaigns`, `POST /communication/campaigns`, `PUT /communication/campaigns/:id`, `POST /communication/campaigns/:id/publish`, `DELETE /communication/campaigns/:id` |
| Events | `communication:campaign-created`, `communication:campaign-published`, `communication:campaign-ended` |
| Permissions | `communication.campaigns` (view), `communication.publish` (publish) |
| Background jobs | `publish_scheduled_campaign` — cron job to publish campaigns at scheduled date |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/communication/campaigns` — list, `/communication/campaigns/new` — create, `/communication/campaigns/:id` — edit |
| Components | `CampaignForm` — title, body per locale, schedule, targeting, `CampaignStatusBadge` |
| Dialogs | `PublishConfirmDialog`, `CampaignPreviewDialog` |
| Tables | Campaign list with status, schedule, created by |
| Forms | Title (per locale), body (per locale), schedule date, targeting rules |
| Hooks | `useCampaigns` |
| Stores | None |
| Routes | `/communication/campaigns`, `/communication/campaigns/new`, `/communication/campaigns/:id/edit` |
| Permissions | `communication.campaigns`, `communication.publish` |

### Testing

| Type | Details |
|------|---------|
| Unit | Campaign CRUD, status transitions |
| Integration | Schedule → publish → deprecate → archive flow |
| Manual | Create campaign with Arabic + English, schedule, verify publish at correct time |

### Acceptance Criteria

- [ ] Admin can create campaign with per-locale content
- [ ] Campaign has Draft → Review → Publish → Deprecated → Archive lifecycle
- [ ] Scheduled campaigns auto-publish via cron job
- [ ] Published campaigns show to targeted users
- [ ] Expired campaigns auto-deprecate
- [ ] Archived campaigns are hidden but preserved

---

## Phase 6: Broadcast Engine

### Description

Build the broadcast dispatch engine that sends campaigns and system notifications to users via configured channels.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Uses existing `notification_delivery` table | N/A | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `BroadcastService` — dispatch to users by segment |
| Repositories | None |
| Controllers | `BroadcastController` |
| Routes | `POST /communication/broadcast`, `GET /communication/broadcast/:id/status` |
| Events | `communication:broadcast-started`, `communication:broadcast-completed`, `communication:broadcast-failed` |
| Permissions | `communication.broadcast` |
| Background jobs | `process_broadcast` — queue job for batch user delivery |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/communication/campaigns/:id/broadcast` — broadcast setup |
| Components | `BroadcastTargetSelector` — select user segments, `BroadcastProgressBar` — real-time progress |
| Dialogs | `BroadcastConfirmDialog` — confirm before sending to N users |
| Forms | Target segment selection (all, role, organisation, branch, individual users) |
| Hooks | `useBroadcast` |

### Testing

| Type | Details |
|------|---------|
| Unit | Broadcast queue job, segment resolution |
| Integration | Broadcast to 100 users, verify delivery records |
| Manual | Create campaign, broadcast, verify users receive notification |

### Acceptance Criteria

- [ ] Admin can broadcast to all users
- [ ] Admin can broadcast by role, organisation, branch, or individual users
- [ ] Broadcast progress is visible in real-time
- [ ] Failed deliveries are recorded in dead letter queue
- [ ] Large broadcasts are processed via background queue

---

## Phase 7: Communication Preferences

### Description

Allow users to configure their communication preferences — which channels they receive, quiet hours, and which notification types they subscribe to.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Create `user_communication_preferences` table | Store per-user channel/type preferences | Low | `DROP TABLE` | Mandatory |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `UserPreferenceService` — get/set preferences, `PreferenceFilter` — filter dispatch by user prefs |
| Repositories | `UserPreferenceRepository` |
| Controllers | `UserPreferenceController` |
| Routes | `GET /communication/preferences`, `PUT /communication/preferences` |
| Events | None |
| Permissions | None (user's own preferences) |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/profile/communication` — preferences page |
| Components | `ChannelToggle` — in_app/push/email/sms toggles, `QuietHoursSelector` — start/end time, `NotificationTypeToggle` — per-type subscription |
| Forms | Channel enable/disable, quiet hours, per-type toggles |
| Hooks | `useCommunicationPreferences` |

### Testing

| Type | Details |
|------|---------|
| Unit | Preference CRUD, filter logic |
| Integration | User disables email, email is not sent |
| Manual | User changes preferences, next notification respects changes |

### Acceptance Criteria

- [ ] User can view their communication preferences
- [ ] User can enable/disable in_app, push, email, SMS channels
- [ ] User can set quiet hours (notifications suppressed during hours)
- [ ] User can subscribe/unsubscribe per notification type
- [ ] Dispatch respects user preferences (quiet hours, disabled channels)

---

## Phase 8: Email Integration

### Description

Integrate transactional email delivery. Use CLP keys for email subject/body. Send via SMTP or transactional email service.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Uses `notification_templates` with `channel='email'` | N/A | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `EmailProvider` — send via SMTP/SES/SendGrid, `EmailRenderer` — resolve CLP keys → HTML email |
| Repositories | None |
| Controllers | None |
| Routes | None |
| Events | `communication:email-sent`, `communication:email-failed` |
| Permissions | None |
| Background jobs | `send_email` — queue job for async delivery |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | None (uses template editor from Phase 3-4) |
| Components | `EmailPreview` — rendered HTML preview |
| Forms | None |
| Hooks | None |

### Testing

| Type | Details |
|------|---------|
| Unit | Email rendering from CLP keys, HTML template compilation |
| Integration | Email sent via SMTP and delivered to inbox |
| Manual | Trigger notification with email channel, verify email received |

### Acceptance Criteria

- [ ] Transactional emails are sent with CLP-resolved subject/body
- [ ] HTML email template renders correctly
- [ ] Plain text fallback is generated
- [ ] Bounce handling is configured
- [ ] Email delivery status is tracked

---

## Phase 9: SMS Integration

### Description

Integrate SMS delivery for short transactional messages. Use CLP keys for SMS body.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Uses `notification_templates` with `channel='sms'` | N/A | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `SmsProvider` — send via SMS gateway (Twilio, AWS SNS, local), `SmsRenderer` — resolve CLP keys, enforce length limits |
| Repositories | None |
| Controllers | None |
| Routes | None |
| Events | `communication:sms-sent`, `communication:sms-failed` |
| Permissions | None |
| Background jobs | `send_sms` — queue job |

### Testing

| Type | Details |
|------|---------|
| Unit | SMS body length enforcement, CLP key resolution |
| Integration | SMS sent via gateway |
| Manual | Trigger SMS notification, verify phone receives it |

### Acceptance Criteria

- [ ] SMS bodies respect 160-character limit per segment
- [ ] Unicode (Arabic) SMS handling works
- [ ] SMS delivery status is tracked
- [ ] Long messages are split into segments

---

## Phase 10: Push Notification Integration

### Description

Integrate push notification delivery via Firebase Cloud Messaging (FCM) and/or Apple Push Notification Service (APNS).

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Create `user_device_tokens` table | Store FCM/APNS tokens per user | Low | `DROP TABLE` | Mandatory |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `PushProvider` — send via FCM/APNS, `DeviceTokenService` — register/revoke tokens |
| Repositories | `DeviceTokenRepository` |
| Controllers | `DeviceTokenController` |
| Routes | `POST /communication/devices`, `DELETE /communication/devices/:token` |
| Events | `communication:push-sent`, `communication:push-failed` |
| Permissions | None (user's own devices) |
| Background jobs | `send_push` — queue job |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | None |
| Components | None (token registration happens automatically in background) |
| Hooks | `usePushTokenRegistration` — request permission, register token |

### Testing

| Type | Details |
|------|---------|
| Unit | Token registration/revocation, push rendering |
| Integration | Push sent via FCM and received on device |
| Manual | Trigger push notification, verify on device |

### Acceptance Criteria

- [ ] User devices are registered for push notifications
- [ ] Push notifications are sent via FCM/APNS
- [ ] Title and body use CLP-resolved text
- [ ] Deep link is included in push payload
- [ ] Token revocation on logout
- [ ] Delivery status is tracked

---

## Phase 11: Notification History & Analytics

### Description

Build the notification history view for users and analytics dashboard for admins.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| None | Uses existing `notification_delivery`, `notification_analytics` tables | N/A | N/A | N/A |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | notifications |
| Services | `AnalyticsService` — delivery rates, channel breakdown, user engagement |
| Repositories | None |
| Controllers | `AnalyticsController` |
| Routes | `GET /communication/analytics/overview`, `GET /communication/analytics/channels`, `GET /communication/analytics/templates` |
| Events | None |
| Permissions | `communication.analytics` |
| Background jobs | None |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | `/communication/analytics` — admin dashboard |
| Components | `DeliveryRateChart` — bar/line chart, `ChannelBreakdown` — pie chart, `EngagementTable` — top templates by engagement |
| Tables | Notification history for users (already exists) |
| Hooks | `useAnalytics` |

### Testing

| Type | Details |
|------|---------|
| Unit | Analytics calculation, date range filtering |
| Manual | View analytics dashboard after sending notifications |

### Acceptance Criteria

- [ ] Admin dashboard shows delivery rate per channel
- [ ] Admin can filter by date range
- [ ] User can view their notification history
- [ ] User can see notification status (delivered, read, failed)

---

## Phase 12: Content Lifecycle Enforcement

### Description

Implement the CLS policies from the Content Lifecycle Standard. Add stale translation detection, audit logging for template changes, and campaign lifecycle enforcement.

### Database Impact

| Migration | Reason | Risk | Rollback | Mandatory |
|-----------|--------|------|----------|-----------|
| Add `status` column to `translations` | Track draft/review/approved states | Low | `ALTER TABLE DROP COLUMN` | Optional |

### Backend Impact

| Item | Details |
|------|---------|
| Modules | translations, notifications |
| Services | `TranslationLifecycleService` — stale detection, status transitions |
| Repositories | None |
| Controllers | None |
| Routes | None |
| Events | None |
| Permissions | `translations.publish` |
| Background jobs | `detect_stale_translations` — weekly cron, `archive_expired_campaigns` — daily cron |

### Frontend Impact

| Item | Details |
|------|---------|
| Pages | None (extends existing admin translation grid) |
| Components | `StaleBadge` — indicator on stale translations |
| Dialogs | None |
| Tables | Extends translation grid with `status` column |

### Testing

| Type | Details |
|------|---------|
| Unit | Stale detection logic, status transitions |
| Integration | English key updated, translation marked stale |
| Manual | Admin approves translation, it becomes published |

### Acceptance Criteria

- [ ] Translations can optionally use Draft → Published workflow
- [ ] Stale translations are visually marked in admin grid
- [ ] Campaign lifecycle is enforced (no publish without approval)
- [ ] Translation changes are audited via `recordAudit()`
- [ ] 30-day key deprecation works (keys removed from registry are not immediately deleted)

---

## Dependency Graph

```
Phase 0 ──────────────────────────────────────────────────────────────
  │
  ├──▶ Phase 1 ───▶ Phase 2 ───▶ Phase 3 ───▶ Phase 4
  │                                      │
  │                                      ├──▶ Phase 8 (Email)
  │                                      ├──▶ Phase 9 (SMS)
  │                                      └──▶ Phase 10 (Push)
  │
  └──▶ Phase 5 ───▶ Phase 6 (Broadcast Engine)
         │
         └──▶ Phase 7 (Preferences) ───▶ (applies to all channels)
                                              │
                                              └──▶ Phase 11 (Analytics)

Phase 12 applies across all phases (can run in parallel starting from Phase 2)
```

### Parallel Execution Plan

| Track | Phases | Team |
|-------|--------|------|
| **Core CLP** | 0, 1, 12 | Backend + Frontend |
| **Templates** | 2, 3, 4 | Backend + Frontend |
| **Campaigns** | 5, 6 | Full-stack |
| **Preferences** | 7 | Backend + Frontend |
| **Channels** | 8, 9, 10 | Backend-heavy |
| **Analytics** | 11 | Backend + Frontend |

Recommended: Run Core + Templates tracks in parallel, then Channels, then Analytics.

---

## Deployment Plan

### Per-Phase Deployment

Each phase follows the same deployment protocol:

```
1. Merge feature branch to master
2. Run database migrations (if any)
3. Run backend tests
4. Build Docker images
5. Deploy backend
6. Run frontend build
7. Deploy frontend
8. Verify health endpoints
9. Run smoke tests
10. Run phase-specific acceptance tests
11. Mark phase complete
```

### Feature Flags

| Phase | Feature Flag | Purpose |
|-------|-------------|---------|
| 2 | `communication_types_enabled` | Gate notification types UI |
| 3 | `template_key_resolution` | Enable CLP key resolution in dispatch |
| 5 | `campaigns_enabled` | Gate campaign management UI |
| 6 | `broadcast_enabled` | Gate broadcast functionality |
| 8 | `email_enabled` | Gate email channel |
| 9 | `sms_enabled` | Gate SMS channel |
| 10 | `push_enabled` | Gate push channel |

### Rollback Procedure

```bash
# 1. Revert feature flag
# 2. If migration: run rollback script
# 3. Revert code to previous commit
# 4. Rebuild and redeploy
# 5. Verify rollback
```

---

## Summary

| Phase | Name | Duration | Risk | Has Migration | Has Feature Flag |
|-------|------|----------|------|-------------|-----------------|
| 0 | CLP Expansion | 2 weeks | Low | No | No |
| 1 | Navigation & Permissions | 1 week | Low | No | No |
| 2 | Notification Types | 2 weeks | Medium | Yes | Yes |
| 3 | Template Engine — Keys | 3 weeks | High | Yes | Yes |
| 4 | Template Management UI | 2 weeks | Medium | No | Yes |
| 5 | Campaign Management | 2 weeks | Medium | Yes | Yes |
| 6 | Broadcast Engine | 3 weeks | High | No | Yes |
| 7 | Communication Preferences | 2 weeks | Low | Yes | No |
| 8 | Email Integration | 3 weeks | High | No | Yes |
| 9 | SMS Integration | 2 weeks | Medium | No | Yes |
| 10 | Push Integration | 2 weeks | Medium | Yes | Yes |
| 11 | History & Analytics | 2 weeks | Low | No | No |
| 12 | Content Lifecycle | 1 week | Low | Optional | No |

**Total:** 13 phases, ~23 weeks sequential, ~12 weeks parallelized.

**Key risk:** Phase 3 (Template Engine — Translation Keys). This is the most architecturally significant change. The backward compatibility layer ensures production safety, but the template key resolution logic must be thoroughly tested.
