---
document_id: "QUAL-TEST-03"
document_name: "Integration Test Reference"
family: "QUAL-TEST"
document_type: "TEST"
status: "Draft"
version: "0.1"
audience: ["qa", "developer"]
difficulty: "intermediate"
reading_time: 20
business_owner: "QA Manager"
technical_owner: "Lead Developer"
documentation_owner: "QA"
reviewer: "Architect"
approver: "QA Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-03", "TECH-DB-03"]
  related: ["TECH-DEV-09", "TECH-UX-04"]
---

# Integration Test Reference (QUAL-TEST-03)

## Booking Integration Test Cases

### TC-BOOK-001: Create Booking Flow

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-001 |
| **Title** | Full booking creation flow |
| **Purpose** | Verify that a user can create a confirmed booking with wallet payment and slots are marked unavailable |
| **Preconditions** | Seed data: organisations, branches, active resources with hourly_price > 0, operating_hours, user with wallet balance ≥ booking amount |
| **Steps** | 1. Query available slots for a resource via `GET /resources/:resourceId/slots?date=`. 2. Create booking via `POST /bookings` with wallet payment. 3. Verify booking is created with status `confirmed` and payment_status `paid`. 4. Verify `booking_slots` rows exist with `is_available = FALSE`. 5. Verify wallet balance is debited |
| **Expected Result** | Booking created successfully, payment processed, slots locked, wallet deducted |
| **Negative Cases** | Post with invalid resourceId returns 404; post with past date returns error; post with empty body returns 422 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /bookings`, `GET /resources/:resourceId/slots` — PERM: `bookings.create` — ENT: `bookings`, `booking_slots` — MOD: TECH-MOD-03 |

**Source:** `backend/src/modules/booking/__tests__/booking.integration.spec.ts:88-117`, `booking.service.ts:76-394`, `booking.repository.ts:31-55`, `booking.routes.ts:8`

---

### TC-BOOK-002: Cancel Booking Flow

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-002 |
| **Title** | Cancel a confirmed booking with reason |
| **Purpose** | Verify that a user can cancel their booking, triggering cancellation record creation and refund (if applicable) |
| **Preconditions** | Existing confirmed booking owned by the test user |
| **Steps** | 1. Call `POST /bookings/:id/cancel` with a reason string. 2. Verify booking_status transitions to `cancelled`. 3. Verify `booking_cancellations` record created with correct reason. 4. Verify payment_status updated appropriately (refunded if paid) |
| **Expected Result** | Booking cancelled, cancellation record stored, payment adjusted |
| **Negative Cases** | Cancel without reason returns 422 (reason required per `CancelBookingSchema`). Cancel already-cancelled booking returns error. Cancel without valid booking ID returns 404. Cancel another user's booking returns 403 Forbidden |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /bookings/:id/cancel` — PERM: `bookings.cancel` — ENT: `bookings`, `booking_cancellations` — MOD: TECH-MOD-03 |

**Source:** `backend/src/modules/booking/presentation/booking.controller.ts:66-82`, `booking.controller.ts:67-83`, `cancel-booking.command.ts:14-53`

---

### TC-BOOK-003: Check-In Flow

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-003 |
| **Title** | Check in to a confirmed booking |
| **Purpose** | Verify that a confirmed booking can be checked in, transitioning from `confirmed` → `checked_in` |
| **Preconditions** | Existing confirmed booking |
| **Steps** | 1. Call `POST /bookings/:id/check-in`. 2. Verify booking_status transitions to `checked_in`. 3. Verify audit log entry for `BOOKING.CHECK_IN` |
| **Expected Result** | Booking status updated to `checked_in`, audit event recorded |
| **Negative Cases** | Check-in on cancelled booking returns error (illegal transition). Check-in on completed booking returns error. Check-in on non-existent booking returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /bookings/:id/check-in` — PERM: `bookings.check-in` — ENT: `bookings` — MOD: TECH-MOD-03 |

**Source:** `backend/src/modules/booking/presentation/booking.controller.ts:92-107`, `booking.service.ts:922-925`, `booking-aggregate.ts:9`

---

### TC-BOOK-004: Matchmaking Flow

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-004 |
| **Title** | Matchmaking lifecycle — create public match, discover, apply, accept |
| **Purpose** | Verify full matchmaking lifecycle: booking created as public_match, matchmaking criteria stored, public discovered, player applies, host accepts |
| **Preconditions** | Two test users (host + applicant). Active resource with operating hours |
| **Steps** | 1. Host creates booking with `bookingType: 'public_match'` and matchmaking criteria. 2. Verify `booking_matchmaking_requests` record created with criteria. 3. Applicant queries `GET /matches` and sees the public match. 4. Applicant calls `POST /bookings/:id/apply`. 5. Verify `booking_invitations` record created with `status: 'pending'`. 6. Host calls `POST /booking-invitations/:invitationId/respond` with `accept`. 7. Verify invitation status transitions to `accepted` |
| **Expected Result** | Public match visible in discovery, applicant can apply, host can accept |
| **Negative Cases** | Apply without matchmaking returns error. Apply after deadline passes is blocked. Duplicate application returns conflict. Non-host trying to respond returns Forbidden |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /bookings`, `POST /bookings/:id/matchmaking`, `GET /matches`, `POST /bookings/:id/apply`, `POST /booking-invitations/:invitationId/respond` — PERM: `bookings.matchmaking`, `matches.apply` — ENT: `booking_matchmaking_requests`, `booking_invitations` — MOD: TECH-MOD-03 |

**Source:** `backend/src/modules/booking/booking.service.ts:600-899`, `booking.repository.ts:259-300`, `booking.controller.ts:163-240`

---

### TC-BOOK-005: Booking Payment Flow

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-005 |
| **Title** | Booking payment flows — wallet, cash, gateway, and payment status transitions |
| **Purpose** | Verify each payment method produces correct booking/payment status: wallet → confirmed+paid, cash → confirmed+pending, gateway → pending_payment→confirmed |
| **Preconditions** | Resource with pricing, user with wallet (for wallet test) |
| **Steps** | 1. Create booking with `paymentMethod: 'wallet'` — verify `confirmed` + `paid`. 2. Create booking with `paymentMethod: 'cash'` — verify `confirmed` + `pending`. 3. Create booking via prepare flow (`POST /bookings/prepare`) — verify pending_payment. 4. Confirm prepare (`POST /bookings` with `prepareId`) — verify booking created |
| **Expected Result** | All payment methods produce correct booking/payment status combinations |
| **Negative Cases** | Insufficient wallet balance prevents wallet payment. Gateway rejection triggers automatic cancellation. Expired prepareId returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /bookings/prepare`, `POST /bookings`, `PATCH /bookings/:id/payment` — PERM: `bookings.create` — ENT: `bookings`, `booking_intents` — MOD: TECH-MOD-03, TECH-MOD-09 |

**Source:** `backend/src/modules/booking/booking.service.ts:76-394`, `booking.dto.ts:13-34`, `booking-payment.listener.ts`

---

### TC-BOOK-006: Booking Conflict Detection

| Property | Value |
|----------|-------|
| **ID** | TC-BOOK-006 |
| **Title** | Slot conflict detection — double-booking prevention |
| **Purpose** | Verify that concurrent booking attempts for the same slot are prevented via Redis locks and database-level UNIQUE constraints |
| **Preconditions** | Active resource with available slots |
| **Steps** | 1. User A acquires Redis lock for a specific slot. 2. User B attempts to book the same slot simultaneously. 3. User B receives conflict error (slot unavailable). 4. User A completes booking. 5. User B tries again — database slot UNIQUE constraint prevents insertion |
| **Expected Result** | Second booking attempt fails with conflict error |
| **Negative Cases** | Same user booking their own slot again after cancellation (orphan cleanup in `_createFromPrepare`). Prepare lock expiry (10-min TTL) vs booking lock (15s TTL). Lock release failure does not prevent DB-level constraint |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /bookings`, `POST /bookings/prepare` — PERM: `bookings.create` — ENT: `booking_slots` (UNIQUE `uk_slot`) — MOD: TECH-MOD-03(`redis-lock.ts`) |

**Source:** `backend/src/modules/booking/infrastructure/redis/redis-lock.ts:107-134`, `booking.repository.ts:189-202`, `booking-aggregate.ts:46-49` (version conflict), `booking.repository.ts:11-15` (AggregateVersionConflict)

---

**Evidence:** Integration test files at `backend/src/modules/booking/__tests__/booking.integration.spec.ts`, `backend/src/modules/booking/commands/*.integration.spec.ts`, `backend/src/modules/booking/infrastructure/booking.repository.contract.integration.spec.ts`.

---

## Payment Integration Test Cases

### TC-PAY-001: Wallet Charge Flow

| Property | Value |
|----------|-------|
| **ID** | TC-PAY-001 |
| **Title** | Wallet charge — deduct from balance, create payment, emit events |
| **Purpose** | Verify that charging via `paymentMethod: 'wallet'` deducts the correct amount from the user's wallet, creates a `payment_transactions` record with status `paid`, and emits `payment:succeeded` + `payment:completed` events |
| **Preconditions** | User with wallet balance ≥ charge amount. Valid `ChargeInput` with `paymentMethod: 'wallet'` |
| **Steps** | 1. Record initial wallet balance. 2. Call `POST /payments/charge` with `{ referenceType: 'booking', referenceId, amount, paymentMethod: 'wallet' }`. 3. Verify response has `success: true`, `status: 'paid'`. 4. Verify wallet balance decreased by amount. 5. Verify `payment_transactions` record created with `payment_status = 'paid'`, `gateway_provider = 'wallet_system'`. 6. Verify `wallet_transactions` record created with `direction = 'debit'`, `type = 'payment'`. 7. Verify `financial_journal_entries` record created with `debit = 'Cash'`, `credit = 'Revenue'` |
| **Expected Result** | Wallet debited, payment transaction created as paid, journal entries recorded |
| **Negative Cases** | Insufficient wallet balance returns error. Wallet locked (`is_locked = TRUE`) blocks debit. Concurrent wallet update triggers `AggregateVersionConflict` |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /payments/charge` — PERM: requires auth — ENT: `payment_transactions`, `user_wallets`, `wallet_transactions`, `financial_journal_entries` — MOD: TECH-MOD-09, TECH-MOD-10 |

**Source:** `payment.service.ts:63-111` (chargeByWallet), `wallet.service.ts:102-146` (withdraw), `wallet.repository.ts:57-78` (lockAndGetBalance + updateBalance), `payment-aggregate.ts:3-11` (state machine).

---

### TC-PAY-002: Gateway Charge Flow

| Property | Value |
|----------|-------|
| **ID** | TC-PAY-002 |
| **Title** | Gateway charge — create payment intention, redirect, handle webhook |
| **Purpose** | Verify the full gateway flow: `POST /payments/charge` creates a Paymob intention, returns `paymentUrl` + `clientSecret`, then webhook processing transitions `pending` → `paid` |
| **Preconditions** | Valid `ChargeInput` with `paymentMethod: 'card'`. Mock gateway configured to return success |
| **Steps** | 1. Call `POST /payments/charge` with `{ referenceType: 'booking', referenceId, amount, paymentMethod: 'card', returnUrl }`. 2. Verify response has `success: true`, `paymentId`, `paymentUrl`, `clientSecret`, `status: 'pending'`. 3. Verify `payment_transactions` record created with `payment_status = 'pending'`, `gateway_provider = 'paymob'` (or `'mock'`). 4. Simulate gateway webhook: `POST /payments/webhook` with signed payload. 5. Verify `payment_status` transitions to `paid`. 6. Verify `payment:succeeded` + `payment:completed` events emitted |
| **Expected Result** | Payment intention created, webhook processed idempotently, status updated to paid |
| **Negative Cases** | Invalid HMAC signature returns 401. Duplicate webhook (same `webhookId`) returns 200 with `'duplicate'` note (replay protection). Gateway returns failure → status transitions to `failed`. Missing gateway reference in payload returns 400. Unknown transaction returns 200 with `'transaction not found'` |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /payments/charge`, `POST /payments/webhook` — PERM: charge requires auth, webhook is unauthenticated — ENT: `payment_transactions` — MOD: TECH-MOD-09 |

**Source:** `payment.service.ts:113-188` (chargeByGateway), `payment.service.ts:200-385` (handleWebhook), `payment.controller.ts:76-112` (webhookHandler), `payment.service.ts:217-233` (replay protection).

---

### TC-PAY-003: Webhook Processing

| Property | Value |
|----------|-------|
| **ID** | TC-PAY-003 |
| **Title** | Webhook HMAC verification, dedup, and status mapping |
| **Purpose** | Verify that webhooks are authenticated via HMAC, deduplicated via Redis (24h TTL), and correctly map gateway statuses to local payment states |
| **Preconditions** | Existing `payment_transactions` with `gateway_reference` matching the webhook payload. Redis running. Mock gateway with known HMAC secret |
| **Steps** | 1. Send unsigned webhook → verify 401 returned. 2. Send signed webhook with `obj.success = true` for Intention API format → verify `payment_status` transitions to `paid`. 3. Send same webhook again → verify `{ received: true, note: 'duplicate' }` (Redis replay protection). 4. Send webhook with `obj.pending = true` → verify `{ received: true, note: 'ignored' }` (non-final state). 5. Send webhook with `obj.success = false` → verify `payment_status` transitions to `failed`. 6. Send webhook for unknown gateway reference → verify 200 with `'transaction not found'` |
| **Expected Result** | HMAC enforced, duplicates rejected, status correctly mapped, unknown refs silently accepted |
| **Negative Cases** | Expired Redis key (after 24h) allows re-processing. HMAC from query param vs header both supported. Timestamp > 5min old logs warning but still processes |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /payments/webhook` — ENT: `payment_transactions` — MOD: TECH-MOD-09 |

**Source:** `payment.service.ts:200-385` (handleWebhook), `payment.service.ts:217-233` (replay protection), `payment.service.ts:489-603` (_processPaymentOutcome).

---

### TC-PAY-004: Payment Reconciliation

| Property | Value |
|----------|-------|
| **ID** | TC-PAY-004 |
| **Title** | Reconciliation — sync, expire, recover, and reconcile run |
| **Purpose** | Verify the four reconciliation mechanisms: sync pending payments with Paymob, expire stale payments, manual recovery for gateway reference, and full reconciliation run |
| **Preconditions** | Existing `payment_transactions` in `pending` status with valid `gateway_reference`. Mock gateway configured |
| **Steps** | **Sync:** 1. Call `POST /payments/sync`. 2. Verify pending payments checked against gateway. 3. Verify sync-matched payments transitioned to correct status. **Expire:** 4. Call `POST /payments/expire?timeoutMinutes=1`. 5. Verify payments older than 1 min in `created`/`pending` transition to `expired`. 6. Verify `payment:expired-event` emitted. **Recover:** 7. Call `POST /payments/recover/:gatewayReference`. 8. Verify payment status updated from gateway poll. 9. Verify audit event `PAYMENT.RECOVER` logged. **Reconcile:** 10. Call `POST /payments/reconciliation/run`. 11. Verify issues detected matching expected discrepancies. 12. Call `GET /payments/reconciliation/history`. 13. Verify reconciliation runs list returned |
| **Expected Result** | Sync updates matching payments, expiry marks stale payments, recover fixes single payment, reconciliation reports all discrepancies |
| **Negative Cases** | Sync with no pending payments returns `{ synced: 0 }`. Expire with no stale payments returns `{ expired: 0 }`. Recovery with invalid gateway reference returns `NotFoundError`. Reconciliation with `autoFix=true` auto-recovers critical issues |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /payments/sync`, `POST /payments/expire`, `POST /payments/recover/:gatewayReference`, `POST /payments/reconciliation/run`, `GET /payments/reconciliation/history` — PERM: `financial.reconcile` — ENT: `payment_transactions`, `audit_logs` — MOD: TECH-MOD-09 |

**Source:** `payment.service.ts:391-431` (syncPendingPayments), `payment.service.ts:802-836` (expireStalePayments), `payment.service.ts:438-475` (recoverPayment), `reconciliation.service.ts:45-244` (run), `payment-cron.worker.ts:7-24` (cron jobs).

---

### TC-PAY-005: Refund Processing

| Property | Value |
|----------|-------|
| **ID** | TC-PAY-005 |
| **Title** | Refund a paid payment — full and partial refunds |
| **Purpose** | Verify that a `paid` payment can be refunded (full or partial) via `POST /payments/:id/refund`, which calls `paymentGateway.refund()`, emits `payment:refunded`, creates journal entries, and logs audit event |
| **Preconditions** | Existing `payment_transactions` with `payment_status = 'paid'`. Mock gateway refund support |
| **Steps** | 1. Call `POST /payments/:id/refund` with `{ amount, reason }`. 2. Verify `paymentGateway.refund()` called with correct `transactionId` and `amount`. 3. Verify `payment:refunded` event emitted with `{ paymentId, amount, reason }`. 4. Verify `financial_journal_entries` record created with `debit = 'Refund Expense'`, `credit = 'Cash'`. 5. Verify audit event `PAYMENT.REFUND` logged. 6. Test partial refund (amount < original). 7. Test full refund (amount == original) |
| **Expected Result** | Refund processed through gateway, event emitted, journal entry created, audit logged |
| **Negative Cases** | Refund on non-existent payment returns 404. Refund on `pending` payment returns error (state machine). Refund on already-refunded payment processed by gateway idempotently. Refund with amount > original processed at gateway's discretion |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /payments/:id/refund` — PERM: `financial.reconcile` — ENT: `payment_transactions`, `financial_journal_entries` — MOD: TECH-MOD-09 |

**Source:** `payment.service.ts:769-796` (refund), `payment.controller.ts:59-73` (refundHandler), `payment.dto.ts:21-25` (RefundPaymentSchema).

---

**Evidence:** Integration test files at `backend/src/modules/payment/__tests__/payment.spec.ts`, `backend/src/modules/payment/commands/process-payment.spec.ts`, `backend/src/modules/payment/commands/process-payment.integration.spec.ts`, `backend/src/modules/payment/commands/process-payment.events.contract.spec.ts`.

---

## Organisation Integration Test Cases

### TC-ORG-001: Create Organisation

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-001 |
| **Title** | Full organisation creation flow |
| **Purpose** | Verify that a super admin can create an organisation with all required fields, optional attributes, and that it is immediately visible in listings |
| **Preconditions** | Seed data: organisation_types, countries. Admin user with super_admin role |
| **Steps** | 1. Call `POST /organisations` with valid `{ orgTypeId, name, slug, description, countryId, ownerId }`. 2. Verify response has 201 status with org data. 3. Verify `GET /organisations` includes the new org. 4. Verify `GET /organisations/:id` returns full org details. 5. Verify slug uniqueness: creating another org with same slug returns 409 Conflict |
| **Expected Result** | Organisation created, slug unique, visible in listings, returns full data |
| **Negative Cases** | Duplicate slug returns 409. Missing required fields (orgTypeId, name) returns 422. Invalid country ID returns error. Deleted org (soft-delete) is not returned |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /organisations`, `GET /organisations`, `GET /organisations/:id` — PERM: adminGuard — ENT: `organisations`, `organisation_types` — MOD: TECH-MOD-13 |

**Source:** `organisation.service.ts:236-249` (create), `organisation.repository.ts:71-83` (insert), `organisation.routes.ts:31-36`.

---

### TC-ORG-002: Create Branch

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-002 |
| **Title** | Branch creation with plan limit enforcement |
| **Purpose** | Verify that a branch can be added to an organisation, and that plan limits on branch count are enforced |
| **Preconditions** | Existing organisation. Admin with `organisations.edit.branches` permission |
| **Steps** | 1. Call `POST /branches` with valid `{ organisationId, name, city, accessType }`. 2. Verify branch created with 201 status. 3. Verify `GET /organisations/:orgId/branches` includes the new branch. 4. Try creating branches beyond the plan's branch limit → verify 409 Conflict with upgrade message |
| **Expected Result** | Branch created within limits, limit enforcement returns proper error |
| **Negative Cases** | Branch limit reached returns 409. Missing organisationId returns 422. Duplicate slug per org returns error. Branch for non-existent org returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /branches`, `GET /organisations/:orgId/branches` — PERM: `organisations.edit.branches` — ENT: `branches` — MOD: TECH-MOD-13 |

**Source:** `organisation.service.ts:355-371` (create with limit check), `branch.repository.ts` (CRUD), `organisation.routes.ts:42`.

---

### TC-ORG-003: Manage Staff Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-003 |
| **Title** | Staff invitation, role change, permission override, and removal lifecycle |
| **Purpose** | Verify full staff lifecycle: invite user by email, assign role with scopes, change role, override permissions, view staff permissions, remove staff, and verify scoped access control |
| **Preconditions** | Existing organisation with owner. A registered user (non-owner) with known email |
| **Steps** | 1. Owner calls `POST /org/:orgId/staff` with `{ email, roleSlug: 'branch-mgr', branchIds: [1] }` → verify 201 with user data. 2. Call `GET /org/:orgId/staff` → verify new staff appears with correct role and branch scopes. 3. Call `PUT /org/:orgId/staff/:userId` with `{ roleSlug: 'org-admin' }` → verify role updated. 4. Call `GET /org/:orgId/staff/:userId/permissions` → verify returns current permissions array. 5. Call `PUT /org/:orgId/staff/:userId/permissions` with custom `permissionIds` → verify override applied. 6. Call `DELETE /org/:orgId/staff/:userId` → verify staff removed and no longer appears in listing. 7. Verify the removed user cannot access `/org/:orgId/` routes (403) |
| **Expected Result** | Staff invited, role changed, permissions queried and overridden, staff removed, access revoked |
| **Negative Cases** | Adding non-existent email returns 404. Adding org owner returns validation error. Removing org owner returns validation error. Assigning non-assignable role slug returns validation error. Scoping to branch not belonging to org returns validation error. Staff limit reached returns 409 with upgrade prompt |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `GET/POST /org/:orgId/staff`, `PUT/DELETE /org/:orgId/staff/:userId`, `GET/PUT /org/:orgId/staff/:userId/permissions` — PERM: requireOrgManageAccess — ENT: `user_role_scopes`, `user_roles`, `roles` — MOD: TECH-MOD-13, TECH-MOD-02 |

**Source:** `org-portal.service.ts:19-136` (staff management), `org-portal.repository.ts:170-360` (repository), `org-portal.controller.ts:224-283`.

---

### TC-ORG-004: Member Access Control

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-004 |
| **Title** | Player branch access request, approval, rejection, and ban lifecycle |
| **Purpose** | Verify the branch access flow for restricted branches: player requests access, org admin approves/rejects/bans, and status changes are enforced on booking |
| **Preconditions** | Branch with `access_type = 'restricted'`. Two users: admin (org staff with `org.members.manage`) and player |
| **Steps** | 1. Player calls `POST /branches/:branchId/request-access` → verify success. 2. Player calls `GET /branches/:branchId/my-access` → verify `status = 'pending'`. 3. Admin calls `GET /branches/:branchId/access-requests` → verify player appears in pending list. 4. Admin calls `POST /branches/:branchId/approve/:playerId` → verify success. 5. Player calls `GET /branches/:branchId/my-access` → verify `status = 'approved'`. 6. Admin calls `PUT /org/:orgId/members/:branchId/:playerId` with `{ status: 'banned' }` → verify status transitions to `banned`. 7. Banned player attempts to book a resource on that branch → verify booking is rejected |
| **Expected Result** | Request created, admin approves, player can book, admin bans, player cannot book |
| **Negative Cases** | Duplicate request returns conflict. Approving non-pending request returns error. Non-admin attempting to approve returns 403. Invalid branch ID returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /branches/:branchId/request-access`, `GET /branches/:branchId/my-access`, `POST /branches/:branchId/approve/:playerId`, `PUT /org/:orgId/members/:branchId/:playerId` — PERM: `org.members.manage` — ENT: `branch_player_access` — MOD: TECH-MOD-13 |

**Source:** `organisation.service.ts:743-769` (access control), `org-portal.controller.ts:326-346` (member management).

---

### TC-ORG-005: Coach Agreement Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-005 |
| **Title** | Coach invitation, acceptance, and removal lifecycle |
| **Purpose** | Verify full coach agreement lifecycle: org invites coach (org-initiated), coach directory is filterable, revenue split validation, removal |
| **Preconditions** | Existing organisation with owner. Approved coach profile (not linked to this org) |
| **Steps** | **Org-initiated:** 1. Owner calls `GET /org/:orgId/coaches/directory` → verify invitable coach appears. 2. Owner calls `POST /org/:orgId/coaches/invite` with `{ coachId, coachSplitPct: 70, orgSplitPct: 30 }` → verify 201. 3. Call `GET /org/:orgId/coaches` → verify agreement shows with `status = 'pending'`, `initiated_by = 'org'`. 4. Coach accepts via `PUT /org/:orgId/coaches/:coachId/respond { accept: true }` → verify status transitions to `accepted`. **Remove:** 5. Owner calls `DELETE /org/:orgId/coaches/:coachId` → verify agreement removed. 6. Verify coach reappears in directory |
| **Expected Result** | Coach invited, splits validated, accepted, removed, re-invitable |
| **Negative Cases** | Split not summing to 100% returns 422. Inviting already-linked coach updates existing agreement (upsert). Removing non-existent agreement returns 404. Non-approved coach in directory filters correctly. Responding to non-pending agreement returns 404 |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `GET /org/:orgId/coaches`, `GET /org/:orgId/coaches/directory`, `POST /org/:orgId/coaches/invite`, `PUT /org/:orgId/coaches/:coachId/respond`, `DELETE /org/:orgId/coaches/:coachId` — PERM: requireOrgManageAccess — ENT: `coach_org_agreements`, `coach_profiles` — MOD: TECH-MOD-13 |

**Source:** `org-portal.service.ts:283-322`, `org-portal.repository.ts:362-460`.

---

### TC-ORG-006: Subscription Upgrade Flow

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-006 |
| **Title** | Subscription upgrade request, admin approval, plan activation |
| **Purpose** | Verify full subscription upgrade flow: org submits upgrade request, admin views pending requests, approves, subscription activated, plan snapshot captured |
| **Preconditions** | Existing organisation with active subscription on an entry-level plan. Admin with super_admin role. A higher-tier active plan exists |
| **Steps** | **Submit request:** 1. Org admin calls `POST /org/:orgId/subscription/request` with `{ planId, requestType: 'PLAN_CHANGE', notes }` → verify 201 with `{ id, status: 'pending' }`. 2. Verify `GET /org/:orgId/subscription` shows `pendingRequest` with details. 3. Call `GET /org/:orgId/subscription/requests` → verify request appears. **Admin approval:** 4. Admin calls `GET /admin/subscription-requests` → verify request appears. 5. Admin calls `GET /admin/subscription-requests/:requestId` → verify detail with timeline. 6. Admin calls `POST /admin/subscription-requests/:requestId/approve` → verify success. **Verification:** 7. Org calls `GET /org/:orgId/subscription` → verify `planId` updated to new plan. 8. Verify `plan_snapshot` contains frozen plan details. 9. Verify audit events `SUBSCRIPTION_REQUEST.APPROVE` and `SUBSCRIPTION.ACTIVATED` recorded |
| **Expected Result** | Request submitted, admin approves, subscription updated with snapshot, audit logged |
| **Negative Cases** | Submitting while pending request exists returns 409. Requesting same plan the org is on returns 409. Requesting inactive plan returns error. Approving already-processed request returns error. Org cancels pending request via `POST /org/:orgId/subscription/requests/:requestId/cancel` → verify status `cancelled` |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /org/:orgId/subscription/request`, `GET /org/:orgId/subscription`, `GET /org/:orgId/subscription/requests`, `GET /admin/subscription-requests`, `GET /admin/subscription-requests/:requestId`, `POST /admin/subscription-requests/:requestId/approve`, `POST /admin/subscription-requests/:requestId/reject` — PERM: requireOrgAccessGuard + adminGuard — ENT: `organisation_subscriptions`, `organisation_upgrade_requests`, `subscription_plans`, `subscription_plan_rates` — MOD: TECH-MOD-13, TECH-ARCH-16 |

**Source:** `org-portal.service.ts:199-281` (request), `org-portal.repository.ts:503-822` (repository), `organisation.service.ts:1131-1195` (admin handlers).

---

### TC-ORG-007: Cancellation Policy CRUD

| Property | Value |
|----------|-------|
| **ID** | TC-ORG-007 |
| **Title** | Cancellation policy creation, update, and deletion at org and branch level |
| **Purpose** | Verify that cancellation policies can be created at org and branch level, updated, and deleted, and that the org-level policy settings can be toggled |
| **Preconditions** | Existing organisation with branches |
| **Steps** | **Org-level:** 1. Call `POST /cancellation-policies` with `{ organisationId, cancellationWindowMinutes: 60, refundPercent: 50 }` → verify 201. 2. Call `GET /organisations/:orgId/cancellation-policies` → verify policy listed. 3. Call `PUT /cancellation-policies/:id` with `{ cancellationWindowMinutes: 120 }` → verify update. **Settings:** 4. Call `GET /organisations/:orgId/cancellation-settings` → verify defaults. 5. Call `PUT /organisations/:orgId/cancellation-settings` with `{ policyLevel: 'branch', cancellationBeforeHours: 24, cancellationFeePercentage: 10 }` → verify update. **Branch-level:** 6. Call `POST /cancellation-policies` with `{ branchId, cancellationWindowMinutes: 30, refundPercent: 100 }` → verify branch-level policy. 7. Call `GET /branches/:branchId/cancellation-policies` → verify policy listed. **Delete:** 8. Call `DELETE /cancellation-policies/:id` → verify 204. 9. Verify policy no longer returned in listing |
| **Expected Result** | Policies created at both levels, settings updated, policy deleted |
| **Negative Cases** | Creating without window or refund returns 422. Updating non-existent policy returns 404. Deleting non-existent policy returns 404 |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `GET/POST/PUT/DELETE /cancellation-policies`, `GET /organisations/:orgId/cancellation-policies`, `GET /branches/:branchId/cancellation-policies` — PERM: adminGuard — ENT: `cancellation_policies`, `organisations` — MOD: TECH-MOD-13 |

**Source:** `cancellation-policy.repository.ts:7-98`, `organisation.controller.ts:756-863`.

**Evidence:** Integration test files at `backend/src/modules/organisations/__tests__/org-portal.integration.spec.ts`, `backend/src/modules/organisations/__tests__/subscription-request.spec.ts`.

---

## Marketplace Integration Test Cases

### TC-MKT-001: Product CRUD

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-001 |
| **Title** | Full product CRUD — create, read, update, delete |
| **Purpose** | Verify that a seller can create a product with variants, images, and specifications, then read, update, and delete it. Admin can manage all products |
| **Preconditions** | Seed data: authenticated seller with `marketplace.sell` permission, existing categories, brands, tags |
| **Steps** | 1. Seller calls `POST /marketplace/products` with `{ name, description, price, categoryId, images }` → verify 201 with product data. 2. Seller calls `POST /marketplace/products/:id/variants` with variant data → verify variant created. 3. Seller calls `GET /marketplace/products/:id` → verify product and variants returned. 4. Seller calls `PUT /marketplace/products/:id` with updated fields → verify product updated. 5. Admin calls `PUT /marketplace/admin/products/:id/status` with status `active` → verify product status updated. 6. Seller calls `DELETE /marketplace/products/:id` → verify product deleted |
| **Expected Result** | Product created with all associations, readable, updatable, status manageable by admin, deletable by owner |
| **Negative Cases** | Create without required fields returns 422. Seller without `marketplace.sell` returns 403. Non-owner trying to update/delete returns 403. Create with non-existent category returns error |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /marketplace/products`, `GET /marketplace/products/:id`, `PUT /marketplace/products/:id`, `DELETE /marketplace/products/:id`, `POST /marketplace/products/:id/variants`, `PUT /marketplace/admin/products/:id/status` — PERM: `marketplace.sell` — ENT: `marketplace_products`, `product_variants`, `product_categories` — MOD: TECH-MOD-07 |

**Source:** `marketplace.routes.ts:15-19` (product routes), `:22-24` (variant routes), `:107-110` (admin product routes).

---

### TC-MKT-002: Add to Cart + Checkout

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-002 |
| **Title** | Full cart and checkout flow — add items, validate stock, select address, apply coupon, place order |
| **Purpose** | Verify end-to-end checkout: add multiple items to cart, update quantities, apply coupon, select shipping address, validate shipping, choose payment method, place order, verify stock deducted |
| **Preconditions** | Seed data: active products with stock, shipping rates for seller, saved address, valid coupon code, user authenticated |
| **Steps** | 1. Call `POST /marketplace/cart` with variant and quantity → verify item added. 2. Call `GET /marketplace/cart` → verify item appears with correct quantity. 3. Call `PUT /marketplace/cart/:itemId` to update quantity → verify updated. 4. Call `POST /marketplace/coupons/validate` with valid code → verify discount returned. 5. Call `POST /marketplace/cart/check-shipping` with `addressId` → verify shipping result per seller. 6. Call `POST /marketplace/orders` with address, coupon, payment method → verify 201 with order data. 7. Call `GET /marketplace/orders/:id` → verify order contains all items with correct totals. 8. Verify `product_variants.quantity` decreased. 9. Verify cart is now empty |
| **Expected Result** | Cart operations work, coupon applied, shipping validated, order created, stock deducted, cart cleared |
| **Negative Cases** | Add to cart with insufficient stock returns error. Add to cart without auth returns 401. Checkout without address returns error. Checkout with invalid coupon returns validation error. Checkout with zero stock (race condition) returns stock error |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /marketplace/cart`, `GET /marketplace/cart`, `PUT /marketplace/cart/:itemId`, `DELETE /marketplace/cart/:productId`, `POST /marketplace/coupons/validate`, `POST /marketplace/cart/check-shipping`, `POST /marketplace/orders`, `GET /marketplace/orders/:id` — ENT: `cart_items`, `order_items`, `orders`, `product_variants` — MOD: TECH-MOD-07 |

**Source:** `marketplace.routes.ts:31-36` (cart), `:52` (coupon), `:49` (shipping), `:61-66` (orders).

---

### TC-MKT-003: Order Lifecycle (All Transitions)

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-003 |
| **Title** | Full order lifecycle — all 7 statuses and role-based transitions |
| **Purpose** | Verify every allowed state transition per role (buyer, seller, admin), and that illegal transitions are rejected. Tests terminal status enforcement |
| **Preconditions** | Existing order in `pending` status owned by test user. Seller organisation and admin user exist |
| **Steps** | **Buyer:** 1. Buyer cancels pending order → verify `cancelled`. 2. Create new order, buyer cancels `confirmed` → verify `cancelled`. 3. Buyer confirms delivery on `shipped` → verify `delivered`. 4. Buyer requests refund on `delivered` → verify `refunded`. **Seller:** 5. Create order as `pending`, seller transitions to `processing` → verify. 6. Seller transitions `processing` → `shipped` → verify. 7. Seller tries to transition `confirmed` → `delivered` (illegal) → verify error. **Admin:** 8. Admin transitions `pending` → `confirmed` → verify. 9. Admin transitions `confirmed` → `processing` → verify. 10. Admin transitions `shipped` → `cancelled` → verify. 11. Admin tries to transition `cancelled` → `confirmed` (terminal) → verify error |
| **Expected Result** | All valid transitions succeed, all invalid transitions return errors. Terminal statuses (`cancelled`, `refunded`) are final |
| **Negative Cases** | Transition from terminal status returns error. Buyer trying to ship (illegal role) returns error. Non-owner buyer trying to cancel returns 403. Update without valid status returns 422 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `PUT /marketplace/orders/:id/status`, `POST /marketplace/orders/:id/cancel` — ENT: `orders`, `order_status_history` — MOD: TECH-MOD-07, GOV-ADR-007 |

**Source:** `order-aggregate.ts:5-37` (transition matrix), `order-constants.ts:1-2` (terminal statuses), `marketplace.service.ts:1077-1089` (validation).

---

### TC-MKT-004: Payment Integration (Wallet + Cash + Card)

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-004 |
| **Title** | Marketplace payment integration — cash on delivery, card payment via gateway |
| **Purpose** | Verify that checkout with `paymentMethod: 'cash'` creates confirmed order immediately. Checkout with `paymentMethod: 'card'` initiates gateway payment and order is confirmed after payment webhook |
| **Preconditions** | User with cart items and saved address. Mock gateway configured |
| **Steps** | **Cash:** 1. Checkout with `paymentMethod: 'cash'` → verify order created with `status: 'confirmed'`, `payment_status: 'pending'`. **Card:** 2. Checkout with `paymentMethod: 'card'` → verify order created with `status: 'confirmed'`, `payment_status: 'pending'`. 3. Verify response includes `clientSecret` for Pixel card or `paymentUrl`. 4. Simulate payment webhook → verify order `payment_status` transitions to `paid`. **Financial recording:** 5. Verify `_recordOrderFinancials` called on confirm, creates financial entries |
| **Expected Result** | Cash orders confirmed immediately. Card orders wait for webhook. Financial entries created correctly |
| **Negative Cases** | Gateway times out — order stays confirmed with pending payment. Payment cancelled — order remains but payment stays pending |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /marketplace/orders` — PERM: auth — ENT: `orders`, `payment_transactions` — MOD: TECH-MOD-07, TECH-MOD-09 |

**Source:** `marketplace.service.ts:860-904` (checkout), `marketplace.service.ts:911-938` (order financials).

---

### TC-MKT-005: Seller Settlement Flow

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-005 |
| **Title** | Seller settlement — request, approve, pay, complete |
| **Purpose** | Verify full settlement lifecycle for a marketplace seller: request settlement after orders are delivered, admin approves, payment processed, completed |
| **Preconditions** | Seller with delivered (but unsettled) orders. Authenticated seller with `marketplace.seller.request-settlement` permission |
| **Steps** | 1. Seller calls `GET /marketplace/seller/settlements/balance` → verify available balance > 0. 2. Seller calls `POST /marketplace/seller/settlements` → verify settlement created with `status: 'pending_approval'`. 3. Admin calls `POST /settlements/:id/approve` → verify status `approved`. 4. Admin calls `POST /settlements/:id/pay` → verify status `paid`, transaction entries created. 5. Admin calls `POST /settlements/:id/complete` → verify status `completed`. 6. Verify order items marked as `settled`. 7. Verify orders with ALL items settled are marked `settled` |
| **Expected Result** | Settlement requested, approved, paid, completed. Orders marked as settled. Financial entries created |
| **Negative Cases** | Request settlement with zero balance returns error. Admin rejects settlement → rolls back settlement_orders and order settlement status. Cancel pending settlement → same rollback |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `GET /marketplace/seller/settlements/balance`, `POST /marketplace/seller/settlements`, `POST /settlements/:id/approve`, `POST /settlements/:id/pay`, `POST /settlements/:id/complete` — PERM: `marketplace.seller.settlements`, `marketplace.seller.request-settlement` — ENT: `settlements`, `settlement_orders`, `settlement_transfers` — MOD: TECH-MOD-07, TECH-MOD-30 |

**Source:** `marketplace.routes.ts:91-94`, `settlement.service.ts` (full settlement lifecycle).

---

### TC-MKT-006: Inventory Purchase Order Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-006 |
| **Title** | Purchase order 5-state lifecycle — create, submit, approve, receive |
| **Purpose** | Verify full PO lifecycle: draft creation, submission, admin approval, stock receipt. Verify stock increases on receive and inventory_logs entries created |
| **Preconditions** | Existing warehouse, supplier, and product variant with known stock level |
| **Steps** | 1. Admin calls `POST /admin/purchase-orders` with supplier, warehouse, items → verify `status: 'draft'`. 2. Admin calls `PUT /admin/purchase-orders/:id` to edit → verify updated (draft only). 3. Admin calls `POST /admin/purchase-orders/:id/submit` → verify `status: 'submitted'`. 4. Admin calls `POST /admin/purchase-orders/:id/approve` → verify `status: 'approved'`. 5. Admin calls `POST /admin/purchase-orders/:id/receive` → verify `status: 'received'`, `received_at` set. 6. Verify `product_variants.quantity` increased by received quantity. 7. Verify `purchase_order_items.received_qty` updated. 8. Verify `inventory_logs` entry created with `movement_type: 'in'`, `stock_before`, `stock_after` |
| **Expected Result** | PO transitions through all states, stock increases, ledger entries created with snapshots |
| **Negative Cases** | Edit submitted PO returns error. Submit draft PO that's already submitted returns error. Approve already-approved PO returns error. Receive non-approved PO returns error. Cancel received PO returns error (terminal). Cancel draft/submitted/approved PO returns cancelled status |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/purchase-orders`, `PUT /admin/purchase-orders/:id`, `POST /admin/purchase-orders/:id/submit`, `POST /admin/purchase-orders/:id/approve`, `POST /admin/purchase-orders/:id/receive`, `POST /admin/purchase-orders/:id/cancel` — PERM: `inventory.purchase-orders.manage` — ENT: `purchase_orders`, `purchase_order_items`, `inventory_logs`, `product_variants` — MOD: TECH-MOD-08, TECH-ARCH-18 |

**Source:** `inventory.controller.ts:304-324` (state machine), `:368-424` (receive handler), `inventory.routes.ts:54-63`.

---

### TC-MKT-007: Stock Transfer Flow

| Property | Value |
|----------|-------|
| **ID** | TC-MKT-007 |
| **Title** | Stock transfer between warehouses |
| **Purpose** | Verify that stock can be transferred between warehouses, with `out` movement from source and `in` movement to destination, both creating inventory_logs entries with before/after snapshots |
| **Preconditions** | Two warehouses (source and destination) belonging to same organisation. Product variant with stock in source warehouse |
| **Steps** | 1. Record initial stock in source and destination warehouses. 2. Admin calls `POST /admin/stock-transfers` with variant, from/to warehouse, quantity → verify `status: 'pending'`. 3. Admin calls `POST /admin/stock-transfers/:id/complete` → verify `status: 'completed'`, `completed_at` set. 4. Verify source warehouse variant stock decreased by quantity. 5. Verify destination warehouse variant stock increased by quantity. 6. Verify two `inventory_logs` entries created: one `movement_type: 'out'` for source, one `movement_type: 'in'` for destination. 7. Verify both entries have correct `stock_before` and `stock_after` |
| **Expected Result** | Stock deducted from source, added to destination, both movements logged with before/after snapshots |
| **Negative Cases** | Transfer with insufficient source stock returns error. Complete already-completed transfer returns error. Transfer between warehouses of different orgs returns error (if enforced). Transfer with non-existent variant returns 404 |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /admin/stock-transfers`, `GET /admin/stock-transfers`, `POST /admin/stock-transfers/:id/complete` — PERM: `inventory.stock.manage`, `inventory.stock.view` — ENT: `stock_transfers`, `inventory_logs`, `product_variants`, `warehouses` — MOD: TECH-MOD-08, TECH-ARCH-18 |

**Source:** `inventory.controller.ts:460-557` (transfer handlers), `inventory.routes.ts:64-66`.

---

**Evidence:** All marketplace and inventory source files at `backend/src/modules/marketplace/presentation/marketplace.routes.ts`, `inventory.routes.ts`, `inventory.controller.ts`, `marketplace.service.ts`, `domain/order-aggregate.ts`, `domain/order-constants.ts`. Settlement module at `backend/src/modules/settlement/`.

---

## Academy Integration Test Cases

### TC-ACA-001: Academy Program Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-ACA-001 |
| **Title** | Full academy program lifecycle — draft → published → open → running → completed → archived |
| **Purpose** | Verify that an academy program can be created and transitioned through the full lifecycle, with all state transitions validated by `lifecycle.ts` |
| **Preconditions** | Authenticated admin with `academy.programs.*` permissions |
| **Steps** | 1. Call `POST /admin/academy/programs` with valid data → verify 201 with `status: 'draft'`. 2. Call `POST /admin/academy/programs/:id/publish` → verify `status: 'published'`. 3. Call `POST /admin/academy/programs/:id/transition` with `{ status: 'open' }` → verify `status: 'open'`. 4. Call `POST /admin/academy/programs/:id/transition` with `{ status: 'running' }` → verify `status: 'running'`. 5. Call `POST /admin/academy/programs/:id/transition` with `{ status: 'completed' }` → verify `status: 'completed'`. 6. Call `POST /admin/academy/programs/:id/archive` → verify `status: 'archived'` |
| **Expected Result** | Program traverses all lifecycle states correctly |
| **Negative Cases** | Attempt illegal transition (draft → completed) returns 409 Conflict. Archive archived program returns error. Create with duplicate code returns 409. Create without required fields returns 422 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/academy/programs`, `POST /admin/academy/programs/:id/publish`, `POST /admin/academy/programs/:id/archive`, `POST /admin/academy/programs/:id/transition` — PERM: `academy.programs.*` — ENT: `academy_programs` — MOD: TECH-MOD-04, TECH-ARCH-19 |

**Source:** `program.service.ts:18-72`, `lifecycle.ts:5-14`, `academy.dto.ts:5-46`.

---

### TC-ACA-002: Enrollment Flow (Capacity → Waiting List)

| Property | Value |
|----------|-------|
| **ID** | TC-ACA-002 |
| **Title** | Enrollment with capacity enforcement and waiting list |
| **Purpose** | Verify that enrolling into a program respects capacity limits, auto-assigns waiting list when full, and promotions work correctly |
| **Preconditions** | Program with `capacity: 2`. Two confirmed enrollments already exist. Player not yet enrolled |
| **Steps** | 1. Enroll third player (`POST /admin/academy/enrollments` with `player_id` and `program_id`) → verify `status: 'waiting'`, `waiting_order: 1`. 2. Enroll fourth player → verify `status: 'waiting'`, `waiting_order: 2`. 3. Cancel the first confirmed enrollment. 4. Verify the first waiting enrollment remains `waiting` (no auto-promotion). 5. Admin manually confirms the first waiting enrollment (`POST /admin/academy/enrollments/:id/confirm`) → verify `status: 'confirmed'`. 6. Check the second waiting enrollment — it stays `waiting` |
| **Expected Result** | Full program diverts to waiting list. Manual confirmation promotes from waiting list. No auto-promotion on cancel |
| **Negative Cases** | Enrolling already-enrolled player returns 409 Conflict. Enrolling into a full group returns 409 Group is full. Enrolling into non-existent program returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/academy/enrollments`, `POST /admin/academy/enrollments/:id/confirm`, `POST /admin/academy/enrollments/:id/cancel` — PERM: `academy.enrollments.*` — ENT: `academy_enrollments` — MOD: TECH-MOD-04 |

**Source:** `enrollment.service.ts:23-63` (enroll with capacity check), `enrollment.service.ts:79-84` (confirm), `enrollment.repository.ts:103-108` (getConfirmedCount).

---

### TC-ACA-003: Attendance Recording

| Property | Value |
|----------|-------|
| **ID** | TC-ACA-003 |
| **Title** | Attendance recording, duplicate prevention, and summary |
| **Purpose** | Verify that attendance can be recorded for a session, duplicates are rejected, and the summary endpoint returns aggregated counts |
| **Preconditions** | Existing group session with confirmed enrollments |
| **Steps** | 1. Record attendance for enrollment 1 with `{ attendance_status: 'present' }` → verify 201. 2. Record attendance for enrollment 2 with `{ attendance_status: 'absent', notes: 'Sick' }` → verify 201. 3. Attempt to record attendance for enrollment 1 again → verify 409 Conflict (duplicate). 4. Update enrollment 1's attendance via `PUT /admin/academy/attendance/:id` with `{ attendance_status: 'late' }` → verify update succeeds. 5. Call `GET /admin/academy/attendance/summary?group_session_id=N` → verify counts: present=0, absent=1, late=1, excused=0. 6. Test bulk recording: `POST /admin/academy/attendance/bulk` with 3 records (2 new + 1 duplicate) → verify `{ created: 2 }` |
| **Expected Result** | Records created, duplicates rejected, updates succeed, summary reflects correct counts |
| **Negative Cases** | Record for non-existent enrollment returns 404. Record for non-existent session returns error. Bulk with all duplicates returns `{ created: 0 }` |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /admin/academy/attendance`, `PUT /admin/academy/attendance/:id`, `POST /admin/academy/attendance/bulk`, `GET /admin/academy/attendance/summary` — PERM: `academy.attendance.*` — ENT: `academy_attendance` — MOD: TECH-MOD-04 |

**Source:** `attendance.service.ts:17-63`, `attendance.repository.ts`.

---

## Tournament Integration Test Cases

### TC-TRN-001: Tournament Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-TRN-001 |
| **Title** | Full tournament lifecycle — draft → published → registration_open → registration_closed → running → completed |
| **Purpose** | Verify that a tournament can be created and transitioned through the full lifecycle with all state transitions validated by `lifecycle.ts` |
| **Preconditions** | Authenticated admin with `tournament.*` permissions. Valid sport_id |
| **Steps** | 1. Create tournament via `POST /admin/tournaments` → verify 201 with `status: 'draft'`. 2. Publish: `POST /admin/tournaments/:id/publish` → verify `status: 'published'`. 3. Open registration: `POST /admin/tournaments/:id/open-reg` → verify `status: 'registration_open'`. 4. Close registration: `POST /admin/tournaments/:id/close-reg` → verify `status: 'registration_closed'`. 5. Start: `POST /admin/tournaments/:id/start` → verify `status: 'running'`. 6. Complete: `POST /admin/tournaments/:id/complete` → verify `status: 'completed'`. 7. Archive: `POST /admin/tournaments/:id/archive` → verify `status: 'archived'` |
| **Expected Result** | Tournament traverses all lifecycle states correctly |
| **Negative Cases** | Attempt illegal transition (draft → running) returns 409. Cancel from running → cancelled. Archive archived tournament returns error. Create with duplicate code returns 409 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: All tournament status endpoints — PERM: `tournament.create`, `.publish`, `.update`, `.manage`, `.delete` — ENT: `tournaments` — MOD: TECH-MOD-05, TECH-ARCH-20 |

**Source:** `tournament.service.ts:48-61`, `lifecycle.ts:5-14`.

---

### TC-TRN-002: Bracket Generation (Knockout + Round-Robin)

| Property | Value |
|----------|-------|
| **ID** | TC-TRN-002 |
| **Title** | Knockout bracket and round-robin fixture generation |
| **Purpose** | Verify that `generateBracket` produces correct matches for knockout (power-of-2 with byes) and round-robin (all-pairs) formats |
| **Preconditions** | Tournament with confirmed registrations. Different tournaments for each format |
| **Steps** | **Knockout with 5 participants:** 1. Call `POST /admin/tournaments/:id/generate-bracket`. 2. Verify 7 matches created (round 1: 4 matches with 3 byes; round 2: 2 matches; round 3: 1 match). 3. Verify round 1 matches include player1_id and player2_id (or undefined for byes). 4. Verify subsequent rounds have `player1_id = null` and `player2_id = null` (placeholders). **Round-robin with 4 participants:** 5. Call `POST /admin/tournaments/:id/generate-bracket`. 6. Verify 6 matches created (n*(n-1)/2 = 6). 7. Verify each pair appears exactly once. **Group stage knockout:** 8. Create groups via `POST /admin/tournaments/:id/generate-groups` with `{ group_size: 2, advance_count: 1 }`. 9. Call `POST /admin/tournaments/:id/generate-fixtures`. 10. Verify round-robin matches created within each group |
| **Expected Result** | Knockout produces correct bracket structure with byes. Round-robin produces all unique pairs. Group stage generates intra-group matches |
| **Negative Cases** | Generate bracket with < 2 participants returns error. Generate fixtures before groups returns error. Generate groups with no confirmed registrations returns error |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/tournaments/:id/generate-groups`, `POST /admin/tournaments/:id/generate-fixtures`, `POST /admin/tournaments/:id/generate-bracket` — PERM: `tournament.manage` — ENT: `tournament_matches`, `tournament_groups`, `tournament_group_members` — MOD: TECH-MOD-05, GOV-ADR-009 |

**Source:** `tournament-aggregate.ts:137-170` (generateKnockoutBracket, generateRoundRobinMatches), `tournament.service.ts:130-223` (generateGroups, generateFixtures, generateBracket).

---

### TC-TRN-003: Match Result Recording + Standings Calculation

| Property | Value |
|----------|-------|
| **ID** | TC-TRN-003 |
| **Title** | Record match result and verify standings recalculation |
| **Purpose** | Verify that recording a match result updates standings correctly with points (3 per win), tiebreakers (GD → GF), and position assignment |
| **Preconditions** | Tournament with round-robin format. 4 confirmed participants. 3 matches created (pairs: 1v2, 1v3, 2v3) |
| **Steps** | 1. Call `GET /admin/tournaments/:id/standings` → verify all participants have 0 points, position based on seed. 2. Record result for match 1v2: winner=1, home_score=6, away_score=3 (`POST /admin/tournaments/matches/:matchId/result`). 3. Call standings → verify player1: 3pts, 1W, 0L, GF=6, GA=3, position=1. Player2: 0pts, 0W, 1L, GF=3, GA=6, position=3. 4. Record result for match 1v3: winner=1, home_score=6, away_score=1. 5. Call standings → verify player1: 6pts, 2W, GF=12, GA=4, position=1. Player3: 0pts, 0W, 1L, GF=1, GA=6, position=4. 6. Record result for match 2v3: winner=2, home_score=6, away_score=4. 7. Call standings → verify final positions: 1=player1(6pts), 2=player2(3pts, GD=+2), 3=player3(0pts, GD=-7). 8. Verify `tournament_match_results` record created with correct scores and `entered_by`. 9. Verify match status updated to `completed` |
| **Expected Result** | Standings updated correctly after each result. Points/positions/scores match expected values |
| **Negative Cases** | Record result for already-completed match returns conflict. Record result for non-existent match returns 404. Entering result without required fields returns 422 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/tournaments/matches/:matchId/result`, `GET /admin/tournaments/:id/standings` — PERM: `tournament.manage` — ENT: `tournament_match_results`, `tournament_standings`, `tournament_matches` — MOD: TECH-MOD-05 |

**Source:** `tournament.service.ts:225-247` (recordMatchResult), `tournament-aggregate.ts:172-209` (computeStandings).

---

## League Integration Test Cases

### TC-LGE-001: League Lifecycle with Season

| Property | Value |
|----------|-------|
| **ID** | TC-LGE-001 |
| **Title** | Full league lifecycle with season — season creation, league creation, team registration, status transitions |
| **Purpose** | Verify the full lifecycle: create a season, create a league under it, register teams, transition league through all statuses |
| **Preconditions** | Authenticated admin with `season.*` and `league.*` permissions |
| **Steps** | 1. Create season via `POST /admin/seasons` → verify `status: 'draft'`. 2. Publish season: `POST /admin/seasons/:id/publish` → verify `status: 'published'`. 3. Create league under season via `POST /admin/leagues` with `format: 'round_robin'` → verify `status: 'draft'`. 4. Create division via `POST /admin/leagues/divisions` with `tier: 1`, `capacity: 4`. 5. Open registration: `POST /admin/leagues/:id/publish` → verify `status: 'registration_open'`. 6. Register 4 teams via `POST /admin/leagues/:id/register-team` → verify each gets `status: 'pending'` or auto-confirmed. 7. Confirm all teams. 8. Close registration: `POST /admin/leagues/:id/close-reg` → verify `status: 'registration_closed'`. 9. Start league: `POST /admin/leagues/:id/start` → verify `status: 'running'`. 10. Complete league: `POST /admin/leagues/:id/complete` → verify `status: 'completed'` |
| **Expected Result** | Season and league traverse all lifecycle states. Teams register within division capacity |
| **Negative Cases** | Register team after registration closed returns error. Exceed division capacity creates waiting entry. Complete non-running league returns error. Archive non-completed league returns error. Duplicate league code returns 409 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: All season and league endpoints — PERM: `season.*`, `league.*` — ENT: `seasons`, `leagues`, `league_divisions`, `league_teams` — MOD: TECH-MOD-06, TECH-ARCH-21 |

**Source:** `season.service.ts:8-51`, `league.service.ts:12-157`, `lifecycle.ts:5-29`.

---

### TC-LGE-002: Division Promotion/Relegation

| Property | Value |
|----------|-------|
| **ID** | TC-LGE-002 |
| **Title** | Division promotion and relegation between tiers |
| **Purpose** | Verify that the top N teams from a lower division are promoted to the next higher tier, and bottom N teams from a higher division are relegated to the next lower tier |
| **Preconditions** | League with two divisions: Div A (tier=1, capacity=4, relegation_count=1) and Div B (tier=2, capacity=4, advance_count=1). Each division has 4 confirmed teams with completed matches and calculated standings |
| **Steps** | **Promotion:** 1. Call `POST /admin/leagues/divisions/:divBId/promote` with `team_count: 1`. 2. Verify the top team from Div B (position 1 in standings) has its `division_id` updated to Div A's ID. **Relegation:** 3. Call `POST /admin/leagues/divisions/:divAId/relegate` with `team_count: 1`. 4. Verify the bottom team from Div A (position 4 in standings) has its `division_id` updated to Div B's ID. **Edge case:** 5. Try promoting from a division with no higher tier → verify 400 error. 6. Try relegating from a division with no lower tier → verify 400 error |
| **Expected Result** | Top team moves up, bottom team moves down, boundary errors return appropriate messages |
| **Negative Cases** | Promote with no ranked teams returns error. Promote with `team_count > advance_count` succeeds (no hard limit in service). Promote/relegate from non-existent division returns 404 |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `POST /admin/leagues/divisions/:id/promote`, `POST /admin/leagues/divisions/:id/relegate` — PERM: `league.divisions.*` — ENT: `league_divisions`, `league_teams` — MOD: TECH-MOD-06 |

**Source:** `division.service.ts:23-73`.

---

### TC-LGE-003: Fixture Generation + Standings

| Property | Value |
|----------|-------|
| **ID** | TC-LGE-003 |
| **Title** | Round-robin fixture generation and standings recalculation |
| **Purpose** | Verify that `generateFixtures` creates correct round-robin pairings (single and double), and that `recordResult` triggers standings recalculation with correct W/D/L/points/form |
| **Preconditions** | League with single division, 4 confirmed teams. `points_per_win: 3`, `points_per_draw: 1` |
| **Steps** | **Single round-robin:** 1. Call `POST /admin/leagues/:id/generate-fixtures`. 2. Verify 6 matches created (4 teams → n*(n-1)/2 = 6). 3. Verify 3 rounds × 2 matches per round. 4. Verify each team appears in exactly 3 matches (home and away alternated). **Results entry:** 5. Record results for all 6 matches with varying scores. 6. Call `GET /admin/leagues/standings/:divisionId`. 7. Verify standings calculated correctly: wins=3pts each, draws=1pt each, GF/GA/GD match entered scores. 8. Verify form field: each team has last 5 results as `['W','L','D',...]`. 9. Verify positions sorted by points → GD → GF. **Double round-robin:** 10. Create a new league with `format: 'double_round_robin'`. 11. Generate fixtures → verify 12 matches created (double the single round). 12. Verify each pair plays twice (home and away reversed). **Recalculation:** 13. Change a match result → call `POST /admin/leagues/standings/recalculate/:divisionId`. 14. Verify standings reflect the updated result |
| **Expected Result** | Correct match count, balanced home/away, standings computed correctly with form tracking |
| **Negative Cases** | Generate fixtures with < 2 teams returns empty. Generate fixtures for league with no active divisions returns error. Record result for non-existent match returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/leagues/:id/generate-fixtures`, `POST /admin/leagues/matches/:matchId/result`, `GET /admin/leagues/standings/:divisionId`, `POST /admin/leagues/standings/recalculate/:divisionId` — PERM: `league.fixtures.*`, `league.matches.*`, `league.standings.*` — ENT: `league_matches`, `league_results`, `league_standings` — MOD: TECH-MOD-06, TECH-ARCH-21 |

**Source:** `fixture.service.ts:14-129`, `standing.service.ts:9-48`, `domain/league-aggregate.ts:7-138` (generateRoundRobinFixtures, computeLeagueStandings).

---

## CRM Integration Test Cases

### TC-CRM-001: Customer 360 Aggregation

| Property | Value |
|----------|-------|
| **ID** | TC-CRM-001 |
| **Title** | Customer 360 profile aggregation from all domains |
| **Purpose** | Verify that `GET /admin/crm/customers/:id` returns a unified profile aggregating data from users, bookings, orders, wallet, academy, tournaments, and leagues |
| **Preconditions** | Seed data: user with at least 1 booking (1 completed, 1 cancelled), 2 orders (total_amount = 300.00), 1 wallet deposit (100.00) + 1 debit (50.00), 1 academy enrollment, 1 tournament registration, 1 league team membership |
| **Steps** | 1. Call `GET /admin/crm/customers/:id`. 2. Verify `data.id` matches the user. 3. Verify `data.bookings.total = 2`, `data.bookings.completed = 1`, `data.bookings.cancelled = 1`. 4. Verify `data.orders.total = 2`, `data.orders.total_spent = 300.00`. 5. Verify `data.wallet.total_deposits = 100.00`, `data.wallet.total_withdrawn = 50.00`. 6. Verify `data.enrollments.total = 1`. 7. Verify `data.tournaments.total = 1`. 8. Verify `data.leagueTeams.total = 1`. 9. Verify `data.lastActivity` is the max of all domain dates |
| **Expected Result** | All domain aggregates returned correctly in a single response |
| **Negative Cases** | Non-existent user ID returns 404. User with zero activity returns zeroed aggregates (no NULL fields) |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `GET /admin/crm/customers/:id` — PERM: `crm.customers.view` — ENT: `users`, `bookings`, `orders`, `wallet_transactions`, `academy_enrollments`, `tournament_registrations`, `league_teams` — MOD: TECH-MOD-15 |

**Source:** `crm.controller.ts:52-110` (getCustomerHandler).

### TC-CRM-002: Lead Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-CRM-002 |
| **Title** | Full lead lifecycle — create, qualify, convert, and status transitions |
| **Purpose** | Verify that a lead can be created and transitioned through the 4-state lifecycle: `new → qualified → converted` (or `lost`) |
| **Preconditions** | Authenticated admin with `crm.leads.manage` permission. An existing user with known email for conversion match |
| **Steps** | 1. Call `POST /admin/crm/leads` with `{ fullName: 'John Doe', source: 'manual', email: 'john@example.com' }` → verify 201 with `id`. 2. Call `GET /admin/crm/leads` → verify lead appears with `status: 'new'`. 3. Call `PUT /admin/crm/leads/:id` with `{ status: 'qualified', assignedTo: adminId }` → verify `status` updated to `qualified`. 4. Call `POST /admin/crm/leads/:id/convert` → verify `status` transitions to `converted`, `convertedUserId` matches the user with matching email. 5. Create a second lead, call `PUT /admin/crm/leads/:id` with `{ status: 'lost' }` → verify `status: 'lost'` |
| **Expected Result** | Lead traverses new → qualified → converted (or lost). Conversion links to existing user by email |
| **Negative Cases** | Convert already-converted lead returns 400. Create without required fields returns 422. Update non-existent lead returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/crm/leads`, `PUT /admin/crm/leads/:id`, `POST /admin/crm/leads/:id/convert` — PERM: `crm.leads.manage` — ENT: `leads` — MOD: TECH-MOD-15 |

**Source:** `crm.controller.ts:295-417`, `crm.routes.ts:20-24`.

### TC-CRM-003: Campaign Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-CRM-003 |
| **Title** | Full campaign lifecycle — create, launch, pause, complete |
| **Purpose** | Verify that a marketing campaign can be created and transitioned through the 5-state lifecycle: `draft → active → paused → completed` (or `cancelled`). Verify state machine validation |
| **Preconditions** | Authenticated admin with `crm.campaigns.manage` permission. Existing segment (optional) |
| **Steps** | 1. Call `POST /admin/crm/campaigns` with `{ name: 'Summer Sale', type: 'email', segmentId }` → verify 201 with `id`, `status: 'draft'`. 2. Call `POST /admin/crm/campaigns/:id/launch` → verify `status: 'active'`, `startedAt` is set. 3. Call `POST /admin/crm/campaigns/:id/pause` → verify `status: 'paused'`. 4. Call `POST /admin/crm/campaigns/:id/launch` (from paused) → verify `status: 'active'`. 5. Call `POST /admin/crm/campaigns/:id/complete` → verify `status: 'completed'`, `completedAt` is set. 6. Attempt to launch completed campaign → verify 400 error (illegal transition) |
| **Expected Result** | Campaign traverses all lifecycle states correctly. Illegal transitions from terminal states are rejected |
| **Negative Cases** | Launching a completed campaign returns 400. Completing an already completed/cancelled campaign returns 400. Pausing a non-active campaign returns 400 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /admin/crm/campaigns`, `POST /admin/crm/campaigns/:id/launch`, `POST /admin/crm/campaigns/:id/pause`, `POST /admin/crm/campaigns/:id/complete` — PERM: `crm.campaigns.manage` — ENT: `marketing_campaigns` — MOD: TECH-MOD-15 |

**Source:** `crm.controller.ts:419-590`, `crm.routes.ts:26-32`.

---

## HR Integration Test Cases

### TC-HR-001: Employee Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-HR-001 |
| **Title** | Full employee lifecycle — draft → onboarding → active → on_leave → terminated → archived |
| **Purpose** | Verify that an employee record can be created and transitioned through all valid lifecycle states. Verify that illegal transitions are rejected |
| **Preconditions** | Authenticated admin with `hr.employees.manage` permission. Existing user and organisation |
| **Steps** | 1. Call `POST /hr/employees` with `{ userId, organisationId, employeeCode: 'EMP001', hireDate: '2025-01-01' }` → verify 201 with `employmentStatus: 'draft'`. 2. Call `PATCH /hr/employees/:id/status` with `{ status: 'onboarding' }` → verify status updated. 3. Transition `onboarding → active` → verify. 4. Transition `active → on_leave` → verify. 5. Transition `on_leave → active` → verify. 6. Transition `active → terminated` with `{ status: 'terminated', terminationDate: '2025-06-01', terminationReason: 'Resignation' }` → verify `terminationDate` and `terminationReason` set. 7. Transition `terminated → archived` → verify. 8. Attempt to transition `archived → active` → verify 400 invalid transition |
| **Expected Result** | Employee traverses all valid lifecycle states. Illegal transitions return 400 with error message |
| **Negative Cases** | Duplicate (user_id + organisation_id) returns 409 Conflict. Transition from terminal state returns 400. Invalid status value returns 400. Non-existent employee returns 404 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /hr/employees`, `PATCH /hr/employees/:id/status` — PERM: `hr.employees.manage` — ENT: `employees` — MOD: TECH-MOD-16 |

**Source:** `hr.controller.ts:252-400`, `hr.routes.ts:23-27`. Transition map at `hr.controller.ts:252-260`.

### TC-HR-002: Leave Request Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-HR-002 |
| **Title** | Full leave request lifecycle — create, submit, approve, cancel, reject |
| **Purpose** | Verify the 6-state leave lifecycle: `draft → submitted → approved → completed`, with `rejected` and `cancelled` branches. Verify leave balance deduction on approval and reversal on cancellation |
| **Preconditions** | Existing employee with leave balance: `total_days = 21, used_days = 5, pending_days = 0, year = CURRENT_YEAR`. Existing leave type with `requires_approval = true` |
| **Steps** | **Standard flow:** 1. Call `POST /hr/leave-requests` with `{ employeeId, leaveTypeId, startDate, endDate, durationDays: 3 }` → verify `status: 'draft'`. 2. Call `POST /hr/leave-requests/:id/submit` → verify `status: 'submitted'`. 3. Call `GET /hr/leave-balances?employeeId=X&year=Y` → verify `pending_days = 3`. 4. Call `POST /hr/leave-requests/:id/approve` → verify `status: 'approved'`, `approvedBy` is set. 5. Call `GET /hr/leave-balances?employeeId=X&year=Y` → verify `used_days = 8` (5+3), `pending_days = 0`. **Cancellation flow:** 6. Create another leave request (duration 2), submit, approve → verify used_days increases to 10. 7. Call `POST /hr/leave-requests/:id/cancel` → verify `status: 'cancelled'`. 8. Verify leave balance `used_days` returns to 8. **Rejection flow:** 9. Create and submit a third leave request. 10. Call `POST /hr/leave-requests/:id/reject` → verify `status: 'rejected'`. 11. Verify `pending_days` returns to 0 |
| **Expected Result** | Leave request traverses all lifecycle states. Balance is deducted on approval and reversed on cancellation |
| **Negative Cases** | Approve with insufficient balance (`used_days + duration > total_days`) returns 400 with `LEAVE_BALANCE_EXCEEDED`. Submit non-draft leave returns error. Approve non-submitted leave returns error. Cancel completed leave returns error |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /hr/leave-requests`, `POST /hr/leave-requests/:id/submit`, `POST /hr/leave-requests/:id/approve`, `POST /hr/leave-requests/:id/reject`, `POST /hr/leave-requests/:id/cancel`, `GET /hr/leave-balances` — PERM: `hr.leaves.requests.manage`, `hr.leaves.requests.approve` — ENT: `leave_requests`, `leave_balances` — MOD: TECH-MOD-16 |

**Source:** `hr.controller.ts:630-894` (leave handlers). Transition map at `hr.controller.ts:632-639`. Balance deduction at `hr.controller.ts:771-787`.

### TC-HR-003: Payroll Run Lifecycle

| Property | Value |
|----------|-------|
| **ID** | TC-HR-003 |
| **Title** | Full payroll run lifecycle — create, calculate, approve, post to GL, mark paid, close |
| **Purpose** | Verify the 6-state payroll lifecycle: `draft → calculated → approved → posted → paid → closed`. Verify payroll calculation logic, component breakdown, and GL posting |
| **Preconditions** | Existing organisation with 2 employees: EmpA (salary 5000) and EmpB (salary 3000). Two active payroll components: "Bonus" (earning, percentage = 10) and "Tax" (deduction, percentage = 5). Open accounting period |
| **Steps** | **Create:** 1. Call `POST /hr/payroll-runs` with `{ organisationId, periodStart: '2025-06-01', periodEnd: '2025-06-30' }` → verify 201 with `status: 'draft'`. **Calculate:** 2. Call `POST /hr/payroll-runs/:id/calculate` → verify `status: 'calculated'`, `employeeCount: 2`. 3. Call `GET /hr/payroll-runs/:id` → verify 2 payroll_entries. 4. Verify EmpA: `baseSalary=5000, totalEarnings=500 (10%), totalDeductions=250 (5%), netPay=5250`. 5. Verify EmpB: `baseSalary=3000, totalEarnings=300 (10%), totalDeductions=150 (5%), netPay=3150`. 6. Verify run totals: `totalGross=8800, totalDeductions=400, totalNet=8400`. **Approve:** 7. Call `POST /hr/payroll-runs/:id/approve` → verify `status: 'approved'`. **Post to GL:** 8. Call `POST /hr/payroll-runs/:id/post` → verify `status: 'posted'`, `postedAt` set. 9. Verify 4 `general_ledger` records created (2 per employee: debit + credit). 10. Verify each entry: debit account_id=1, credit account_id=5, amounts match net_pay per employee. **Mark paid & close:** 11. Call `POST /hr/payroll-runs/:id/mark-paid` → verify `status: 'paid'`, `paidAt` set. 12. Call `POST /hr/payroll-runs/:id/close` → verify `status: 'closed'` |
| **Expected Result** | Payroll run traverses all lifecycle states. Calculation produces correct amounts. Post creates double-entry GL records. Re-calculation (draft → calculated) is possible before posting |
| **Negative Cases** | Calculate non-draft run returns error. Approve non-calculated run returns error. Post non-approved run returns error. Close non-paid run returns error. Post already-posted run returns error |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `POST /hr/payroll-runs`, `POST /hr/payroll-runs/:id/calculate`, `POST /hr/payroll-runs/:id/approve`, `POST /hr/payroll-runs/:id/post`, `POST /hr/payroll-runs/:id/mark-paid`, `POST /hr/payroll-runs/:id/close` — PERM: `hr.payroll.runs.*` — ENT: `payroll_runs`, `payroll_entries`, `payroll_components`, `general_ledger` — MOD: TECH-MOD-16, TECH-MOD-12 |

**Source:** `hr.controller.ts:1177-1498` (payroll handlers). Transition map at `hr.controller.ts:1179-1186`. Calculation at `hr.controller.ts:1259-1349`. GL posting at `hr.controller.ts:1376-1445`.

---

## Reports Integration Test Cases

### TC-RPT-001: Financial Report Generation

| Property | Value |
|----------|-------|
| **ID** | TC-RPT-001 |
| **Title** | Financial report generation across 5 endpoints |
| **Purpose** | Verify that all 5 financial report endpoints return correct data from `wallet_transactions`, `payment_transactions`, and `settlements` |
| **Preconditions** | Seed data: wallet_transactions with mixed types (payment, commission, deposit, withdrawal, refund, settlement) spanning 90 days. Payment_transactions with mixed payment_method values. Settlements with mixed statuses |
| **Steps** | 1. Call `GET /reports/financial/summary` with date range covering 90 days. 2. Verify `total_revenue` equals SUM of credit `payment` transactions. 3. Verify `total_commission` equals SUM of credit `commission`. 4. Call `GET /reports/financial/by-source` — verify two rows: `payment` and `commission`. 5. Call `GET /reports/financial/timeline?groupBy=month` — verify monthly grouping with correct revenue. 6. Call `GET /reports/financial/payment-methods` — verify distribution by payment_method. 7. Call `GET /reports/financial/settlements` — verify settlement_status breakdown |
| **Expected Result** | All 5 endpoints return correct aggregated data matching the seed data |
| **Negative Cases** | Date range with no data returns zeroed aggregates (not empty 404). Non-existent route returns 404. No auth returns 401 |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `GET /reports/financial/*` — ENT: `wallet_transactions`, `payment_transactions`, `settlements` — MOD: TECH-MOD-29, TECH-ARCH-24 |

**Source:** `reports.repository.ts:26-94`, `reports.controller.ts:15-29`

---

### TC-RPT-002: BI Dashboard Aggregation

| Property | Value |
|----------|-------|
| **ID** | TC-RPT-002 |
| **Title** | BI executive dashboard aggregation across 12 queries |
| **Purpose** | Verify that `GET /bi/dashboard` returns all metric groups correctly: revenue (30d, 7d, today), bookings (30d, 7d, today), active users, active orgs, revenue trend (12mo), booking trend (30d), top orgs, user growth (12mo) |
| **Preconditions** | Seed data: payment_transactions with completed status spanning 12 months. Bookings spanning 30 days. Users with varied last_login_at dates. Active and inactive organisations |
| **Steps** | 1. Call `GET /bi/dashboard` without auth → verify 401. 2. Call with role lacking `bi.dashboard.view` → verify 403. 3. Call with valid admin → verify 200 with `data` object. 4. Verify `data.revenue.last30d` > 0. 5. Verify `data.revenue.last7d` ≤ `data.revenue.last30d`. 6. Verify `data.bookings.last30d` > 0. 7. Verify `data.activeUsers` matches seed active user count. 8. Verify `data.activeOrganisations` matches seed active org count. 9. Verify `revenueTrend` array has ≤ 12 entries, ordered ascending. 10. Verify `bookingTrend` array has ≤ 30 entries. 11. Verify `topOrgs` array sorted by revenue descending. 12. Verify `userGrowth` array has ≤ 12 entries |
| **Expected Result** | All 8 metric groups returned with correct aggregation matching seed data |
| **Negative Cases** | Empty database returns zeroed values (no null/NaN). Org-scoped endpoint `GET /bi/dashboard/org/:orgId` returns zeroed for non-existent org (not 404) |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `GET /bi/dashboard`, `GET /bi/dashboard/org/:orgId` — PERM: `bi.dashboard.view` — ENT: `payment_transactions`, `bookings`, `users`, `organisations` — MOD: TECH-MOD-25, TECH-ARCH-24 |

**Source:** `bi.controller.ts:21-112`, `bi.controller.ts:114-229`

---

### TC-RPT-003: CSV Export

| Property | Value |
|----------|-------|
| **ID** | TC-RPT-003 |
| **Title** | CSV export for all 4 report types |
| **Purpose** | Verify that `GET /bi/export/:reportType` generates valid CSV for revenue, bookings, users, and organisations. Verify Content-Type and Content-Disposition headers |
| **Preconditions** | Seed data: payment_transactions, bookings, users, organisations with dates spanning 90 days |
| **Steps** | 1. Call `GET /bi/export/revenue` → verify 200 with `Content-Type: text/csv; charset=utf-8`. 2. Verify header `Content-Disposition: attachment; filename="revenue-report.csv"`. 3. Verify CSV body starts with header row `Date,Revenue`. 4. Verify data rows exist with date and revenue values. 5. Call `GET /bi/export/bookings` → verify `Date,Bookings` header + data. 6. Call `GET /bi/export/users` → verify `Date,Registrations` header + data. 7. Call `GET /bi/export/organisations` → verify `Name,Created At,Active,Type` header + data. 8. Call `GET /bi/export/invalidType` → verify 400 `INVALID_REPORT_TYPE` |
| **Expected Result** | Valid CSV generated for all 4 types. Unknown report type returns 400 |
| **Negative Cases** | Invalid report type returns 400. No auth returns 401. Missing permission returns 403. Empty data returns CSV with header only (no data rows) |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `GET /bi/export/:reportType` — PERM: `bi.export` — MOD: TECH-MOD-25 |

**Source:** `bi.controller.ts:260-325`

---

## Observability Integration Test Cases

### TC-OBS-001: Health Check Endpoints

| Property | Value |
|----------|-------|
| **ID** | TC-OBS-001 |
| **Title** | Health check endpoints — composite, database, redis, storage, version |
| **Purpose** | Verify that all health check endpoints respond correctly: `/health` (composite), `/health/database`, `/health/redis`, `/health/storage`, `/health/version`. Verify status propagation (ok, degraded, down) |
| **Preconditions** | Backend running with MySQL and Redis accessible. Upload directory exists and is writable |
| **Steps** | **Composite:** 1. Call `GET /health` → verify 200. 2. Verify `service = 'courtzon-v2-backend'`. 3. Verify `uptime` > 0. 4. Verify `checks.database.status = 'ok'`. 5. Verify `checks.redis.status = 'ok'`. 6. Verify `checks.memory.status` is 'ok' or 'warning'. **Database:** 7. Call `GET /health/database` → verify `status = 'ok'`, `database = 'connected'`, `tables > 0`. **Redis:** 8. Call `GET /health/redis` → verify `status = 'ok'`, `connected = true`. **Storage:** 9. Call `GET /health/storage` → verify `status = 'ok'`, `writable = true`, `freeDiskMb > 0`. **Version:** 10. Call `GET /health/version` → verify response contains git commit, build time, version |
| **Expected Result** | All health endpoints return 200 with correct status information. DB latency recorded in ms |
| **Negative Cases** | When MySQL is unavailable, composite health returns `status: 'down'` and `checks.database.status = 'down'`. When Redis is unavailable, `checks.redis.status = 'down'` |
| **Priority** | P0 |
| **Related Knowledge Objects** | API: `GET /health`, `GET /health/database`, `GET /health/redis`, `GET /health/storage`, `GET /health/version` — MOD: TECH-ARCH-25 |

**Source:** `health.service.ts:59-143`

---

### TC-OBS-002: Prometheus Metrics Endpoint

| Property | Value |
|----------|-------|
| **ID** | TC-OBS-002 |
| **Title** | Prometheus metrics endpoint returns valid metrics |
| **Purpose** | Verify that `GET /metrics` returns default Node.js metrics (prefixed with `courtzon_`) plus custom metrics (HTTP duration histogram, request counter). Verify `METRICS_TOKEN` protection if configured |
| **Preconditions** | Backend running. At least one HTTP request has been served to populate request metrics |
| **Steps** | **Without token protection:** 1. Call `GET /metrics` → verify 200. 2. Verify Content-Type is `text/plain; version=0.0.4; charset=utf-8` or `application/openmetrics-text`. 3. Verify response contains `courtzon_nodejs_heap_size_bytes` (from default metrics). 4. Verify response contains `courtzon_http_request_duration_seconds_count` > 0. 5. Verify response contains `courtzon_http_requests_total`. 6. Verify response contains `courtzon_aggregate_version_conflicts_total`. 7. Verify response does NOT contain raw URL labels (uses route template). **With token:** 8. Set `METRICS_TOKEN=secret123`. 9. Call `GET /metrics` without token → verify 401. 10. Call `GET /metrics?token=secret123` → verify 200. 11. Call `GET /metrics` with `Authorization: Bearer secret123` → verify 200 |
| **Expected Result** | Valid Prometheus metrics output with custom metrics present. Token protection works |
| **Negative Cases** | Wrong token returns 401. No token when required returns 401. Invalid method returns 405 |
| **Priority** | P1 |
| **Related Knowledge Objects** | API: `GET /metrics` — MOD: TECH-ARCH-25 |

**Source:** `metrics.ts:1-73`, `alerts.yml:1-54`
