# Notification System Audit Report

## Executive Summary

The notification system has a clean event-driven architecture (`eventBus.emit()` → notification engine → dispatcher → template resolution → notification creation), but **88% of the infrastructure is dead code** because business modules never emit the domain events the engine subscribes to. Only 7 out of 61 subscribed events are ever emitted.

---

## A. Root Cause

**Primary root cause: Business logic modules do not emit domain events.**

The `eventBus.emit()` pattern is used only in 2 of 9+ modules:
- **Booking**: emits `booking:created`, `booking:confirmed`, `booking:cancelled`, `match:invitation` (7 emit calls)
- **Payment**: emits `payment:completed`, `payment:failed`, `payment:refunded` (5 emit calls)

**8 modules emit zero events:**
- Marketplace (0 events emitted, 9 engine listeners & 9 templates exist = all dead)
- Academy (0 events emitted, 2 engine listeners & 2 templates exist = all dead)
- Tournament (0 events emitted, 4 engine listeners & 4 templates exist = all dead)
- Coaching (0 events emitted, 3 engine listeners & 3 templates exist = all dead)
- Wallet (0 events emitted, 2 engine listeners & 1 template exists = all dead)
- Subscription (0 events emitted, 6 engine listeners & 2 templates exist = all dead)
- Coupon (0 events emitted, bypasses event bus entirely via direct `notificationService.createNotification()`)
- Announcements (bypasses event bus, uses dispatcher directly)

**Secondary root causes:**

1. **Payment flow does not emit `booking:confirmed`**: When Paymob webhook confirms a booking (`_fulfillBooking` / `_fulfillBookingIntent`), only `payment:completed` is emitted but NOT `booking:confirmed`. User gets a payment notification but no booking confirmation notification.

2. **Booking and payment auto-processes emit no events**: Auto-cancellations (expiry worker), no-show marking, check-in, and completion (auto-complete worker) all update DB silently.

3. **Missing notification templates**: 30+ engine listeners have no template in `template.service.ts` seed data, causing silent drops when events are dispatched.

4. **Coupon module uses deprecated direct path**: `notificationService.createNotification()` bypasses the event bus, rate limiting, digest accumulation, and template resolution. Creates notifications directly via raw SQL with `categorySlug: 'promotions'` which has no corresponding seeded template.

5. **Legacy dead code**: `notification-rules.ts` (12 rules) is never called by any production path; `dispatcher.service.ts` uses `template.service.ts` DB queries instead.

6. **Scheduled reminders never wired**: `scheduleBookingReminder()`, `scheduleMembershipReminder()` exist but are never invoked from any booking/subscription creation path.

7. **Audit log gaps**: `cancelOrderHandler`, `createPlayerProductHandler`, `markPlayerProductSoldHandler` missing `recordAudit` calls.

---

## B. List of Files Requiring Modification

| # | File | Type |
|---|------|------|
| 1 | `backend/src/modules/marketplace/application/marketplace.service.ts` | Add event emissions |
| 2 | `backend/src/modules/marketplace/presentation/marketplace.controller.ts` | Add audit logging |
| 3 | `backend/src/modules/booking/application/booking.service.ts` | Add event emissions + wire reminders |
| 4 | `backend/src/modules/booking/infrastructure/booking-expiry.worker.ts` | Add event emission |
| 5 | `backend/src/modules/booking/infrastructure/booking-auto-complete.worker.ts` | Add event emission |
| 6 | `backend/src/modules/booking/presentation/booking.controller.ts` | Add event emissions for all statuses |
| 7 | `backend/src/modules/payment/application/payment.service.ts` | Add `booking:confirmed` emission + missing event emissions |
| 8 | `backend/src/modules/payment/infrastructure/payment-cron.worker.ts` | Add event emission |
| 9 | `backend/src/modules/coupon/application/coupon.service.ts` | Replace direct notificationService with eventBus |
| 10 | `backend/src/modules/activities/application/activities.service.ts` | Add academy + coaching + tournament event emissions |
| 11 | `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts` | Add event emission for enrollment status |
| 12 | `backend/src/modules/wallet/application/wallet.service.ts` | Add event emissions for deposits, withdrawals, low-balance |
| 13 | `backend/src/modules/organisations/application/organisation.service.ts` | Add subscription event emissions |
| 14 | `backend/src/modules/approvals/application/approval.service.ts` | Add subscription activation event emission |
| 15 | `backend/src/modules/notifications/application/template.service.ts` | Add missing templates |
| 16 | `backend/src/modules/notifications/application/scheduler.service.ts` | Wire scheduler calls into booking/create flows |
| 17 | `backend/src/modules/notifications/application/notification-rules.ts` | (Optional) Remove dead code |
| 18 | `database/seeds/001_baseline.sql` | Add missing notification_category + notification_action seeds |
| 19 | `frontend/src/permissions/registry.ts` | Add permission keys for new notification-related UI |
| 20 | `backend/scripts/sync-ui-registry.js` | Add corresponding UI registry entries |

---

## C. Exact Reason for Each Modification

### Core Fixes (Event Emissions)

#### 1. `backend/src/modules/marketplace/application/marketplace.service.ts`
**Reason: Add `eventBus.emit()` calls for ALL order status transitions.**

The entire marketplace module emits ZERO events despite having 9 fully-defined event bus events, engine handlers, and templates. Every order status change (`pending→confirmed`, `confirmed→processing`, `processing→shipped`, `shipped→delivered`, `cancelled`, `refunded`), product status change, seller upgrade flow, and review creation must emit the appropriate event.

Specific locations:
- `checkout()` (~line 441): add `eventBus.emit('marketplace:order-placed')`
- `_processOrderPayment()` (~line 498/517): add `eventBus.emit('marketplace:order-confirmed')`
- `updateOrderStatus()` (~line 680-732): add `eventBus.emit()` for each status: `shipped`, `delivered`, `cancelled`, `refunded`
- `createReview()` (~line 974): add `eventBus.emit('marketplace:new-review')`
- `upgradeToSeller()` (~line 1018): add `eventBus.emit('marketplace:new-seller-registered')`
- `approveSellerUpgrade()` (~line 1051): add `eventBus.emit('user:approved')`
- `adminRejectUpgrade()` (~line 1303): add `eventBus.emit('user:rejected')`

#### 2. `backend/src/modules/marketplace/presentation/marketplace.controller.ts`
**Reason: Add missing `recordAudit()` calls.**

Three handlers missing audit logging:
- `cancelOrderHandler` (~line 333)
- `createPlayerProductHandler` (~line 405)
- `markPlayerProductSoldHandler` (~line 420)

#### 3. `backend/src/modules/booking/application/booking.service.ts`
**Reason: Add event emissions for auto-transitions + wire reminders.**

- `createBooking()` (~line 216-220): Add `eventBus.emit('booking:confirmed')` when wallet/COD sets status to `confirmed`
- `checkIn()` (~line 715): Add `eventBus.emit('booking:check-in')`
- `updateBookingStatus('completed')` (~line 720-728): Add `eventBus.emit('booking:completed')`
- `updateBookingStatus('no_show')` (~line 745-781): Add `eventBus.emit('booking:no-show')`
- `cancelBooking()` (~line 541): Add `eventBus.emit('booking:cancelled')` (currently only emits from controller)
- `createBooking()` (~line 441): Wire `schedulerService.scheduleBookingReminder()`

#### 4. `backend/src/modules/booking/infrastructure/booking-expiry.worker.ts`
**Reason: Auto-cancellations emit no events.**

- ~line 22: Add `eventBus.emit('booking:cancelled')` for auto-cancelled unpaid bookings
- ~line 43: Add `eventBus.emit('booking:expired')` for expired intents

#### 5. `backend/src/modules/booking/infrastructure/booking-auto-complete.worker.ts`
**Reason: Auto-completions emit no events.**

- ~line 11: Add `eventBus.emit('booking:completed')`

#### 6. `backend/src/modules/booking/presentation/booking.controller.ts`
**Reason: Admin status changes only emit for `confirmed` and `cancelled`, not for `completed`, `no_show`, `checked_in`, `pending`, `expired`.**

- `updateBookingStatusHandler` (~line 96-107): Add event bus emissions for ALL status transitions, not just confirmed/cancelled

#### 7. `backend/src/modules/payment/application/payment.service.ts`
**Reason: Paymob payment flow does not emit `booking:confirmed`; auto-cancellations/expirations emit no events.**

- `_fulfillBooking()` (~line 648): Add `eventBus.emit('booking:confirmed')` after status update
- `_fulfillBookingIntent()` (~line 690): Add `eventBus.emit('booking:confirmed')` after intent fulfill
- `handleWebhook()` cancelled/expired paths (~line 230-260): Add `eventBus.emit('payment:initiated')` or appropriate events
- `expireStalePayments()` (~line 832-869): Add `eventBus.emit('booking:expired')` and/or `payment:failed`

#### 8. `backend/src/modules/payment/infrastructure/payment-cron.worker.ts`
**Reason: Cron-driven payment expiry emits no events.**

- Add `eventBus.emit('booking:expired')` when it expires a payment

#### 9. `backend/src/modules/coupon/application/coupon.service.ts`
**Reason: Bypasses event bus entirely, uses deprecated direct notification path without templates or rate limiting.**

- `publishCoupon()` (~line 61-91): Replace `notificationService.createNotification()` loop with `eventBus.emit('coupon:published', { ... })` and let the notification engine handle template resolution, rate limiting, and delivery. Register `coupon:published` in the event bus, engine, and template service.

#### 10. `backend/src/modules/activities/application/activities.service.ts`
**Reason: Academy, coaching, and tournament modules emit zero events despite fully-wired engine listeners and templates.**

- `enrollPlayer()` (~line 120-125): Add `eventBus.emit('academy:enrolled')`
- `createCoachSession()` (~line 203-206): Add `eventBus.emit('coaching:session-scheduled')`
- `acceptCoachSession()` (~line 426-457): Add `eventBus.emit('booking:confirmed')` and `eventBus.emit('coaching:session-scheduled')`
- `declineCoachSession()` (~line 459-490): Add `eventBus.emit('coaching:session-cancelled')`
- `createTournament()`, `generateBracket()`, `enterMatchScore()`: Add tournament events

#### 11. `backend/src/modules/activities/infrastructure/repositories/activities.repository.ts`
**Reason: Academy enrollment status changes emit no events.**

- `updateEnrollmentStatus()` (~line 255-260): This function exists but is never called from service layer. Either remove it or wire it with event emissions.

#### 12. `backend/src/modules/wallet/application/wallet.service.ts`
**Reason: Wallet deposits and withdrawals emit no events.**

- `deposit()` (~line 48-63): Add `eventBus.emit('payment:wallet-topup')` after balance update
- `withdraw()` (~line 84-106): Add `eventBus.emit('wallet:transaction')` after balance update
- Add low-balance check: After any balance change, if balance < threshold, emit `eventBus.emit('payment:wallet-low-balance')`

#### 13. `backend/src/modules/organisations/application/organisation.service.ts`
**Reason: Subscription lifecycle events emit no events.**

- `updateOrgSubscription()` (~line 773-784): Add `eventBus.emit('organisation:subscription-expiring')` when status changes to `pending`
- `activateSubscription()` (~line 813-815): Add `eventBus.emit('organisation:subscription-renewed')` when status changes to `active`

#### 14. `backend/src/modules/approvals/application/approval.service.ts`
**Reason: Organisation approval emits no events.**

- `approveRegistration()` (~line 77-91): Add `eventBus.emit('organisation:approved')` when subscription activated
- `rejectRegistration()` (~line 141-143): Add `eventBus.emit('organisation:rejected')`

### Template Fixes

#### 15. `backend/src/modules/notifications/application/template.service.ts`
**Reason: 30+ engine-listeners have no templates, causing silent failures.**

Add templates for these events (minimal viable set — the events most likely to be emitted):
- `booking:check-in` — no template exists
- `booking:no-show` — no template exists
- `booking:rescheduled` — no template exists
- `booking:fully-booked` — no template exists (actively dispatched by player-matching.service)
- `marketplace:order-confirmed` — no template exists
- `marketplace:order-cancelled` — no template exists
- `payment:wallet-topup` — no template exists
- `payment:initiated` — no template exists
- `review:reminder` — no template exists (actively scheduled by scheduler.service)
- `membership:renewed` — no template exists

Also add a `coupon:published` template for the coupon module's planned event bus integration.

### Infrastructure Fixes

#### 16. `backend/src/modules/notifications/application/scheduler.service.ts`
**Reason: `scheduleBookingReminder()` and `scheduleMembershipReminder()` are never called.**

- These functions are fully implemented but unreachable. They need to be exported and called from:
  - `booking.service.ts` `createBooking()` → schedule booking reminder
  - `organisation.service.ts` `activateSubscription()` → schedule membership reminder

#### 17. `backend/src/modules/notifications/application/notification-rules.ts` (optional)
**Reason: Dead code. The `rules` map has zero callers in production.**

- Either remove the file or add a deprecation notice. The `dispatcher.service.ts` does not reference it; it uses `template.service.ts` DB queries instead.

#### 18. `database/seeds/001_baseline.sql`
**Reason: Missing `notification_categories` and `notification_actions` seeds for templates that need them.**

- Add `notification_categories` entries: `promotions` (referenced by coupon module), `coaching`, `academy`, `tournament`
- Add `notification_actions` entries: `view_coupon`, `view_matchmaking_booking` (referenced but no action route)

### Frontend Fixes

#### 19. `frontend/src/permissions/registry.ts`
**Reason: New notification-related UI elements need permission gating.**

- Register permissions for any new notification preferences UI, admin broadcast pages, etc. (if these are being added as part of the repair)

#### 20. `backend/scripts/sync-ui-registry.js`
**Reason: Keep UI registry in sync with permissions.**

- Add corresponding entries for any new permissions added in registry.ts

---

## Notification Coverage Matrix

### Marketplace

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Order Created (pending) | ❌ | YES (`marketplace:order-placed`) | NO | NO | `marketplace.service.ts:411-441` — no `eventBus.emit` |
| Payment Pending (pending→confirmed) | ❌ | YES (`marketplace:order-confirmed`) | NO | NO | `marketplace.service.ts:498-517` — no `eventBus.emit` |
| Confirmed (status update) | ❌ | NO (no template for `marketplace:order-confirmed`) | NO | NO | `marketplace.service.ts:680-732` — no emit, no template |
| Preparing | ❌ | NO | NO | NO | same as above |
| Packed | ❌ | NO | NO | NO | same as above |
| Shipped | ❌ | YES (`marketplace:order-shipped`) | NO | NO | `marketplace.service.ts:680-732` — no emit |
| Delivered | ❌ | YES (`marketplace:order-delivered`) | NO | NO | `marketplace.service.ts:680-732` — no emit |
| Cancelled | ❌ | NO (no template for `marketplace:order-cancelled`) | NO | NO | `marketplace.service.ts:666-678` — no emit |
| Refunded | ❌ | NO | NO | NO | `marketplace.service.ts:680-732` — no emit |
| New Review | ❌ | YES (`marketplace:new-review`) | NO | NO | `marketplace.service.ts:974-980` — no emit |
| Seller Upgrade Requested | ❌ | NO (no template for `marketplace:new-seller-registered`) | NO | NO | `marketplace.service.ts:1012-1024` — no emit |
| Seller Upgrade Approved | ❌ | YES (`user:approved`) | NO | NO | `marketplace.service.ts:1026-1056` — no emit |
| Seller Upgrade Rejected | ❌ | NO (no template for `user:rejected`) | NO | NO | `marketplace.service.ts:1302-1307` — no emit |

### Court / Public Bookings

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Created (pending) | ✅ | YES | YES | YES | Fully wired (controller line 13) |
| Payment Pending (COD) | ⚠️ | YES (`booking:confirmed`) | NO | NO | `booking.service.ts:219` — wallet/COD sets confirmed but no emit |
| Paid (wallet/COD) | ⚠️ | YES (`payment:completed`) | Only if wallet | YES | Wallet path emits `payment:completed`; COD path emits nothing |
| Confirmed (payment webhook) | ❌ | YES (`booking:confirmed`) | NO | NO | `payment.service.ts:642-733` — `_fulfillBooking`/`_fulfillBookingIntent` no emit |
| Confirmed (admin status change) | ✅ | YES | YES | YES | Controller line 97 |
| Reminder | ❌ | YES (`booking:reminder`) | NO | NO | `scheduler.service.ts:12-31` — `scheduleBookingReminder` never called |
| Checked In | ❌ | NO | NO | NO | `booking.service.ts:715` — no emit |
| Completed (auto/manual) | ❌ | YES (`booking:completed`) | NO | NO | `booking.service.ts:720-728`, `booking-auto-complete.worker.ts:11` |
| Cancelled (user-initiated) | ✅ | YES | YES | YES | Controller line 58 |
| Cancelled (auto-expiry) | ❌ | YES | NO | NO | `booking-expiry.worker.ts:22` — no emit |
| Cancelled (payment failure) | ❌ | YES | NO | NO | `payment.service.ts:462-466` — no emit |
| Cancelled (cascade) | ❌ | YES | NO | NO | `booking.cascade.ts:14` — no emit |
| No-show | ❌ | NO | NO | NO | `booking.service.ts:745-781` — no emit |
| Expired | ❌ | NO (template) | NO | NO | `payment.service.ts:832-869`, `booking-expiry.worker.ts:43` |

### Academy

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Applied/Enrolled | ❌ | YES (`academy:enrolled`) | NO | NO | `activities.service.ts:120-125` — no emit |
| Approved | ❌ | NO | NO | NO | `activities.repository.ts:255-260` — `updateEnrollmentStatus` never called |
| Rejected | ❌ | NO | NO | NO | same as above |
| Reminder | ❌ | YES (`academy:session-reminder`) | NO | NO | `activities.service.ts` — no emit |
| Completed/Graduated | ❌ | NO | NO | NO | no detection logic exists |

### Private Coaching

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Session Requested | ❌ | YES (`coaching:session-scheduled`) | NO | NO | `activities.service.ts:203-206` — no emit |
| Session Accepted | ❌ | YES (`coaching:session-scheduled`) | NO | NO | `activities.service.ts:426-457` — no emit |
| Session Rejected | ❌ | YES (`coaching:session-cancelled`) | NO | NO | `activities.service.ts:459-490` — no emit |
| Reminder | ❌ | YES (`coaching:session-reminder`) | NO | NO | no emit, no scheduler call |
| Completed | ❌ | NO | NO | NO | no detection logic |

### Tournament

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Tournament Created | ❌ | YES (`tournament:created`) | NO | NO | `activities.repository.ts:64-67` — no emit |
| Player Registered | ❌ | NO | NO | NO | `activities.repository.ts:97-99` — no emit |
| Bracket Generated | ❌ | NO | NO | NO | `activities.service.ts:76` — no emit |
| Fixture Published | ❌ | YES (`tournament:match-scheduled`) | NO | NO | `activities.repository.ts:153-158` — no emit |
| Match Reminder | ❌ | YES (`tournament:starting-soon`) | NO | NO | no scheduler call |
| Match Result | ❌ | YES (`tournament:result`) | NO | NO | `activities.service.ts:80` — no emit |
| Champion/Winner | ❌ | NO | NO | NO | no detection logic |

### Wallet

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Deposit | ❌ | NO (no `payment:wallet-topup` template) | NO | NO | `wallet.service.ts:48-63` — no emit |
| Withdrawal | ❌ | NO | NO | NO | `wallet.service.ts:84-106` — no emit |
| Low Balance | ❌ | YES (`payment:wallet-low-balance`) | NO | NO | no balance threshold check exists anywhere |

### Subscription / Membership

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Subscription Activated | ❌ | YES (`organisation:subscription-renewed` template missing) | NO | NO | `organisation.service.ts:813-815` — no emit |
| Subscription Expiring | ❌ | YES (`organisation:subscription-expiring`) | NO | NO | no scheduled expiry detection |
| Subscription Expired | ❌ | NO | NO | NO | no expiry detection |
| Subscription Upgraded | ❌ | NO | NO | NO | `org-portal.repository.ts:586-588` — no emit |
| Membership Expiring | ❌ | YES (`membership:expiring`) | NO | NO | `scheduler.service.ts` — never called |
| Membership Expired | ❌ | YES (`membership:expired`) | NO | NO | no expiry detection |

### Coupon

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Coupon Published | ⚠️ | NO (uses deprecated direct path) | YES (direct, bypasses engine) | YES (via direct insert) | `coupon.service.ts:80-91` — should use eventBus |
| Coupon Expired | ❌ | NO | NO | NO | no expiry detection |
| Coupon Redeemed | ❌ | NO | NO | NO | no emit |

### Payments (Paymob)

| Business Event | Current Status | Template Exists? | Notification Sent? | Frontend Receives? | Missing Code Location |
|---|---|---|---|---|---|
| Payment Initiated | ❌ | NO (no `payment:initiated` template) | NO | NO | never emitted anywhere |
| Payment Completed | ✅ | YES | YES | YES | Fully wired |
| Payment Failed | ✅ | YES | YES | YES | Fully wired |
| Payment Refunded | ✅ | YES | YES | YES | Fully wired |
| Payment Cancelled/Expired (webhook) | ❌ | NO | NO | NO | `payment.service.ts:230-260` — no emit |
| Payment Expired (cron) | ❌ | NO | NO | NO | `payment.service.ts:832-869` — no emit |
| Booking Confirmed (payment success) | ❌ | YES (`booking:confirmed`) | NO | NO | `payment.service.ts:642-733` — no emit |

---

## Unused / Orphaned Code

| Artifact | Location | Status |
|---|---|---|
| `notification-rules.ts` | `backend/src/modules/notifications/application/notification-rules.ts` | 🗑️ Dead code — 12 rules, zero callers |
| `marketplace:new-seller-registered` | `event-bus/index.ts:39` | 🗑️ Defined in interface, zero emitters |
| `attendance:recorded` vs `attendance:marked` | Engine vs EventBus | 🐛 Bug — mismatched event names |
| `scheduleBookingReminder()` | `scheduler.service.ts:12-31` | 🗑️ Logic exists, never called |
| `scheduleMembershipReminder()` | `scheduler.service.ts:36-53` | 🗑️ Logic exists, never called |
| 30+ engine listeners w/o templates | `template.service.ts` | 🗑️ Will silently drop notifications |
| 30+ engine event subscriptions | `notification-engine.ts` | 🗑️ Subscribed but never emitted to |

---

## Template Status Summary

| Status | Count |
|---|---|
| Templates that exist AND are properly emitted | 7 (`booking:created`, `booking:confirmed`, `booking:cancelled`, `payment:completed`, `payment:failed`, `payment:refunded`, `match:invitation`) |
| Templates that exist but NEVER emitted | 21 (all marketplace, academy, coaching, tournament, user, org, membership, security, support, community events) |
| Templates that exist but only via scheduler bypass | 4 (`booking:reminder`, `membership:expiring`, `system:birthday`, `system:digest`) |
| Engine listeners with NO template | 30+ (see full list in audit details) |
| Legacy rules (dead code) | 13 (`notification-rules.ts`) |

---

## Duplicate Notification Implementations

| # | Mechanism | Where Used | Should Use |
|---|---|---|---|
| 1 | `eventBus.emit()` → engine → dispatcher → DB insert → queue → worker → provider | Booking, Payment events | Canonical path |
| 2 | `notificationService.createNotification()` | Coupon module, Booking module (match full/declined) | eventBus path |
| 3 | `dispatchToUser()` direct call | Player matching (`booking:fully-booked`), Announcements | eventBus path |
| 4 | `notification.repository.create()` direct | Via notificationService | Should go through dispatcher with template resolution |
| 5 | Queue job direct insert (scheduler) | Booking reminder, membership expiring | Partially correct — bypasses event bus but goes to queue then dispatcher |

The system has 3 parallel notification creation paths:
- **Primary**: eventBus → engine → dispatcher → DB + queue (correct, used by 7 events)
- **Direct service**: `notificationService.createNotification()` → repository → DB + queue (bypasses engine, templates, rate limiting; used by coupon + booking match)
- **Direct dispatch**: `dispatchToUser()` called directly (bypasses engine; used by player-matching + announcements)
