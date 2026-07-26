# Communication Center — Implementation Readiness Review

**Audit date:** 2026-07-26
**Status:** Pre-implementation audit
**Decision:** PENDING

---

## PART 1 — CLP Readiness

### 1.1 Translation Registry Coverage

| Metric | Count | Readiness |
|--------|-------|-----------|
| Existing translation keys | 617 | ✅ Good base |
| Modules with coverage | 27 | ✅ Broad coverage |
| Modules with ZERO coverage | ~15 | ❌ Major gap |
| Backend hardcoded error messages | ~150+ | ❌ Major gap |

### 1.2 Modules Missing Translation Keys

The following modules have zero representation in `translation-keys.registry.ts`:

- `activities` (templates, academies, coaching)
- `tournaments`
- `membership`
- `support` (tickets)
- `security` (login alerts, account lock)
- `club`
- `academy`
- `friends`
- `chat`
- `attendance`
- `subscription`
- `rbac`
- `features` (feature flags)
- `coupon`

**Impact:** These modules will show hardcoded English text to non-English users.

### 1.3 Backend Error System — CRITICAL GAP

**There is no backend i18n system.** Every backend error message is hardcoded English:

| Error location | Count | Example |
|---------------|-------|---------|
| `app-error.ts` | 4 base classes | `'Entity not found'` |
| `auth.errors.ts` | 6 | `'Invalid phone number or password'` |
| `booking.service.ts` | ~15 | `'One or more slots are no longer available'` |
| `payment.service.ts` | ~10 | `'Invalid webhook signature'` |
| `activities.service.ts` | ~50+ | `'Tournament is full'` |
| `community.service.ts` | ~40+ | `'Cannot friend yourself'` |
| Zod validation DTOs | ~20 | `'Use YYYY-MM-DD format'` |

**Required for CLP compliance:** All user-facing backend errors must use error codes that the frontend can resolve via translation keys.

### 1.4 Migration Checklist

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | Create error code registry in backend | High | 3 days |
| 2 | Migrate app-error.ts to use error codes | High | 1 day |
| 3 | Migrate all service-level errors (booking, payment, auth, wallet, match) | High | 5 days |
| 4 | Migrate Zod validation messages to error codes | Medium | 2 days |
| 5 | Migrate activities.service.ts (~50 errors) | Medium | 3 days |
| 6 | Migrate community.service.ts (~40 errors) | Medium | 2 days |
| 7 | Add missing module translation keys (15 modules) | Medium | 3 days |
| 8 | Add admin sidebar labels (~50 keys) | Medium | 1 day |
| 9 | Add admin CRUD button text (~60 instances) | Medium | 2 days |
| 10 | Replace hardcoded frontend strings with `t()` calls | Medium | 5 days |

---

## PART 2 — Communication Engine Readiness

### 2.1 What Is Already Reusable

| Component | Status | Reusability |
|-----------|--------|-------------|
| `eventBusV2` | ✅ Existing | Fully reusable for triggering notifications |
| `notification-engine.ts` | ✅ Existing | Handles 75+ event types, maps to dispatch |
| `dispatcher.service.ts` | ✅ Existing | `dispatchToUser`, `dispatchByRole`, `dispatchByOrg`, `dispatchToAll`, `dispatchByBranch`, `dispatchByUserIdsBulk` |
| `notification.repository.ts` | ✅ Existing | CRUD for notification records, filtering, preferences |
| `template.service.ts` | ⚠ Partial | Template resolution exists but stores raw text, not translation keys |
| `notification-platform.impl.ts` | ✅ Existing | List, mark read, archive, soft delete, reconnect queue |
| Socket publisher (`socket-publisher.ts`) | ✅ Existing | Real-time notification delivery |
| `in-app.provider.ts` | ✅ Existing | Delivers in-app notifications via socket events |
| `notification.worker.ts` | ✅ Existing | Queue-based delivery processing |

### 2.2 What Must Change

| Component | Change Required | Priority |
|-----------|----------------|----------|
| `template.service.ts` | Replace raw text storage with translation key references | High |
| `template.service.ts` | Remove inline `seedTemplates()` — migrate to DB-stored templates | Medium |
| `dispatcher.service.ts` | Resolve template text via CLP keys at dispatch time | High |
| `notification-engine.ts` | Add `action.route` to every handler (completed) | ✅ Done |
| `notification_templates` schema | Add `title_key`, `body_key` columns | High |

### 2.3 What Must NOT Change

| Component | Reason |
|-----------|--------|
| `eventBusV2` | Notification triggering works correctly. No changes needed. |
| `event-bus.v2.ts` | Transaction-aware dispatch is working. |
| `socket-publisher.ts` | Real-time delivery is independent of text resolution. |
| `in-app.provider.ts` | Socket event format is fine. |
| `notification.repository.ts` | CRUD operations are independent of text content. |
| `dispatcher.service.ts` dispatch logic | The dispatch pipeline (rate limiting, digest, queue) is independent of text resolution. |

---

## PART 3 — Database Readiness

### 3.1 Existing Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `translation_keys` | Master catalog of all translatable keys | ✅ Exists |
| `translations` | Locale-specific overrides | ✅ Exists |
| `languages` | Language definitions | ✅ Exists |
| `notification_templates` | Template storage (title_key/body_key need adding) | ⚠ Needs migration |
| `notification_categories` | Notification categories | ✅ Exists |
| `notification_actions` | Action key registry | ✅ Exists |
| `notifications` | Per-user notification records | ✅ Exists |
| `notification_delivery` | Delivery tracking | ✅ Exists |
| `notification_analytics` | Analytics events | ✅ Exists |
| `notification_rate_limits` | Rate limiting | ✅ Exists |
| `notification_digest_windows` | Digest accumulation | ✅ Exists |
| `notification_dead_letter_queue` | Failed deliveries | ✅ Exists |

### 3.2 Required Migrations

| Migration | Table | Reason | Risk | Rollback |
|-----------|-------|--------|------|----------|
| M1 | `notification_templates` | Add `title_key` VARCHAR(500) NULL, `body_key` VARCHAR(500) NULL. Backward compatible — NULL means use existing raw text. | Low | `ALTER TABLE DROP COLUMN` |
| M2 | `notification_templates` | Add `variables` JSON NULL. Store expected variable names for key resolution. | Low | `ALTER TABLE DROP COLUMN` |
| M3 | `campaigns` (new) | Create campaigns table. | Medium | `DROP TABLE` |
| M4 | `user_device_tokens` (new) | Create device tokens table for push. | Low | `DROP TABLE` |
| M5 | `user_communication_preferences` (new) | Create preferences table. | Low | `DROP TABLE` |
| M6 | `translations` | Add optional `status` VARCHAR(20) for draft/review/approved lifecycle. | Low | `ALTER TABLE DROP COLUMN` |

### 3.3 Migration Risks

| Migration | Risk | Mitigation |
|-----------|------|------------|
| M1 | Existing templates continue to work (NULL keys = fallback to raw text) | ✅ None |
| M3 | Campaign table is additive — no existing data affected | ✅ None |
| M4 | Device tokens table is additive | ✅ None |
| M5 | Preferences table is additive | ✅ None |
| M6 | Status column is optional, nullable | ✅ None |

**Conclusion:** All migrations are additive and backward compatible. No rollback risk.

---

## PART 4 — Backend Readiness

### 4.1 Implementation Gaps by Phase

| Phase | Routes | Services | Controllers | Ready? |
|-------|--------|----------|-------------|--------|
| 0 — CLP Expansion | ✅ Public translations endpoint exists | ✅ `translations.service.ts` exists | ✅ Exists | **Ready** |
| 1 — Navigation/Permissions | ❌ `/communication/*` routes need creation | ❌ Permission registration script exists | ❌ Needs creation | **Not ready** |
| 2 — Notification Types | ❌ CRUD routes needed | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 3 — Template Keys | ❌ Template CRUD with key support | ⚠ `template.service.ts` exists but needs refactoring | ❌ Needs creation | **Not ready** |
| 4 — Template UI | ❌ Version history endpoint | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 5 — Campaigns | ❌ CRUD + lifecycle routes | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 6 — Broadcast | ❌ Broadcast endpoint | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 7 — Preferences | ❌ User preference endpoints | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 8 — Email | ❌ SMTP/SES integration | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 9 — SMS | ❌ SMS gateway integration | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 10 — Push | ❌ FCM/APNS integration | ❌ Needs creation | ❌ Needs creation | **Not ready** |
| 11 — Analytics | ❌ Analytics endpoints | ⚠ Existing analytics table but no service | ❌ Needs creation | **Not ready** |
| 12 — Lifecycle | ❌ Stale detection job | ❌ Needs creation | ❌ Needs creation | **Not ready** |

### 4.2 Existing Backend Components (Ready)

| Component | Status | Notes |
|-----------|--------|-------|
| `eventBusV2` | ✅ Ready | Used for triggering notifications |
| `notification-engine.ts` | ✅ Ready | Maps events to dispatch handlers |
| `dispatcher.service.ts` | ✅ Ready | Full dispatch pipeline |
| `notification.repository.ts` | ✅ Ready | CRUD + filtering |
| `notification-platform.impl.ts` | ✅ Ready | List, read, archive, delete |
| `in-app.provider.ts` | ✅ Ready | Socket delivery |
| `notification.worker.ts` | ✅ Ready | Queue processing |
| `translations.service.ts` | ✅ Ready | CRUD + public bundle |
| `translation-keys.repository.ts` | ✅ Ready | Key management |
| `translations.repository.ts` | ✅ Ready | Translation value management |
| `translation-registry-parser.ts` | ✅ Ready | Registry sync |
| Sync script | ✅ Ready | Key synchronization |

---

## PART 5 — Frontend Readiness

### 5.1 Implementation Gaps by Phase

| Phase | Pages | Components | Routes | Permissions | Ready? |
|-------|-------|-----------|--------|-------------|--------|
| 0 — CLP Expansion | ✅ None needed | ✅ `LanguageSwitcher` exists | ✅ `/public/translations/:locale` | ✅ `translations.*` | **Ready** |
| 1 — Navigation | ❌ Need `/communication` route group | ❌ Sidebar item | ❌ `/communication/*` | ❌ `communication.*` | **Not ready** |
| 2 — Notification Types | ❌ List/Create/Edit pages | ❌ Table, Form, Dialog | ❌ CRUD routes | ❌ Needs registration | **Not ready** |
| 3 — Template Keys | ❌ Template editor | ❌ Key selector, preview | ❌ CRUD routes | ❌ Needs registration | **Not ready** |
| 4 — Template UI | ❌ Version history | ❌ Version diff, channel selector | ❌ Version route | ❌ Same as Phase 3 | **Not ready** |
| 5 — Campaigns | ❌ Campaign management pages | ❌ Form, preview, status badge | ❌ CRUD + publish routes | ❌ Needs registration | **Not ready** |
| 6 — Broadcast | ❌ Broadcast setup page | ❌ Target selector, progress bar | ❌ Broadcast route | ❌ Needs registration | **Not ready** |
| 7 — Preferences | ❌ Profile communication page | ❌ Channel toggles, quiet hours | ❌ Preferences route | ✅ Self-service | **Not ready** |
| 8 — Email | ❌ None needed | ❌ Email preview component | ❌ None | ❌ N/A | **Not ready** |
| 9 — SMS | ❌ None needed | ❌ None | ❌ None | ❌ N/A | **Not ready** |
| 10 — Push | ❌ None needed | ❌ Token registration hook | ❌ Device route | ✅ Self-service | **Not ready** |
| 11 — Analytics | ❌ Dashboard page | ❌ Charts, tables | ❌ Analytics routes | ❌ Needs registration | **Not ready** |
| 12 — Lifecycle | ❌ Extend translation grid | ❌ Stale badge | ❌ None | ❌ `translations.publish` | **Not ready** |

### 5.2 Existing Frontend Components (Ready)

| Component | Status | Notes |
|-----------|--------|-------|
| `useTranslation()` | ✅ Ready | Universal translation hook |
| `t()` function | ✅ Ready | Resolves + interpolates |
| `LanguageSwitcher` | ✅ Ready | Language selection dropdown |
| `TranslationsPage` | ✅ Ready | Admin translation grid |
| `LocalePackEditorModal` | ✅ Ready | Per-locale translation editor |
| `NotificationBell` | ✅ Ready | Bell dropdown |
| `NotificationsPage` | ✅ Ready | Notification list |
| `NotificationDetailModal` | ✅ Ready | Notification detail view |
| Translation registry | ✅ Ready | 617 keys defined |
| Zustand i18n store | ✅ Ready | State management for locale/bundle |
| Permission registry | ✅ Ready | `translations.*` keys exist |

---

## PART 6 — Production Readiness

### 6.1 Build Verification

| Check | Status |
|-------|--------|
| Backend TypeScript (`tsc --noEmit`) | ✅ Passes |
| Frontend TypeScript (`tsc --noEmit`) | ✅ Passes |
| Backend tests (vitest) — 651 tests | ✅ Passes |
| Architecture validators (0 errors) | ✅ Passes |
| Docker backend build | ✅ Passes |
| Docker frontend build | ✅ Passes |
| Health checks | ✅ All endpoints ok |
| CI validation | ✅ Passes |

### 6.2 Environment Configuration

| Variable | Exists? | Used By |
|----------|---------|---------|
| `WEBHOOK_BASE_URL` | ✅ Yes | Payment webhooks |
| `PAYMOB_*` credentials | ✅ Yes | Payment gateway |
| `REDIS_HOST/PORT` | ✅ Yes | Redis |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | ✅ Yes | Database |
| `JWT_SECRET` / `SESSION_SECRET` | ✅ Yes | Authentication |
| `STORAGE_PROVIDER` | ✅ Yes | File uploads |
| `METRICS_TOKEN` | ✅ Yes | Prometheus |
| SMTP credentials | ❌ Missing | Email integration (Phase 8) |
| SMS gateway credentials | ❌ Missing | SMS integration (Phase 9) |
| FCM/APNS credentials | ❌ Missing | Push notifications (Phase 10) |

### 6.3 Feature Flags

| Flag | Exists? | Purpose |
|------|---------|---------|
| `NOTIFICATION_V2_DISPATCH` | ✅ Yes | Enable V2 notification dispatch |
| `communication_types_enabled` | ❌ Missing | Phase 2 |
| `template_key_resolution` | ❌ Missing | Phase 3 |
| `campaigns_enabled` | ❌ Missing | Phase 5 |
| `broadcast_enabled` | ❌ Missing | Phase 6 |
| `email_enabled` | ❌ Missing | Phase 8 |
| `sms_enabled` | ❌ Missing | Phase 9 |
| `push_enabled` | ❌ Missing | Phase 10 |

---

## PART 7 — Technical Debt

### Critical

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **CD-01** | No backend i18n/error code system | Entire backend | All error messages are hardcoded English. No locale-aware error responses. |
| **CD-02** | No `unhandledRejection` / `uncaughtException` handlers | `server.ts` | Unhandled rejections crash the process silently. |

### High

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **HD-01** | ~150+ hardcoded error messages in backend services | booking, payment, auth, wallet, activities, community | Cannot be translated. All non-English users see English errors. |
| **HD-02** | ~50 hardcoded sidebar labels | `AdminSidebar.tsx` | Administrative UI is English-only. |
| **HD-03** | ~60 hardcoded admin button labels | 20+ admin page files | CRUD operations show English text to all users. |
| **HD-04** | ~20 hardcoded Zod validation messages | DTOs across auth, booking, scheduling | Validation errors are English-only. |
| **HD-05** | 15 modules with zero translation key coverage | Registry | Tournament, academy, membership, support, club, chat, etc. are all English-only. |

### Medium

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **MD-01** | Notification templates store raw text | `template.service.ts` / `notification_templates` | Cannot use CLP keys for notification text. |
| **MD-02** | Notification template seed data inline | `template.service.ts` | 127 templates hardcoded in TypeScript, not DB-managed. |
| **MD-03** | No language switcher in UI | Frontend settings | Users cannot change language without localStorage manipulation. |
| **MD-04** | User locale not consistently applied | `auth.store.ts` | Language preference from profile not always loaded. |
| **MD-05** | Missing feature flags for communication phases | — | Cannot safely gate new functionality. |

### Low

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **LD-01** | No RTL CSS audit | Frontend | Arabic layout may have visual issues. |
| **LD-02** | No monitoring for Prometheus/Grafana | Infrastructure | Not deployed (documented in production-readiness.md). |
| **LD-03** | No off-site backups | Infrastructure | Backups are local only (Critical per production-readiness.md). |
| **LD-04** | OutboxPoller not started | `outbox-poller.ts` | Event outbox not consumed (documented). |

---

## PART 8 — Sprint Validation

### 8.1 Phase Order Validation

| Phase | As Proposed | Correct? | Reason |
|-------|------------|----------|--------|
| 0 — CLP Expansion | First | ✅ | Foundation for all text. Must come first. |
| 1 — Navigation/Permissions | Second | ✅ | Entry point for Communication Center UI. |
| 2 — Notification Types | Third | ✅ | Core entity for template association. |
| 3 — Template Keys | Fourth | ✅ | Depends on notification types existing. |
| 4 — Template UI | Fifth | ✅ | UI layer on top of template engine. |
| 5 — Campaigns | Sixth | ⚠ | Could move earlier if needed. No dependency on Phases 2-4. |
| 6 — Broadcast | Seventh | ✅ | Depends on campaigns existing. |
| 7 — Preferences | Eighth | ⚠ | Could move earlier. No dependency on other phases. |
| 8 — Email | Ninth | ✅ | Depends on template key resolution (Phase 3). |
| 9 — SMS | Tenth | ✅ | Depends on Phase 3. |
| 10 — Push | Eleventh | ✅ | Depends on Phase 3. |
| 11 — Analytics | Twelfth | ✅ | Only meaningful after notifications are being sent. |
| 12 — Lifecycle | Parallel | ✅ | Can run from Phase 2 onward. |

### 8.2 Reorder Recommendation

**One change recommended:**

- **Phase 5 (Campaigns) should move AFTER Phase 7 (Preferences)** — Campaigns target users based on preferences. Knowing the preference data model first will inform campaign targeting design.
- **Phase 7 (Preferences) should move to position 4** (before Templates) — Preferences are self-contained and provide the user model that both Templates and Campaigns depend on.

**Revised order:**
```
0 → 1 → 2 → 7 → 3 → 4 → 5 → 6 → 8 → 9 → 10 → 11 → 12
```

This change is technically motivated: preferences define the data model for user communication settings that templates and campaigns both reference.

---

## PART 9 — Final Go / No-Go

### 9.1 Readiness Score

| Category | Score | Assessment |
|----------|-------|------------|
| **Translation infrastructure** | 80% | Core infrastructure exists. Registry, sync, bundle, t() all work. |
| **Backend error system** | 0% | No backend i18n system exists. This is the biggest gap. |
| **Notification engine** | 70% | Dispatch pipeline works. Template text resolution needs migration. |
| **Frontend translation coverage** | 40% | 617 keys exist but ~150+ hardcoded strings remain. |
| **Database readiness** | 90% | All existing tables are ready. 6 additive migrations needed. |
| **Build & test** | 100% | All checks pass. |
| **Production infrastructure** | 70% | Monitoring, backups, and error handling have documented gaps. |
| **Overall** | **64%** | Not yet ready for full implementation. |

### 9.2 Blocking Issues

| Issue | Blocks | Reason |
|-------|--------|--------|
| **No backend i18n error system** | Phase 0 (CLP Expansion) | Backend errors are hardcoded English. CLP requires all user-facing text to be translatable. Without error codes, the CLP cannot cover error messages. |

**Resolution:** Create backend error code system before Phase 0. Estimated 3-4 days.

### 9.3 Non-Blocking Issues

| Issue | Does Not Block | Workaround |
|-------|---------------|------------|
| Hardcoded frontend sidebar labels | Phase 0 | Can be migrated incrementally. |
| Missing 15 module translation keys | Phase 0 | Add during Phase 0. |
| Hardcoded admin button text | Phase 0 | Can be migrated incrementally. |
| No language switcher in UI | Phase 0 | Users can use `en` only until Phase 7. |
| No SMTP/SMS/push credentials | Phase 8-10 | These are future phases. |

### 9.4 Recommended First Implementation Phase

**Phase 0 (CLP Expansion)** with ONE prerequisite:

> **Prerequisite:** Create backend error code system (3-4 days)

After the prerequisite is complete, Phase 0 can begin:

1. Add ~200+ translation keys for missing modules
2. Add admin sidebar labels (~50 keys)
3. Add admin button text (~60 instances via `common.save`, `common.cancel`, `common.create`)
4. Replace hardcoded frontend strings with `t()` calls
5. Sync keys to database
6. Verify in admin translation grid

### 9.5 Estimated Implementation Risk

| Risk Factor | Level | Mitigation |
|-------------|-------|------------|
| Backend error code system | Medium | New system, but additive — existing code continues to work |
| Notification template key migration | High | Backward compatibility layer ensures production safety |
| Campaign management | Medium | New feature, no existing code affected |
| Email/SMS/Push integration | Medium | External service dependencies |
| Translation coverage expansion | Low | Purely additive — no existing code changes |

### 9.6 Final Decision

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   CLP READINESS:           64% — CONDITIONAL GO         │
│                                                         │
│   BLOCKING ISSUES:         1 (backend error system)     │
│   NON-BLOCKING ISSUES:     5                            │
│   CRITICAL DEBT:           2                            │
│   HIGH DEBT:               5                            │
│                                                         │
│   DECISION:               CONDITIONAL GO                │
│                                                         │
│   CONDITION:              Create backend error code      │
│                           system FIRST (3-4 days),       │
│                           then proceed with Phase 0.     │
│                                                         │
│   The existing infrastructure is 64% ready. The         │
│   core components (translation system, notification     │
│   engine, dispatch pipeline, socket delivery, admin      │
│   UI) are functional. The gaps are in coverage and      │
│   the missing backend i18n system — both are            │
│   addressable within the first sprint.                  │
│                                                         │
│   RECOMMENDATION: START IMPLEMENTATION                   │
│   ─────────────────────────────                           │
│   Sprint 1: Backend error code system + Phase 0          │
│   Sprint 2: Phase 1 + Phase 2                            │
│   Sprint 3: Phase 7 + Phase 3                             │
│   ...                                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
