---
document_id: "ADMIN-02"
document_name: "Organisation Admin Guide"
family: "ADMIN"
document_type: "GUIDE"
status: "Draft"
version: "0.1"
audience: ["org-admin"]
difficulty: "beginner"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Organisation Admin Guide (ADMIN-02) — Managing Bookings

## Chapter: Managing Bookings

### 1. Purpose

As an Organisation Admin, you can view and manage all bookings across your organisation's branches. This includes updating booking statuses, managing matchmaking applicants, enforcing cancellation policies, and generating reports.

### 2. Prerequisites

- You must have the **Org Admin** role (or a role with `org.bookings.manage` permission)
- Required permissions:
  - `org.bookings.manage` — Access the Org Bookings page
  - `org.bookings.update-status` — Update booking/payment status
  - `bookings.view` — View booking details

### 3. Viewing All Org Bookings

**Interface:** Org Bookings page (`/org/bookings`)

The page shows all bookings for your organisation in a tabular format with filters:

| Filter | Description | Source |
|--------|-------------|--------|
| Status | Filter by booking status (confirmed, pending, checked_in, completed, cancelled) | `GET /organisations/:orgId/bookings?status=` |
| Date | Filter by booking date | `GET /organisations/:orgId/bookings?date=` |
| Branch | Filter by branch (UI-level) | Org sidebar → Bookings |

**API Reference:**
```
GET /organisations/:orgId/bookings
Permission: bookings.view
Response: { data: Booking[] }
```

**Source:** `backend/src/modules/booking/presentation/booking.routes.ts:18`, `booking.repository.ts:164-176`

### 4. Updating Booking Status

You can update a booking's status through the Org Bookings page or directly via API:

**Supported transitions (admin-override):**

| From | To | Endpoint |
|------|----|----------|
| pending | confirmed | `PATCH /bookings/:id/status` |
| pending_payment | confirmed | `PATCH /bookings/:id/status` |
| confirmed | completed | `PATCH /bookings/:id/status` |
| confirmed | cancelled | `PATCH /bookings/:id/status` |
| checked_in | completed | `PATCH /bookings/:id/status` |
| confirmed | no_show | `PATCH /bookings/:id/status` |
| any | cancelled | `PATCH /bookings/:id/status` |

**API Reference:**
```
PATCH /bookings/:id/status
Permissions: admin.bookings.update-status OR org.bookings.manage
Body: { status: string }
Effects: Emits audit event BOOKING.STATUS_CHANGE
```

**Source:** `backend/src/modules/booking/presentation/booking.controller.ts:109-125`, `booking.service.ts:927-1018`

### 5. Updating Payment Status

**API Reference:**
```
PATCH /bookings/:id/payment
Permissions: admin.bookings.update-status OR org.bookings.manage
Body: { paymentStatus: string }  // paid, refunded, partially_refunded, failed, penalty
Effects: Emits audit event BOOKING.UPDATE_PAYMENT
```

**Source:** `backend/src/modules/booking/presentation/booking.controller.ts:146-161`

### 6. Managing Matchmaking Applicants

For public match bookings, you (or the host) can manage applicants:

| Action | Endpoint | Description |
|--------|----------|-------------|
| List applicants | `GET /bookings/:id/applicants` | View all applicants for a booking |
| List candidates | `GET /bookings/:id/matchmaking/candidates` | Get matching players for matchmaking |
| Accept applicant | `POST /booking-invitations/:invitationId/respond` | Body: `{ action: 'accepted' }` |
| Decline applicant | `POST /booking-invitations/:invitationId/respond` | Body: `{ action: 'declined' }` |
| Cancel application | `DELETE /booking-invitations/:invitationId` | Withdraw/remove an application |

**Matchmaking Criteria fields** (when starting matchmaking):

| Field | Type | Description |
|-------|------|-------------|
| `minAge` | number (optional) | Minimum applicant age |
| `maxAge` | number (optional) | Maximum applicant age |
| `targetGender` | 'male' \| 'female' \| 'any' | Gender preference |
| `targetLevelId` | number (optional) | Skill level (FK to `player_levels`) |
| `maxPlayers` | number | Max participants (default 2) |
| `deadline` | datetime (optional) | Application deadline |
| `autoApply` | boolean | Auto-accept qualified applicants |

**Source:** `backend/src/modules/booking/presentation/booking.routes.ts:21-27`, `booking.controller.ts:163-240`, `booking.dto.ts:3-11`

### 7. Cancellation Policies

When a booking is cancelled, the system:

1. Validates the state transition (booking must be in a cancellable status)
2. Calculates cancellation fee and refund amount based on:
   - The booking's `cancellation_policy_snapshot` (JSON)
   - Current time relative to booking start time
3. Creates a `booking_cancellations` record with refund details
4. Processes refund:
   - **COD/Cash:** Wallet credit (if applicable) or penalty
   - **Paid (gateway):** Processes gateway refund
   - **Unpaid:** No refund needed
5. Emits `booking:cancelled` event
6. Records audit event `BOOKING.CANCEL`

**Cancellable statuses:** `pending`, `pending_payment`, `confirmed`, `checked_in`

**Source:** `backend/src/modules/booking/domain/booking-constants.ts:1-6`, `booking.service.ts:927-1018`, `cancel-booking.command.ts:21-53`

### 8. Booking Reports

Booking reports are available via the Reports module (TECH-MOD-29). The following booking-specific reports are generated:

| Report | API | Description |
|--------|-----|-------------|
| Booking Summary | Reports module | Count by status, date range, branch |
| Revenue Report | Reports module | Total amount, commission, net per period |
| Utilisation Report | Reports module | Slot utilisation rate per resource |
| Cancellation Report | Reports module | Cancellation reasons, refund amounts |

**Evidence:** `backend/src/modules/reports/` — booking reports are generated from the `bookings` and `booking_cancellations` tables.

### 9. Background Workers

The system runs two automatic background workers that affect bookings:

| Worker | Interval | Purpose | Source |
|--------|----------|---------|--------|
| Booking Expiry Worker | Every 5 min | Expires `pending_payment` bookings past `expires_at` (3-min TTL) | `booking-expiry.worker.ts` |
| Auto-Complete Worker | Every 10 min | Completes `confirmed` bookings past their start time | `booking-auto-complete.worker.ts` |

### 10. Audit Trail

Every booking state change is recorded in the audit log:

| Action | Event | Triggered By |
|--------|-------|-------------|
| Booking Created | `BOOKING.CREATE` | User creates booking |
| Booking Cancelled | `BOOKING.CANCEL` | User or admin cancels |
| Booking Refund | `BOOKING.REFUND` | System processes refund |
| Status Update | `BOOKING.STATUS_CHANGE` | Admin updates status |
| Check-in | `BOOKING.CHECK_IN` | User checks in |
| Matchmaking Started | `BOOKING.START_MATCHMAKING` | Host starts matchmaking |
| Applicant Applied | `BOOKING.APPLY` | Player applies to join |
| Applicant Responded | `BOOKING.RESPOND_APPLICANT` | Host responds to applicant |
| Application Cancelled | `BOOKING.CANCEL_APPLICATION` | Applicant withdraws |

**Source:** `backend/src/modules/audit-log/domain/audit-log.types.ts:27-30`, `backend/src/modules/booking/presentation/booking.controller.ts:72-76, 97-104, 114-124, 147-160, 169-179, 194-203, 211-220, 229-239`

---

## Chapter: Managing Payments

### 1. Purpose

As an Organisation Admin, you can view organisation transactions, run payment reconciliation, process refunds, and configure payment gateway settings.

### 2. Prerequisites

- Required permissions:
  - `financial.reconcile` — Access reconciliation, refund, sync, expire, recover operations
  - `org.bookings.manage` — Access org bookings (for payment status updates)

### 3. Viewing Org Transactions

**Interface:** Org Finance page (`/org/finance`)

```
GET /org/:orgId/transactions
PreHandler: orgAccessGuard
Response: { data: TransactionEntry[], total, page, limit }
```

The endpoint returns transaction entries with:
- Transaction type and status
- Branch name (via LEFT JOIN branches)
- Payment method (for marketplace orders)
- Source type and ID
- Pagination (default 20 per page)

**Source:** `org-portal.routes.ts:70`, `org-portal.repository.ts:848-875` — `getOrgTransactions()` queries `transaction_entries JOIN transactions` with organisation_id filter.

### 4. Payment Reconciliation

The reconciliation system compares local payment state against the gateway (Paymob) and identifies discrepancies.

**Run reconciliation:**
```
POST /payments/reconciliation/run
Permissions: financial.reconcile
Query: dateFrom, dateTo, limit, autoFix
```

Six checks performed:

| Check | What It Detects | Severity | Auto-Fixable |
|-------|----------------|----------|-------------|
| Gateway paid → local pending | Gateway reports PAID but local is still pending/created | CRITICAL | Yes (runs recoverPayment) |
| Local paid → booking not confirmed | Payment is PAID but linked booking is not confirmed | WARNING | No |
| Wallet deducted → payment not complete | Wallet was debited but payment record is missing/incomplete | CRITICAL | No |
| Orphan payment | Payment is PAID but has no linked booking/order | WARNING | No |
| Booking confirmed → no paid payment | Booking is confirmed but no PAID payment found | INFO | No (normal for COD) |

**View reconciliation history:**
```
GET /payments/reconciliation/history?limit=20
Permissions: financial.reconcile
Response: { data: AuditLog[] }
```

Reads from `audit_logs WHERE action = 'RECONCILIATION.RUN'`.

**Source:** `reconciliation.service.ts:45-244` (run), `reconciliation.service.ts:247-257` (getHistory), `payment.controller.ts:243-253` (handlers).

### 5. Refund Processing

```
POST /payments/:id/refund
Permissions: financial.reconcile
Body: { amount: number, reason?: string }
Audit Event: PAYMENT.REFUND
```

1. Loads the payment transaction by ID
2. Calls `paymentGateway.refund()` with the gateway reference and amount
3. Emits `payment:refunded` event
4. Creates journal entry: debit 'Refund Expense', credit 'Cash'
5. Logs audit event `PAYMENT.REFUND`

**Supported:** Full and partial refunds (per `productionReadinessHandler` at `payment.controller.ts:310-313`).

**Source:** `payment.service.ts:769-796` (refund), `payment.controller.ts:59-73` (refundHandler).

### 6. Payment Sync and Recovery

**Sync pending payments:**
```
POST /payments/sync
Permissions: financial.reconcile
```
Polls Paymob for all pending payments older than 1 minute and syncs their status. Called by a scheduled cron job every ~5 minutes (`payment-cron.worker.ts:7-14`).

**Manual recovery:**
```
POST /payments/recover/:gatewayReference
Permissions: financial.reconcile
Audit Event: PAYMENT.RECOVER
```
For a specific gateway reference, queries Paymob for current status and updates local state. Used when the automated sync or webhook didn't resolve a payment.

**Expire stale payments:**
```
POST /payments/expire?timeoutMinutes=15
Permissions: financial.reconcile
```
Marks payments stuck in `created`/`pending`/`processing` beyond the timeout as `expired`. Called by a scheduled cron job every ~2 minutes (`payment-cron.worker.ts:16-24`).

**Source:** `payment.service.ts:391-431` (sync), `payment.service.ts:438-475` (recover), `payment.service.ts:802-836` (expire), `payment.controller.ts:121-146` (handlers).

### 7. Payment Gateway Configuration

Configured via environment variables on the server:

| Env Var | Description |
|---------|-------------|
| `PAYMENT_GATEWAY_PROVIDER` | `paymob` or `mock` |
| `PAYMOB_API_KEY` | Paymob API key |
| `PAYMOB_SECRET` | Paymob secret |
| `PAYMOB_HMAC_SECRET` | HMAC secret for webhook verification |
| `PAYMOB_PUBLIC_KEY` | Public key for iframes |
| `WEBHOOK_BASE_URL` | Public webhook URL (e.g., `https://api.courtzon.com/payments/webhook`) |

**Production readiness check:**
```
GET /payments/production-readiness
Permissions: financial.reconcile
```
Returns 10 checks (gateway, webhook URL, DB schema, replay protection, reconciliation, refund workflow, connectivity, migrations, metrics, audit trail) with overall status `READY` / `NOT_READY` / `NEEDS_ATTENTION`.

**Source:** `payment.controller.ts:255-361` (productionReadinessHandler), `payment.controller.ts:182-203` (healthHandler env reading).

### 8. Payment Health Dashboard

```
GET /payments/health
Permissions: financial.reconcile
```

Returns real-time payment metrics:
- Gateway provider and connectivity status
- Pending payments by status
- Stale payments (> 15 min count)
- Failed payments in last hour
- Last webhook timestamp
- 7-day success rate, failure count, refund count
- DB migration version sync status

**Source:** `payment.controller.ts:148-241` (healthHandler).

### 9. Audit Trail

| Action | Event | Triggered By |
|--------|-------|-------------|
| Payment Processed | `PAYMENT.PROCESS` | User initiates payment |
| Payment Confirmed | `PAYMENT.CONFIRM` | Confirm endpoint called |
| Refund Processed | `PAYMENT.REFUND` | Admin processes refund |
| Webhook Received | `PAYMENT.WEBHOOK` | Gateway webhook arrives |
| Payment Recovered | `PAYMENT.RECOVER` | Admin recovers payment |
| Reconciliation Run | `RECONCILIATION.RUN` | Reconciliation executed |

**Source:** `payment.controller.ts:16-31, 37-46, 63-73, 84-92, 136-146`.

---

## Chapter: Managing Organisation Profile

### 1. Purpose

As an Organisation Admin, you can update your organisation's public profile through the Org Settings page (`/org/:orgId/settings`) or the Club Profile page (`/org/:orgId/profile`).

### 2. Org Info (Self-Service)

**Interface:** Org Settings → General tab (`/org/:orgId/settings`)

The self-service endpoint `PUT /org/:orgId/info` allows you to update:
- `name`, `description`, `slug`
- `email`, `phone`, `website`
- `logoUrl`, `coverUrl`
- `countryId`, `taxId`, `taxIdType`, `crNumber`

**Restricted fields (cannot be set via self-service):** `isVerified`, `isActive`, `ownerId` — these can only be set by super admin via the admin API.

**API:** `PUT /org/:orgId/info` — `updateOrgInfoHandler`
- Strips protected fields from the request body
- Delegates to `organisationService.updateOrganisation()`
- Records `ORGANISATION.UPDATE` audit event

**Source:** `org-portal.controller.ts:89-98`, `organisation.service.ts:251-278`.

### 3. Club Profile

**Interface:** Org Profile page (`/org/:orgId/profile`)

The profile endpoint allows editing a subset of org fields directly from SQL:
- `name`, `description`, `email`, `phone`, `website`

**API:** `PUT /org/:orgId/profile` — `updateClubProfileHandler`
- Dynamic field builder (only provided fields are updated)
- Records `ORG_PROFILE.UPDATE` audit event

**Source:** `org-portal.controller.ts:693-714`.

---

## Chapter: Managing Branches

### 1. Creating a Branch

**Interface:** Branch creation via admin API (`POST /branches`) or org portal (`POST /org/:orgId/branches`)

**Required fields:** `name`, `organisationId` (org portal auto-sets from URL)
**Optional fields:** `slug`, `description`, `email`, `phone`, `addressLine1`, `addressLine2`, `city`, `state`, `countryId`, `postalCode`, `latitude`, `longitude`, `accessType`, `openingTime`, `closingTime`, `timezone`, `images`

**Plan limit enforcement:** Before creation, the system checks `getPlanNumericLimit(orgId, 'branches', 1)`. If the org already has ≥ N branches, the request is rejected with: "Branch limit reached (max N). Upgrade your plan to add more branches."

**Source:** `organisation.service.ts:355-371` — `createBranch()`. Route: `POST /org/:orgId/branches` — `createOrgBranchHandler`.

### 2. Updating a Branch

**Interface:** `PUT /org/:orgId/branches/:branchId` — `updateOrgBranchHandler`

- Validates branch belongs to the org (`branchBelongsToOrg` check)
- Validates user has branch access (`assertUserBranchAccess`)
- Updates provided fields only (partial update via `CreateBranchSchema.omit({...}).partial()`)
- If `isActive` is set, also deactivates all resources via `resourceRepository.setActiveByBranch()`

**Source:** `org-portal.controller.ts:120-133`, `organisation.service.ts:373-380`.

### 3. Deleting a Branch

**Interface:** `DELETE /org/:orgId/branches/:branchId` — `deleteOrgBranchHandler`

Cascade effects:
1. All pending `branch_player_access` records are rejected
2. All resources under the branch are soft-deleted (`deleted_at = NOW()`, `is_active = 0`)
3. All cancellable bookings are auto-cancelled via the CancelBooking command
4. The branch row is soft-deleted

**Source:** `organisation.service.ts:383-430` — `deleteBranch()`.

### 4. Branch Financial Details

**Interface:** `GET/PUT /org/:orgId/branches/:branchId/financial-details`

Stores bank account and tax information per branch for settlement payouts:
- `accountHolderName`, `accountNumber`, `bankName`, `iban`, `swiftCode`, `taxId`

**Source:** `org-portal.controller.ts:149-171`, `organisation.service.ts:280-297`.

### 5. Branch Amenities

**Interface:** `GET /branches/:id/amenities`, `PUT /branches/:id/amenities`

Assign amenities to a branch (e.g., parking, showers, equipment rental). Amenities are predefined in the `amenities` table.

**Source:** `organisation.service.ts:541-548`.

---

## Chapter: Managing Resources/Courts

### 1. Creating a Resource

**Interface:** `POST /org/:orgId/resources` — `createOrgResourceHandler`

**Required:** `branchId`, `resourceTypeId`, `name`
**Optional:** `sportId`, `description`, `capacity`, `hourlyPrice`, `pricingType`, `peakHourValue`, `images`, `slotDuration`, `openingTime`, `closingTime`, `attributes`, `peakHours`

**Plan limit enforcement:** Before creation, the system counts total resources across all branches of the org and checks `getPlanNumericLimit(orgId, 'resources', Infinity)`.

**Source:** `organisation.service.ts:442-472`.

### 2. Updating a Resource

**Interface:** `PUT /org/:orgId/resources/:resourceId` — `updateOrgResourceHandler`

- Validates resource belongs to the org (`resourceBelongsToOrg`)
- Validates user has branch access
- Updates provided fields; supports `attributes` (EAV) and `peakHours` writes

**Source:** `organisation.service.ts:474-482`, `org-portal.controller.ts:188-204`.

### 3. Deleting a Resource

**Interface:** `DELETE /org/:orgId/resources/:resourceId` — `deleteOrgResourceHandler`

Cascade effects:
1. All cancellable bookings for this resource are auto-cancelled
2. `is_active` set to 0
3. Soft-deleted (`deleted_at = NOW()`)

**Source:** `organisation.service.ts:484-526`.

### 4. Resource Maintenance

**Interface:** `GET/POST/PUT/DELETE /resources/:resourceId/maintenance`

Schedule maintenance periods for specific resources. Maintenance periods block booking availability.

### 5. Resource Peak Hours

**Interface:** `PUT /resources/:resourceId/peak-hours` — `upsertResourcePeakHoursHandler`

Define peak hour time ranges and override pricing. Stored as JSON.

---

## Chapter: Managing Staff

### 1. Viewing Staff

**Interface:** Org Staff page (`/org/:orgId/staff`) — `listOrgStaffHandler`

Returns staff list with:
- User details (name, email, avatar)
- Role (org-admin, branch-mgr, resource-mgr, shop-admin, coach, accountant)
- Branch and resource scopes (which branches/resources the staff member can manage)
- Assigned at timestamp
- Whether the user is the org owner

**Source:** `org-portal.repository.ts:170-201`.

### 2. Adding Staff

**Interface:** Add Staff modal in Org Staff page — `addOrgStaffHandler`

1. Enter the user's email (must be a registered user)
2. Select a role from: Org Admin, Branch Manager, Resource Manager, Shop Admin, Coach, Accountant
3. Optionally scope to specific branches and/or resources
4. Optionally override permissions (by permission IDs)
5. Click "Add Staff"

**Plan limit enforcement:** If staff count ≥ plan limit (default 3), the mutation shows an upgrade prompt.

**On the backend:**
1. Resolves the role template (must be an assignable org role)
2. Validates branch/resource IDs belong to the org
3. Finds the user by email
4. Checks staff limit
5. Clones the template role for the org via `rbacRepository.cloneRoleForOrg()`
6. Creates `user_roles` + `user_role_scopes` (organisation, branch, resource scopes)

**Source:** `org-portal.service.ts:19-63`.

### 3. Changing Staff Role

**Interface:** Edit Staff modal — `changeOrgStaffRoleHandler`

- Can modify role, branch scopes, and resource scopes
- Cannot modify the org owner (owner has full access)
- The old role is removed, new role is assigned (scopes recreated)

**Source:** `org-portal.service.ts:65-94`.

### 4. Managing Permissions

**Interface:** Staff Permissions tab in Edit Staff modal

- `GET /org/:orgId/staff/:userId/permissions` — Returns current permissions + template permissions for reference
- `PUT /org/:orgId/staff/:userId/permissions` — Override staff member's permissions

**Source:** `org-portal.service.ts:96-128`.

### 5. Removing Staff

**Interface:** Delete button in Staff page — `removeOrgStaffHandler`

- Cannot remove the org owner
- Deletes all `user_role_scopes` for this org/user combination
- Deactivates the `user_role` if no remaining scopes exist

**Source:** `org-portal.repository.ts:322-360`.

---

## Chapter: Managing Members

### 1. Viewing Members

**Interface:** Org Members page (`/org/:orgId/members`) — `listOrgMembersHandler`

Lists all `branch_player_access` records for the org with filters:
- Filter by branch
- Filter by status (pending, approved, rejected, banned)

**Data returned:** Player name, email, branch name, status, review note, reviewed at timestamp.

**Source:** `org-portal.service.ts:470-475`.

### 2. Approving/Rejecting/Banning Members

**Interface:** Status update buttons in Members page — `updateOrgMemberAccessHandler`

- `PUT /org/:orgId/members/:branchId/:playerId` with `{ status, note? }`
- Transition: `pending → approved` | `pending → rejected` | `approved → banned`
- Records `BRANCH_ACCESS.UPDATE_STATUS` audit event

**Permission:** `org.members.manage`

**Source:** `org-portal.controller.ts:336-346`, `org-portal.service.ts:477-489`.

---

## Chapter: Managing Coaches

### 1. Viewing Coaches

**Interface:** Org Coaches page (`/org/:orgId/coaches`) — `listOrgCoachesHandler`

Returns all coach agreements for the org with:
- Coach name, email, rating
- Revenue split: coach_split_pct / org_split_pct
- Hourly rate (if configured)
- Status badge (accepted ✓, pending ⏳, rejected ✗)

**Source:** `org-portal.repository.ts:365-380`.

### 2. Inviting a Coach

**Interface:** Invite Coach modal — `inviteCoachHandler`

1. Coach directory lists approved coaches not yet linked to this org
2. Set revenue split percentages (must sum to 100%)
3. Optionally set hourly rate
4. System creates `coach_org_agreements` with `status = 'pending'`, `initiated_by = 'org'`
5. Emits `coach:invited` event for notification

**Source:** `org-portal.service.ts:292-312`.

### 3. Responding to Coach Requests

**Interface:** Accept/Reject buttons — `respondOrgCoachHandler`

When a coach initiates an agreement with your org, you can accept or reject it:
- `PUT /org/:orgId/coaches/:coachId/respond` with `{ accept: true/false }`
- Accept: status → `accepted`, `is_active = true`
- Reject: status → `rejected`, `is_active = false`

**Source:** `org-portal.service.ts:314-317`.

### 4. Removing a Coach

**Interface:** Delete button — `removeOrgCoachHandler`

Permanently removes the agreement. A new invite can be sent after removal.

**Source:** `org-portal.service.ts:319-322`.

---

## Chapter: Managing Subscription

### 1. Viewing Current Subscription

**Interface:** Org Subscription page (`/org/:orgId/subscription`) — `getOrgSubscriptionHandler`

Shows:
- Current plan name and pricing
- Billing cycle (monthly/yearly)
- Feature usage bars (branches used N/M, staff used N/M, etc.)
- Status badge (active, pending, expired, none)
- Start date, end date
- Auto-renew status
- Pending upgrade requests

**Source:** `org-portal.service.ts:140-184`.

### 2. Upgrading/Downgrading

**Interface:** SubscriptionRequestModal — `submitSubscriptionRequestHandler`

1. Click "Change Plan" or "Get Started" (when no plan)
2. Browse available plans from `GET /org/:orgId/subscription/available-plans`
3. Select a plan and choose `NEW_SUBSCRIPTION` or `PLAN_CHANGE`
4. Submit request
5. Request appears in the pending requests section
6. A super admin reviews and approves/rejects from the admin panel

**Restrictions:**
- Cannot submit a new request while one is pending
- Cannot request the same plan the org is already on
- Requested plan must be active

**Source:** `org-portal.service.ts:199-269`.

### 3. Viewing Request History

**Interface:** Subscription history section — `listOrgSubscriptionRequestsHandler`

Lists all past requests with status, timestamps, and admin review notes.

**Source:** `org-portal.repository.ts:766-781`.

---

## Chapter: Managing Cancellation Policies

### 1. Org-Level Settings

**Interface:** Cancellation Settings — `GET/PUT /org/:orgId/cancellation-settings`

Configure:
- `policyLevel` — `'organisation'` (one policy for all branches) or `'branch'` (per-branch policies)
- `cancellationBeforeHours` — hours before booking start for fee-free cancellation
- `cancellationFeePercentage` — percentage charged on late cancellation
- `cancellationFeeFixed` — fixed fee charged on late cancellation

**Source:** `org-portal.controller.ts:348-373`.

### 2. Per-Branch Policies

**Interface:** `GET/POST/PUT/DELETE /org/:orgId/branches/:branchId/cancellation-policies`

Each policy has:
- `cancellationWindowMinutes` — time window before start for valid cancellation
- `refundPercent` — percentage refunded
- `isActive` — soft toggle

**Source:** `cancellation-policy.repository.ts:7-98`, `organisation.routes.ts:100-107`.

---

## Chapter: Managing Working Hours

### 1. Viewing All Hours

**Interface:** Org Working Hours page (`/org/:orgId/working-hours`) — `getOrgWorkingHoursHandler`

Returns all branches with:
- Branch opening/closing times and timezone
- Holidays list per branch
- Resources per branch with individual opening/closing times

**Source:** `org-portal.controller.ts:771-793`.

### 2. Updating Branch Hours

**Interface:** `PUT /org/:orgId/branches/:branchId/hours` — `updateBranchHoursHandler`

Update:
- Branch-level `openingTime` / `closingTime`
- Per-resource hours via `resourceHours[]` (each has `resourceId`, `openingTime`, `closingTime`)

**Permission:** `org.branches.manage`

**Source:** `org-portal.controller.ts:795-821`.

### 3. Managing Holidays

**Interface:** Holiday CRUD via admin API
- `GET /branches/:branchId/holidays`
- `POST /branches/:branchId/holidays` — create holiday for a branch
- `PUT /branches/holidays/:id` — update holiday
- `DELETE /branches/holidays/:id` — delete holiday

Holidays have: name, date_from, date_to, is_recurring, is_open_modified, open_time, close_time.

**Source:** `organisation.service.ts:1090-1105`, `organisation.routes.ts:109-113`.

---

## Chapter: Managing Organisation Settings

### 1. General Settings Tab

**Interface:** `/org/:orgId/settings` → General tab

Contains:
- **Subscription Card** — quick view of current plan and plan status
- **OrganisationForm** — edit org name, description, email, phone, website, logo, cover image, address fields

### 2. Shipping Rates Tab

**Interface:** `/org/:orgId/settings` → Shipping Rates tab (permission-gated)

Manage marketplace shipping rates for products sold by the organisation.

**Permission:** `org.settings.shipping-rates-tab`

### 3. Payment Settings

**Interface:** `/org/:orgId/payment-settings`

Configure per-branch financial details for settlement payouts:
- Account holder name, account number, bank name, IBAN, SWIFT code, tax ID

**Permission:** `org.settings.edit`

**Source:** `org-portal.controller.ts:825-863`.

**Evidence:** All source files verified against `backend/src/modules/organisations/presentation/`, `backend/src/modules/organisations/application/`, `frontend/src/pages/org/`, `frontend/src/components/organisations/`.

---

## Chapter: Managing Products (Marketplace)

### 1. Purpose

As an Organisation Admin, you can create, update, delete, and manage product listings in the marketplace. Products can have variants, images, specifications, and be organized by categories, brands, and tags.

### 2. Prerequisites

- Organisation must have an approved seller status
- Required permissions:
  - `marketplace.sell` — Create/update/delete products
  - `marketplace.moderate` — Admin-level product management (super admin)

### 3. Creating a Product

**Interface:** Seller Dashboard → Products tab — click **Add Product**

The SellerProductFormModal collects:
- **Basic info:** Name, description, price, discounted price
- **Category, Brand, Sport, Tags** — dropdown selects
- **Gender** filter option
- **Images** — uploaded via media manager
- **Video URL** (optional)
- **Variants** — size/color/other with name, price adjustment, stock, SKU
- **Stock** — initial quantity, min/max stock levels

### 4. Managing Products

**Interface:** Seller Dashboard → Products tab

- **List:** Products displayed in a grid with name, category, price, status badge
- **Filter:** By status (All, Active, Pending) and by branch
- **Edit:** Click "Edit" to open the product form with existing data
- **Delete:** Click "Delete" to remove a product (with confirmation toast)
- **Status:** Products go through `draft → pending → active` lifecycle. Admin approval needed for pending products.

### 5. Admin Product Management

Super admins have additional capabilities:

**Interface:** Admin marketplace routes

| Action | Endpoint | Permission |
|--------|----------|------------|
| List all products | `GET /marketplace/admin/products` | `marketplace.moderate` |
| Update product status | `PUT /marketplace/admin/products/:id/status` | `marketplace.moderate` |
| Update product | `PUT /marketplace/admin/products/:id` | `marketplace.moderate` |
| Delete product | `DELETE /marketplace/admin/products/:id` | `marketplace.moderate` |

### 6. Managing Categories, Brands, Tags

Categories, brands, and tags are managed via admin routes:

| Entity | Create | Update | Delete |
|--------|--------|--------|--------|
| Categories | Admin routes | Admin routes | Admin routes |
| Brands | Admin routes (`admin-brand.routes.ts`) | Admin routes | Admin routes |
| Tags | Admin routes (`admin-tag.routes.ts`) | Admin routes | Admin routes |

**API Reference:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/marketplace/categories` | GET | List all categories |
| `/marketplace/brands` | GET | List all brands |
| `/marketplace/tags` | GET | List all tags |
| `/marketplace/admin/products` | GET | Admin list all products |
| `/marketplace/admin/products/:id/status` | PUT | Update product status (approve/reject) |

**Source:** `marketplace.routes.ts:104-131` (admin routes), `SellerDashboardPage.tsx:246-309` (seller product management).

---

## Chapter: Managing Orders (Marketplace)

### 1. Viewing Orders

As a seller, view your orders under Seller Dashboard → Orders tab.

**Filter:** By status (All, Pending, Confirmed, Processing, Shipped, Delivered, Cancelled)

Each order shows:
- Order ID (truncated public ID), date, buyer name and phone
- Items with images, product name, variant, quantity, total
- Subtotal, shipping cost, total footer
- Status badge with color coding

### 2. Order Status Transitions (Seller)

| From | To | Action |
|------|----|--------|
| `confirmed` | `processing` | Click **Start Processing** |
| `processing` | `shipped` | Click **Mark Shipped** (auto-generates tracking number) |

### 3. Admin Order Management

Super admins can view and manage all marketplace orders:

| Action | Endpoint | Permission |
|--------|----------|------------|
| List all orders | `GET /marketplace/admin/orders` | `marketplace.moderate` |
| Get order detail | `GET /marketplace/admin/orders/:id` | `marketplace.moderate` |

Admin can perform any valid transition per the state machine in `order-aggregate.ts`.

### 4. Order State Machine

```
pending → confirmed → processing → shipped → delivered → cancelled | refunded
```

See TECH-ARCH-17 for the full transition matrix by role.

### 5. API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/marketplace/seller/orders` | GET | List seller's orders |
| `/marketplace/seller/stats` | GET | Get seller order statistics |
| `/marketplace/orders/:id/status` | PUT | Update order status |
| `/marketplace/admin/orders` | GET | Admin list all orders |
| `/marketplace/admin/orders/:id` | GET | Admin get order detail |

**Source:** `marketplace.routes.ts:68-69` (seller orders), `:112-114` (admin orders), `SellerDashboardPage.tsx:312-402`.

---

## Chapter: Managing Inventory

### 1. Managing Warehouses

**Interface:** Admin inventory routes

| Action | Endpoint | Permission |
|--------|----------|------------|
| List warehouses | `GET /admin/warehouses` | `inventory.warehouses.view` |
| Create warehouse | `POST /admin/warehouses` | `inventory.warehouses.manage` |
| Update warehouse | `PUT /admin/warehouses/:id` | `inventory.warehouses.manage` |
| Delete warehouse | `DELETE /admin/warehouses/:id` | `inventory.warehouses.manage` |

Warehouses are per-organisation physical stock locations.

### 2. Managing Suppliers

| Action | Endpoint | Permission |
|--------|----------|------------|
| List suppliers | `GET /admin/suppliers` | `inventory.suppliers.view` |
| Create supplier | `POST /admin/suppliers` | `inventory.suppliers.manage` |
| Update supplier | `PUT /admin/suppliers/:id` | `inventory.suppliers.manage` |
| Delete supplier | `DELETE /admin/suppliers/:id` | `inventory.suppliers.manage` |

Suppliers have: name, contact, email, phone, payment terms, lead time.

### 3. Managing Purchase Orders

**5-State Lifecycle:** `draft → submitted → approved → received → [terminal]`

| Action | Endpoint | Permission |
|--------|----------|------------|
| List POs | `GET /admin/purchase-orders` | `inventory.purchase-orders.view` |
| Create PO | `POST /admin/purchase-orders` | `inventory.purchase-orders.manage` |
| Get PO | `GET /admin/purchase-orders/:id` | `inventory.purchase-orders.view` |
| Update PO | `PUT /admin/purchase-orders/:id` | `inventory.purchase-orders.manage` (draft only) |
| Submit PO | `POST /admin/purchase-orders/:id/submit` | `inventory.purchase-orders.manage` |
| Approve PO | `POST /admin/purchase-orders/:id/approve` | `inventory.purchase-orders.manage` |
| Receive PO | `POST /admin/purchase-orders/:id/receive` | `inventory.purchase-orders.manage` |
| Cancel PO | `POST /admin/purchase-orders/:id/cancel` | `inventory.purchase-orders.manage` |

On **Receive**, stock is added to the warehouse, `inventory_logs` entry created with before/after snapshots.

### 4. Managing Stock Transfers

| Action | Endpoint | Permission |
|--------|----------|------------|
| Create transfer | `POST /admin/stock-transfers` | `inventory.stock.manage` |
| List transfers | `GET /admin/stock-transfers` | `inventory.stock.view` |
| Complete transfer | `POST /admin/stock-transfers/:id/complete` | `inventory.stock.manage` |

Transfers move stock between warehouses within the same organisation.

### 5. Stock Adjustment

| Action | Endpoint | Permission |
|--------|----------|------------|
| Adjust stock | `PUT /admin/inventory/variants/:variantId/stock` | `inventory.stock.manage` |

Manual correction with reason; creates `inventory_logs` adjustment entry.

### 6. Viewing Inventory Logs

| Action | Endpoint | Permission |
|--------|----------|------------|
| View logs | `GET /admin/inventory/logs` | `inventory.stock.view` |

Complete audit trail of all stock movements. Filter by variant, warehouse, movement type, date range.

### 7. Stock Fields on Product Variants

Each product variant tracks:
- `quantity` — Current available stock
- `cost_price` — Cost per unit for margin calculation
- `min_stock_level` — Low-stock alert threshold
- `max_stock_level` — Reorder point

**Source:** `inventory.routes.ts:8-39`, `inventory.controller.ts` (642 lines), `database/migrations/067_marketplace_inventory.sql`.

---

## Chapter: Viewing Sales Reports

### 1. Seller Dashboard Stats

**Interface:** Seller Dashboard → Stats tab

Key metrics displayed:
- **Total Orders** — All orders containing this seller's products
- **Completed** — Delivered orders
- **Revenue** — Sum of product sales
- **Commission** — Total platform commission
- **Pending Orders** — Orders awaiting processing
- **Active Listings** — Currently active products

### 2. API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/marketplace/seller/stats` | GET | Get seller dashboard statistics |

**Source:** `marketplace.routes.ts:70`, `SellerDashboardPage.tsx:49-53`.

---

## Chapter: Managing Settlements

### 1. View Settlement Balance

**Interface:** Seller Dashboard → Settlements tab

Shows:
- **Available Balance** — Funds available for settlement (total delivered revenue minus pending settlements)
- **Pending Settlement** — Amount currently in settlement process

### 2. Requesting Settlement

1. Click **Request Settlement**
2. System calculates gross amount, commission, shipping, and net
3. Settlement enters the lifecycle: `pending_approval → approved → paid → completed`
4. Admin reviews and processes the settlement via the Settlement module

### 3. Settlement History

List of past settlements with:
- Amount, date requested, status badge
- Fee and net amount breakdown
- Statuses: requested, pending_approval, approved, paid, completed, rejected, cancelled

### 4. Permissions

| Permission | Purpose |
|------------|---------|
| `marketplace.seller.settlements` | View settlement tab and history |
| `marketplace.seller.request-settlement` | Submit settlement requests |

**Source:** `marketplace.routes.ts:91-94`, `SellerDashboardPage.tsx:405-468`.

---

## Chapter: Managing Shipping Rates

### 1. Purpose

As an Organisation Admin, you can set shipping rates per province and city for products sold through the marketplace.

### 2. Managing Shipping Rates

**Interface:** Org Settings → Shipping Rates tab (permission-gated)

| Action | Endpoint | Permission |
|--------|----------|------------|
| List rates | `GET /marketplace/seller/shipping-rates` | `marketplace.sell` |
| Create rate | `POST /marketplace/seller/shipping-rates` | `marketplace.sell` |
| Update rate | `PUT /marketplace/seller/shipping-rates/:id` | `marketplace.sell` |
| Delete rate | `PUT /marketplace/seller/shipping-rates/:id` | `marketplace.sell` |

### 3. Rate Structure

Each shipping rate has:
- `province_id` — FK to provinces
- `city_id` — FK to cities (NULL = province-wide rate)
- `rate` — Shipping cost amount

### 4. How Shipping Works at Checkout

1. Buyer selects a shipping address
2. `POST /marketplace/cart/check-shipping` validates per-seller availability
3. For each seller with items in the cart, the system looks up the matching rate by province/city
4. If a rate exists: available with shipping cost; if not: unavailable (item greyed out)
5. If any seller cannot ship, the Place Order button is disabled

**Source:** `marketplace.routes.ts:43-49`, `OrganisationSettingsPage` (shipping rates tab), `CartPage.tsx:157-162` (shipping check).

---

## Chapter: Managing Academy Programs

### 1. Purpose

As an Organisation Admin, you can manage academy programs, groups, enrollments, sessions, and attendance. The academy system supports full lifecycle management from program creation through attendance tracking.

### 2. Prerequisites

- Required permissions:
  - `academy.programs.*` — Manage programs (CRUD + status transitions)
  - `academy.groups.*` — Manage groups (CRUD + coach assignment)
  - `academy.enrollments.*` — Manage enrollments (CRUD + status transitions)
  - `academy.sessions.*` — Manage group sessions
  - `academy.attendance.*` — Record and view attendance

### 3. Academy Dashboard

**Interface:** Academy Dashboard (`/admin/academy/dashboard`)

Shows aggregate KPIs:
- Total programs, published programs, running programs
- Total groups and enrolled players
- Waiting list count
- Capacity utilization percentage
- Attendance summary (present, absent, excused, late)

**API:** `GET /admin/academy/dashboard` (permission: `academy.dashboard.view`)

**Source:** `program.service.ts:78-91`, `program.repository.ts` dashboard query.

### 4. Managing Programs

**Interface:** AcademyProgramsPage (`/admin/academy/programs`)

**Creating a Program:**

1. Click **Add Program** to open the create modal
2. Fill in:
   - `code` — Unique program code (required)
   - `name` — Display name (required)
   - `category` — Classification (required)
   - `level`, `season` — Optional filters
   - `capacity` — Max enrollments (0 = unlimited)
   - `price`, `currency`, `price_type` — Pricing (FREE, FIXED, MEMBERS_ONLY)
   - `is_public` — Visibility toggle
3. Click **Save** — program is created with `status: 'draft'`

**Updating a Program:**

- Edit any field except status through the edit modal
- Code uniqueness is enforced (409 Conflict on duplicate)

**Status Transitions:**

| Action | Transition | Endpoint |
|--------|-----------|----------|
| Publish | draft → published | `POST /admin/academy/programs/:id/publish` |
| Archive | any → archived | `POST /admin/academy/programs/:id/archive` |
| Custom Transition | any valid transition | `POST /admin/academy/programs/:id/transition` with `{ status }` |

Valid transitions per `domain/lifecycle.ts:5-14`:
- `draft → published`
- `published → open | cancelled | archived`
- `open → full | running | cancelled | archived`
- `full → open | running | cancelled | archived`
- `running → completed | cancelled | archived`
- `completed → archived`
- `cancelled → archived`

**Source:** `program.service.ts:44-72`, `lifecycle.ts:24-33`.

### 5. Managing Groups

**Interface:** AcademyGroupsPage (`/admin/academy/groups`)

Groups are class divisions within a program. Each group has independent capacity.

**Creating a Group:**
1. Select a program
2. Set group name, optional coach, capacity
3. Status: active (default), inactive, or archived

**Assigning a Coach:**

`POST /admin/academy/groups/:id/assign-coach` with `{ coach_id: number | null }`

- Validates coach exists as a user
- Set `null` to unassign

**Archiving a Group:**

`POST /admin/academy/groups/:id/archive` — sets status to `archived`

**Source:** `group.service.ts:39-55`.

### 6. Managing Enrollments

**Interface:** AcademyEnrollmentsPage (`/admin/academy/enrollments`)

**Creating an Enrollment:**

1. Select player, program, optional group and membership
2. System auto-assigns status:
   - `confirmed` if program has capacity
   - `waiting` if program is full (auto-incremented `waiting_order`)
3. Group capacity is also validated — if group is full, the enrollment to that group is rejected

**Enrollment Status Transitions:**

| Action | Valid From | Endpoint |
|--------|-----------|----------|
| Confirm | pending, waiting | `POST /admin/academy/enrollments/:id/confirm` |
| Cancel | pending, confirmed, waiting | `POST /admin/academy/enrollments/:id/cancel` |
| Complete | confirmed | `POST /admin/academy/enrollments/:id/complete` |

**Waiting List Auto-Promotion:**

When an enrollment is confirmed, the system does NOT auto-promote from waiting list (by design — admin must manage manually).

**Moving to Another Group:**

`POST /admin/academy/enrollments/:id/move` with `{ group_id }`

- Validates target group exists and has capacity
- Group must not be archived

**Viewing Enrollment History:**

`GET /admin/academy/enrollments/:id/history` — returns audit log entries for this enrollment.

**Source:** `enrollment.service.ts:1-109`, `lifecycle.ts:35-44`.

### 7. Managing Sessions

**Interface:** Group sessions via academy routes

Sessions are scheduled class meetings for a group.

**Creating a Session:**

`POST /admin/academy/sessions` with:
- `group_id` (required)
- `session_date` (YYYY-MM-DD, required)
- `start_time`, `end_time` (optional)
- `court_id` (optional, FK to resources)
- `coach_id` (optional, FK to users)
- `status` (default: scheduled)

**Session Statuses:** `scheduled → in_progress → completed | cancelled`

**Source:** `CreateGroupSessionSchema`, `UpdateGroupSessionSchema` at `academy.dto.ts:100-117`.

### 8. Recording Attendance

**Interface:** AcademyAttendancePage (`/admin/academy/attendance`)

**Recording Attendance:**

`POST /admin/academy/attendance` with:
- `group_session_id` (required)
- `enrollment_id` (required)
- `attendance_status` — `present` (default), `absent`, `excused`, `late`
- `notes` (optional)

**Bulk Recording:**

`POST /admin/academy/attendance/bulk` with:
```json
{
  "records": [
    { "enrollment_id": 1, "attendance_status": "present" },
    { "enrollment_id": 2, "attendance_status": "absent", "notes": "Sick" }
  ]
}
```

**Duplicate Protection:** Each enrollment can have only one attendance record per session (unique constraint on `group_session_id + enrollment_id`). Duplicates are silently skipped in bulk mode.

**Viewing Attendance Summary:**

`GET /admin/academy/attendance/summary?group_session_id=N` — returns counts per status.

**Source:** `attendance.service.ts:1-66`, `attendance.repository.ts`.

---

## Chapter: Managing Tournaments

### 1. Purpose

As an Organisation Admin, you can create and manage tournaments with multiple formats, registration, bracket generation, match scheduling, result recording, and standings calculation.

### 2. Prerequisites

- Required permissions:
  - `tournament.create` — Create tournaments
  - `tournament.view` — View tournaments
  - `tournament.update` — Update tournament settings
  - `tournament.publish` — Publish tournament
  - `tournament.manage` — Manage registrations, generate brackets, record results
  - `tournament.delete` — Archive tournament

### 3. Tournament Dashboard

**Interface:** TournamentDashboardPage (`/admin/tournaments`)

KPI cards:
- Total tournaments, published, registration open, running, completed, cancelled

**API:** `GET /admin/tournaments/dashboard` (permission: `tournament.dashboard.view`)

### 4. Creating a Tournament

**Interface:** Create tournament form (TournamentDetailPage or modal)

1. Fill in:
   - `code` — Unique code (required)
   - `name` — Display name (required)
   - `sport_id` — Associated sport (required)
   - `format` — `knockout`, `double_elimination`, `round_robin`, `swiss`, `group_stage_knockout`, `league`, `custom`
   - `registration_type` — `individual`, `team`, `academy`, `invitation`, `public`
   - `max_players`, `max_teams` — Capacity limits
   - `registration_fee`, `currency`, `price_type` — Pricing
   - `registration_open_at`, `registration_close_at` — Registration window
   - `start_date`, `end_date` — Tournament dates
   - `match_duration_minutes` — Per-match time limit
   - `rules`, `prize_description` — Text fields
   - `is_public` — Visibility toggle
   - `organisation_id`, `branch_id` — Org association (optional)
2. Tournament is created with `status: 'draft'`

### 5. Tournament Status Management

**Status Flow:**

```
draft → published → registration_open → registration_closed → running → completed → archived
                                                              ↘ cancelled ↗
```

| Action | Endpoint | Permission |
|--------|----------|------------|
| Publish | `POST /admin/tournaments/:id/publish` | `tournament.publish` |
| Open Registration | `POST /admin/tournaments/:id/open-reg` | `tournament.update` |
| Close Registration | `POST /admin/tournaments/:id/close-reg` | `tournament.update` |
| Start | `POST /admin/tournaments/:id/start` | `tournament.manage` |
| Complete | `POST /admin/tournaments/:id/complete` | `tournament.manage` |
| Cancel | `POST /admin/tournaments/:id/cancel` | `tournament.manage` |
| Archive | `POST /admin/tournaments/:id/archive` | `tournament.delete` |

All transitions validated by `validateTournamentTransition()` at `lifecycle.ts:24-33`.

### 6. Managing Registrations

**Viewing Registrations:**

`GET /admin/tournaments/:id/registrations` — lists all registrations with status, seed, user info.

**Registering a Player:**

`POST /admin/tournaments/:id/register` with `{ user_id, team_id? }`

- Checks tournament must be in `registration_open` or `published` status
- Prevents duplicate registrations
- If capacity full: status = `waiting`, auto-incremented `waiting_order`

**Confirming a Registration:**

`POST /admin/tournaments/:id/registrations/:regId/confirm`

- Validates registration status allows confirmation (pending → confirmed, waiting → confirmed)
- Auto-promotes next waiting registration if capacity allows

**Cancelling a Registration:**

`POST /admin/tournaments/:id/registrations/:regId/cancel`

### 7. Generating Groups & Fixtures

**Group Stage Generation:**

`POST /admin/tournaments/:id/generate-groups` with `{ group_size, advance_count }`

- Shuffles confirmed registrations randomly
- Divides into groups named A, B, C...
- Each group has `advance_count` specifying how many proceed to knockout

**Fixture Generation (Round-Robin within Groups):**

`POST /admin/tournaments/:id/generate-fixtures`

- For each group, generates round-robin matches between all group members
- Each pair plays once
- Matches created with `status: 'scheduled'`

**Bracket Generation:**

`POST /admin/tournaments/:id/generate-bracket`

- Format-specific generation:
  - `knockout`: Power-of-2 bracket with byes via `generateKnockoutBracket()`
  - `round_robin`: All-pairs via `generateRoundRobinMatches()`
  - `group_stage_knockout`: Groups first (round-robin), then knockout

**Source:** `tournament.service.ts:130-223`.

### 8. Managing Matches

**Viewing Matches:**

`GET /admin/tournaments/:id/matches` — all matches with round, participants, status, scores.

**Recording a Result:**

`POST /admin/tournaments/matches/:matchId/result` with `{ winner_id, home_score?, away_score?, score_details? }`

1. Creates `tournament_match_results` record
2. Updates match status to `completed`, sets winner_id
3. Triggers `recalculateStandings()` for the tournament/group
4. Emits `match.result.recorded` event

**Assigning a Court:**

`POST /admin/tournaments/matches/:matchId/assign-court` with `{ resource_id }`

**Assigning a Referee:**

`POST /admin/tournaments/matches/:matchId/assign-referee` with `{ referee_id }`

### 9. Standings

**Viewing Standings:**

`GET /admin/tournaments/:id/standings?group_id=N` — ranked by points (3 per win), then GD, then GF.

**Recalculating Standings:**

`POST /admin/tournaments/:id/recalculate-standings`

Triggered automatically after every result recording. Manual recalculation available for data repair.

**Source:** `tournament.service.ts:225-264`, `domain/tournament-aggregate.ts:172-209`.

---

## Chapter: Managing Leagues

### 1. Purpose

As an Organisation Admin, you can manage seasonal leagues with tiered divisions, team registration, round-robin fixture generation, match results, standings, player/team statistics, and promotion/relegation.

### 2. Prerequisites

- Required permissions:
  - `season.*` — Manage seasons (CRUD + status)
  - `league.*` — Manage leagues (CRUD + status)
  - `league.divisions.*` — Manage divisions (CRUD + promote/relegate)
  - `league.teams.*` — Manage team registrations
  - `league.fixtures.*` — Generate and view fixtures
  - `league.matches.*` — Manage match results, court/referee
  - `league.standings.*` — View and recalculate standings
  - `league.statistics.*` — View and recalculate player/team stats

### 3. Season Management

**Interface:** SeasonListPage (`/admin/seasons`)

Seasons are the top-level container for leagues.

**Creating a Season:**

1. Set `code` (unique), `name`, optional `description` and `sport_id`
2. Set `start_date` (required) and optional `end_date`
3. Season created with `status: 'draft'`

**Season Status Transitions:**

| Action | Transition | Endpoint |
|--------|-----------|----------|
| Publish | draft → published | `POST /admin/seasons/:id/publish` |
| Archive | completed → archived | `POST /admin/seasons/:id/archive` |

**Season Lifecycle:** `draft → published → running → completed → archived`

**Source:** `season.service.ts:1-54`, `lifecycle.ts:31-40`.

### 4. League Management

**Interface:** LeagueListPage and LeagueDetailPage (`/admin/leagues`)

**Creating a League:**

1. Select a parent season
2. Set `code` (unique), `name`, optional `description`
3. Choose `format`: `round_robin` or `double_round_robin`
4. Configure: `max_teams`, `registration_fee`, `price_type`, `currency`
5. Set points system: `points_per_win` (default 3), `points_per_draw` (default 1)
6. League created with `status: 'draft'`

**League Status Transitions:**

| Action | Transition | Endpoint |
|--------|-----------|----------|
| Open Registration | draft → registration_open | `POST /admin/leagues/:id/publish` |
| Close Registration | registration_open → registration_closed | `POST /admin/leagues/:id/close-reg` |
| Start | registration_closed → running | `POST /admin/leagues/:id/start` |
| Complete | running → completed | `POST /admin/leagues/:id/complete` |
| Cancel | running → cancelled | `POST /admin/leagues/:id/cancel` |
| Archive | completed/cancelled → archived | `POST /admin/leagues/:id/archive` |

### 5. Division Management

**Interface:** DivisionManagePage (`/admin/leagues/:id/divisions`)

**Creating a Division:**

1. Set `name`, `tier` (1 = highest), `capacity`, `status`
2. Set `advance_count` (teams promoted per season)
3. Set `relegation_count` (teams relegated per season)

**Promotion:**

`POST /admin/leagues/divisions/:id/promote` with `{ team_count }`

1. Loads teams sorted by standings position (ascending)
2. Takes top N teams
3. Finds next higher tier division in the same league
4. Moves teams to the higher division

**Relegation:**

`POST /admin/leagues/divisions/:id/relegate` with `{ team_count }`

1. Loads teams sorted by standings position (descending)
2. Takes bottom N teams
3. Finds next lower tier division in the same league
4. Moves teams to the lower division

**Source:** `division.service.ts:23-73`.

### 6. Team Registration Management

**Interface:** Teams tab on LeagueDetailPage

**Registering a Team:**

`POST /admin/leagues/:id/register-team` with `{ team_name, captain_id?, player_ids[]? }`

1. Validates league is in registration_open state
2. Assigns team to the lowest-tier division
3. Checks division capacity:
   - If capacity available: status = `pending`
   - If full: status = `waiting`, auto-incremented `waiting_order`
4. Seeds team by count + 1

**Confirming a Team:**

Confirmation via `POST /admin/leagues/teams/:teamId/confirm`

- Validates pending/waiting → confirmed transition
- Auto-promotes next waiting team if capacity allows

**Cancelling a Team:**

`POST /admin/leagues/teams/:teamId/cancel`

- Validates via `validateTeamTransition(team.status, 'cancelled')`

**Source:** `league.service.ts:65-156`, `lifecycle.ts:53-62`.

### 7. Fixture Generation

**Interface:** Fixtures tab on LeagueDetailPage

**Generating Fixtures:**

`POST /admin/leagues/:id/generate-fixtures`

1. Loads league format (`round_robin` or `double_round_robin`)
2. For each active division:
   - Loads confirmed teams ordered by seed
   - Calls `generateRoundRobinFixtures(teamIds, doubleRoundRobin)`
   - Creates match records with `status: 'scheduled'`
3. Emits `fixtures.generated` event

**Double Round-Robin:** Mirror of all fixtures with reversed home/away.

**Source:** `fixture.service.ts:14-51`, `domain/league-aggregate.ts:7-47`.

### 8. Match Results

**Interface:** Matches tab on LeagueDetailPage

**Recording a Result:**

`POST /admin/leagues/matches/:matchId/result` with `{ home_score, away_score }`

1. Determines winner by score comparison
2. Creates `league_results` record with `result_status: 'submitted'`
3. Updates match status to `completed`
4. Triggers `standingRepository.recalculateStandings()` for the division
5. Emits `match.result.recorded` event

**Assigning Court/Referee:**

`POST /admin/leagues/matches/:matchId/assign-court` with `{ court_id }`
`POST /admin/leagues/matches/:matchId/assign-referee` with `{ referee_id }`

**Source:** `fixture.service.ts:65-129`.

---

## Chapter: Managing CRM (Customer Relationship Management)

### 1. Purpose

As an Organisation Admin or Super Admin, you can manage customer relationships through the CRM module: view Customer 360 profiles, manage audience segments, track and convert leads, run marketing campaigns, and review the communication log.

### 2. Prerequisites

- Required permissions:
  - `crm.customers.view` — View customer profiles and timeline
  - `crm.segments.view` / `crm.segments.manage` — Manage segments
  - `crm.leads.view` / `crm.leads.manage` — Manage leads
  - `crm.campaigns.view` / `crm.campaigns.manage` — Manage campaigns
  - `crm.communications.view` — View communication log
  - `crm.dashboard.view` — View CRM dashboard

### 3. Customer 360

**Interface:** Customer Detail page (`/admin/crm/customers/:id`)

The Customer 360 view aggregates data from all domains into a single profile:

| Section | Data Source | Columns |
|---------|-------------|---------|
| **Profile** | `users` | Name, email, phone, status, created_at |
| **Bookings** | `bookings` | Total count, cancelled count, completed count |
| **Orders** | `orders` | Total count, lifetime spend |
| **Wallet** | `wallet_transactions` | Total deposits, total withdrawn |
| **Enrollments** | `academy_enrollments` | Total count |
| **Tournaments** | `tournament_registrations` | Total count |
| **League Teams** | `league_teams` | Total count |
| **Last Activity** | Composite query | Most recent event timestamp across all domains |

**API Reference:**
```
GET /admin/crm/customers/:id
Permission: crm.customers.view
Response: { data: { ...user, bookings, orders, wallet, enrollments, tournaments, leagueTeams, lastActivity } }
```

**Source:** `crm.controller.ts:52-110`

### 4. Customer Timeline

**Interface:** Timeline tab on Customer Detail page

Chronological feed of all customer activity via UNION ALL across 6 tables:

| Event Type | Source Table | Fields Displayed |
|-----------|-------------|------------------|
| Booking | `bookings` | Created at, status, amount |
| Order | `orders` | Created at, status, total amount |
| Enrollment | `academy_enrollments` | Created at, status |
| Tournament Registration | `tournament_registrations` | Created at, status |
| Wallet Transaction | `wallet_transactions` | Created at, type, amount |
| Activity Log | `activity_logs` | Created at, action |

**API Reference:**
```
GET /admin/crm/customers/:id/timeline?limit=50
Permission: crm.customers.view
Response: { data: [{ created_at, type, ref_id, ref_status, ref_amount }] }
```

**Source:** `crm.controller.ts:112-137`

### 5. Managing Segments

**Interface:** Segments page (`/admin/crm/segments`)

Segments are rule-based customer groups. Creating a segment:

1. Set a **name** and optional **description**
2. Define **rules** as JSON conditions:
   - `has_booking` — Customer has at least one booking
   - `has_order` — Customer has at least one marketplace order
   - `has_enrollment` — Customer is enrolled in an academy program
   - `created_after` / `created_before` — Registration date range
   - `is_active` — Account active status
3. Choose the rule operator: `AND` (must match all) or `OR` (must match any)

**Refreshing a Segment:**

`POST /admin/crm/segments/:id/refresh` — Re-evaluates all rules against the `users` table and repopulates `segment_members`. The member count is updated automatically.

**Editing a Segment:**

Update name, description, or rules at any time. Note: rules are only re-evaluated when the segment is explicitly refreshed.

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List segments | `GET /admin/crm/segments` | `crm.segments.view` |
| Create segment | `POST /admin/crm/segments` | `crm.segments.manage` |
| Update segment | `PUT /admin/crm/segments/:id` | `crm.segments.manage` |
| Refresh segment | `POST /admin/crm/segments/:id/refresh` | `crm.segments.manage` |
| Delete segment | `DELETE /admin/crm/segments/:id` | `crm.segments.manage` |

**Source:** `crm.controller.ts:139-293`, `database/migrations/069_crm_marketing.sql:2-26`

### 6. Managing Leads

**Interface:** Leads page (`/admin/crm/leads`)

**Lead Lifecycle:** `new → qualified → converted → lost`

| Status | Description |
|--------|-------------|
| `new` | Fresh lead captured (from registration, referral, manual entry, or import) |
| `qualified` | Meets criteria, assigned to a sales rep |
| `converted` | Became a customer — linked to a user account |
| `lost` | Disqualified or declined |

**Creating a Lead:**

Required: `fullName`, `source` (registration, referral, manual, import)
Optional: `email`, `phone`, `notes`, `assignedTo`

**Converting a Lead:**

`POST /admin/crm/leads/:id/convert` with optional `userId`
1. If `userId` provided, links lead to that user
2. If not, attempts to match by email (`SELECT id FROM users WHERE email = ?`)
3. Sets `status = 'converted'`, records `converted_user_id`

**Viewing Leads:**

Filter by: `status`, `source`, `assignedTo`. List includes assignee and creator names via LEFT JOIN.

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List leads | `GET /admin/crm/leads?status=&source=&assignedTo=` | `crm.leads.view` |
| Create lead | `POST /admin/crm/leads` | `crm.leads.manage` |
| Update lead | `PUT /admin/crm/leads/:id` | `crm.leads.manage` |
| Convert lead | `POST /admin/crm/leads/:id/convert` | `crm.leads.manage` |

**Source:** `crm.controller.ts:295-417`, `database/migrations/069_crm_marketing.sql:29-47`

### 7. Managing Campaigns

**Interface:** Campaigns page (`/admin/crm/campaigns`)

**Campaign Lifecycle:** `draft → active → paused → completed → cancelled`

| Action | From | Endpoint |
|--------|------|----------|
| Launch | draft, paused | `POST /admin/crm/campaigns/:id/launch` |
| Pause | active | `POST /admin/crm/campaigns/:id/pause` |
| Complete | active, paused | `POST /admin/crm/campaigns/:id/complete` |

**Creating a Campaign:**

Required: `name`
Optional: `description`, `type` (email, sms, push, in_app, multi_channel), `segmentId` (target a customer segment), `scheduledAt` (scheduled launch time)

Campaigns are created with `status: 'draft'`.

**Best Practices:**
- Target campaigns to specific segments for better engagement
- Use `scheduledAt` to plan campaigns in advance
- Monitor campaign stats via the campaigns list (cached in `stats_json`)

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List campaigns | `GET /admin/crm/campaigns?status=&type=` | `crm.campaigns.view` |
| Create campaign | `POST /admin/crm/campaigns` | `crm.campaigns.manage` |
| Update campaign | `PUT /admin/crm/campaigns/:id` | `crm.campaigns.manage` |
| Launch | `POST /admin/crm/campaigns/:id/launch` | `crm.campaigns.manage` |
| Pause | `POST /admin/crm/campaigns/:id/pause` | `crm.campaigns.manage` |
| Complete | `POST /admin/crm/campaigns/:id/complete` | `crm.campaigns.manage` |

**Source:** `crm.controller.ts:419-590`, `database/migrations/069_crm_marketing.sql:50-69`

### 8. Viewing Communication Log

**Interface:** Communications page (`/admin/crm/communications`)

The communication log provides a unified view of all outbound and inbound communications across channels:

| Channel | Direction | Statuses |
|---------|-----------|----------|
| email, sms, push, in_app, whatsapp | outbound, inbound | sent, delivered, failed, opened, clicked |

**Filtering:**
- By `userId` — communications for a specific customer
- By `channel` — filter by communication channel
- By `status` — delivery status
- By `referenceType` / `referenceId` — communications related to a specific entity (e.g. campaign)
- By date range (`from`, `to`)

**API Reference:**
```
GET /admin/crm/communications?userId=&channel=&status=&from=&to=&referenceType=&referenceId=
Permission: crm.communications.view
Response: { data: [{ ...communication_log, user: { first_name, last_name, email } }] }
```

**Source:** `crm.controller.ts:592-618`, `database/migrations/069_crm_marketing.sql:72-87`

### 9. CRM Dashboard

**Interface:** CRM Dashboard (`/admin/crm`)

Shows aggregate KPIs:
- **Total Customers** — COUNT from `users` table
- **Lead Stats** — Breakdown by status (new, qualified, converted, lost)
- **Active Campaigns** — Campaigns currently running
- **Active Segments** — Segments with `is_active = true`
- **Recent Leads** — Last 10 leads created

**API Reference:**
```
GET /admin/crm/dashboard
Permission: crm.dashboard.view
```

**Source:** `crm.controller.ts:620-647`

---

## Chapter: Managing HR (Human Resources)

### 1. Purpose

As an Organisation Admin or Super Admin, you can manage the full employee lifecycle, department hierarchy, leave management, attendance tracking, and payroll processing through the HR module.

### 2. Prerequisites

- Required permissions:
  - `hr.departments.*` — Manage departments
  - `hr.positions.*` — Manage positions
  - `hr.employees.*` — Manage employee records
  - `hr.contracts.*` — Manage employment contracts
  - `hr.leaves.*` — Manage leave types, requests, balances
  - `hr.attendance.*` — Manage attendance
  - `hr.payroll.*` — Manage payroll components and runs
  - `hr.dashboard.view` — View HR dashboard

### 3. Managing Employees

**Interface:** Employee List (`/admin/hr/employees`) and Employee Detail (`/admin/hr/employees/:id`)

**Employee Lifecycle:** `draft → onboarding → active → on_leave → suspended → terminated → archived`

| State | Description |
|-------|-------------|
| draft | Initial record, not yet onboarded |
| onboarding | In the onboarding process |
| active | Currently employed and working |
| on_leave | On approved leave (maternity, sabbatical, etc.) |
| suspended | Temporarily suspended |
| terminated | Employment ended |
| archived | Record archived for historical reference |

**Creating an Employee:**

1. Find the user by selecting from the `users` table
2. Select **organisation**, **department**, and **position**
3. Set optional **employee code**, **hire date**, **reports to** (manager)
4. Employee is created with `status: 'draft'`

**Changing Employee Status:**

`PATCH /hr/employees/:id/status` with `{ status }`
- All transitions are validated by the state machine
- On `terminated`: `terminationDate` and `terminationReason` are required
- Recruiting back a terminated employee requires creating a new employee record

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List employees | `GET /hr/employees?organisationId=&departmentId=&status=&search=` | `hr.employees.view` |
| Get employee | `GET /hr/employees/:id` | `hr.employees.view` |
| Create employee | `POST /hr/employees` | `hr.employees.manage` |
| Update employee | `PUT /hr/employees/:id` | `hr.employees.manage` |
| Change status | `PATCH /hr/employees/:id/status` | `hr.employees.manage` |

**Source:** `hr.controller.ts:250-400`, `database/migrations/070_hr_payroll.sql:34-57`

### 4. Managing Departments

**Interface:** Department List (`/admin/hr/departments`)

Departments form a hierarchical tree via `parent_id`:
- **Parent:** Higher-level department (e.g. "Operations")
- **Child:** Sub-department (e.g. "Facilities" under "Operations")
- **Head:** An employee designated as department head

**Creating a Department:**

Required: `organisationId`, `name`
Optional: `parentId`, `headEmployeeId`

**Deleting a Department:**

Soft-delete: sets `is_active = 0`. Child departments are not automatically deactivated.

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List departments | `GET /hr/departments?organisationId=&isActive=` | `hr.departments.view` |
| Get department | `GET /hr/departments/:id` | `hr.departments.view` |
| Create department | `POST /hr/departments` | `hr.departments.manage` |
| Update department | `PUT /hr/departments/:id` | `hr.departments.manage` |
| Delete department | `DELETE /hr/departments/:id` | `hr.departments.manage` |

**Source:** `hr.controller.ts:23-134`, `database/migrations/070_hr_payroll.sql:2-15`

### 5. Managing Leave

**Interface:** Leave Management page (`/admin/hr/leave`) — 3 tabs

#### 5.1 Leave Types Tab

Configure leave categories per organisation:

| Field | Description |
|-------|-------------|
| `name` | e.g. Annual Leave, Sick Leave, Personal Leave |
| `defaultDays` | Annual allocation (e.g. 21 for annual leave) |
| `isPaid` | Whether this leave type is paid |
| `requiresApproval` | Whether requests require manager approval |

#### 5.2 Leave Requests Tab

**Leave Request Lifecycle:** `draft → submitted → approved → rejected → cancelled → completed`

| Status | Description |
|--------|-------------|
| draft | Being filled by employee |
| submitted | Pending manager approval |
| approved | Manager approved, leave scheduled |
| rejected | Manager denied |
| cancelled | Withdrawn by employee |
| completed | Leave period has passed |

**Approving a Leave Request:**

When an admin approves:
1. The system checks `leave_balances` for sufficient remaining days
2. If `used_days + duration_days > total_days`, the approval is rejected
3. On success, `used_days` and `pending_days` are updated atomically
4. The request status transitions to `approved`

**Cancelling an Approved Leave:**

If an approved leave is cancelled, the system automatically reverses the `used_days` deduction from the employee's leave balance.

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List leave requests | `GET /hr/leave-requests` | `hr.leaves.requests.view` |
| Create | `POST /hr/leave-requests` | `hr.leaves.requests.manage` |
| Submit | `POST /hr/leave-requests/:id/submit` | `hr.leaves.requests.manage` |
| Approve | `POST /hr/leave-requests/:id/approve` | `hr.leaves.requests.approve` |
| Reject | `POST /hr/leave-requests/:id/reject` | `hr.leaves.requests.approve` |
| Cancel | `POST /hr/leave-requests/:id/cancel` | `hr.leaves.requests.manage` |

#### 5.3 Leave Balances Tab

View and adjust leave balances per employee, per leave type, per year.

- **total_days:** Annual entitlement
- **used_days:** Days taken (auto-incremented on approve)
- **pending_days:** Days in pending/approved requests

**Adjusting a Balance:**

`POST /hr/leave-balances/adjust` — upsert by employee + leave type + year. Use for manual corrections (e.g. carry-over from previous year).

**Source:** `hr.controller.ts:533-956`, `database/migrations/070_hr_payroll.sql:79-125`

### 6. Managing Attendance

**Interface:** Attendance page (`/admin/hr/attendance`)

**Attendance Statuses:** `present`, `absent`, `late`, `early_leave`, `excused`

**Clock In/Out (Real-time):**
- `POST /hr/attendance/clock-in` — Records clock-in time for today (employee can only clock in once per day)
- `POST /hr/attendance/clock-out` — Records clock-out time for today

**Manual Logging:**
- `POST /hr/attendance/log` — Record attendance for any date with any status and optional notes

**Viewing Attendance:**

Filter by `employeeId`, date range (`from`, `to`), `status`. Returns clock-in/out times and status.

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| Clock In | `POST /hr/attendance/clock-in` | `hr.attendance.manage` |
| Clock Out | `POST /hr/attendance/clock-out` | `hr.attendance.manage` |
| Manual Log | `POST /hr/attendance/log` | `hr.attendance.manage` |
| List | `GET /hr/attendance?employeeId=&from=&to=&status=` | `hr.attendance.view` |

**Source:** `hr.controller.ts:960-1084`, `database/migrations/070_hr_payroll.sql:128-141`

### 7. Managing Payroll

**Interface:** Payroll page (`/admin/hr/payroll`) — 2 tabs

#### 7.1 Payroll Components Tab

Configure earning and deduction types:

| Field | Description |
|-------|-------------|
| `name` | Component name (e.g. "Overtime", "Health Insurance") |
| `type` | `earning` (adds to pay) or `deduction` (subtracts from pay) |
| `calculationType` | `fixed` (flat amount), `percentage` (of base salary), `formula` |
| `defaultAmount` | Default value used in calculation |

**Example Components:**

| Name | Type | Calculation | Amount |
|------|------|-------------|--------|
| Overtime | earning | fixed | 200.00 |
| Bonus | earning | percentage | 10 (10% of base) |
| Health Insurance | deduction | fixed | 150.00 |
| Tax | deduction | percentage | 15 (15% of base) |

#### 7.2 Payroll Runs Tab

**Payroll Run Lifecycle:** `draft → calculated → approved → posted → paid → closed`

| Step | Action | What Happens |
|------|--------|-------------|
| 1 | Create | Define period (start_date, end_date) — status: draft |
| 2 | Calculate | System computes earnings/deductions for all active employees using configured components — status: calculated |
| 3 | Approve | Manager reviews and approves — status: approved |
| 4 | Post to GL | System creates double-entry journal entries in the General Ledger — status: posted |
| 5 | Mark Paid | Mark as paid after disbursement — status: paid |
| 6 | Close | Finalize the period — status: closed |

**Calculation Details:**

When you click "Calculate" (`POST /hr/payroll-runs/:id/calculate`):
1. Loads all active employees with active contracts
2. For each employee, evaluates all active payroll components:
   - **Fixed:** Adds the `defaultAmount` directly
   - **Percentage:** Computes `defaultAmount%` of `baseSalary`
3. Computes `net_pay = baseSalary + total_earnings - total_deductions`
4. Stores per-employee breakdown as JSON in `payroll_entries`
5. Aggregates total gross, deductions, and net on the payroll run

**Posting to General Ledger:**

When you click "Post to GL" (`POST /hr/payroll-runs/:id/post`):
1. Validates the transition (must be `approved` → `posted`)
2. For each employee, creates double-entry records:
   - Debit: Salary Expense account
   - Credit: Salary Payable account
3. Sets `posted_at` and `posted_by` timestamps
4. The run is now locked for HR editing

**API Reference:**

| Action | Endpoint | Permission |
|--------|----------|------------|
| List payroll runs | `GET /hr/payroll-runs` | `hr.payroll.runs.view` |
| Get run + entries | `GET /hr/payroll-runs/:id` | `hr.payroll.runs.view` |
| Create run | `POST /hr/payroll-runs` | `hr.payroll.runs.manage` |
| Calculate | `POST /hr/payroll-runs/:id/calculate` | `hr.payroll.runs.calculate` |
| Approve | `POST /hr/payroll-runs/:id/approve` | `hr.payroll.runs.approve` |
| Post to GL | `POST /hr/payroll-runs/:id/post` | `hr.payroll.runs.post` |
| Mark Paid | `POST /hr/payroll-runs/:id/mark-paid` | `hr.payroll.runs.manage` |
| Close | `POST /hr/payroll-runs/:id/close` | `hr.payroll.runs.manage` |

**Source:** `hr.controller.ts:1088-1498`, `database/migrations/070_hr_payroll.sql:143-193`

### 8. HR Dashboard

**Interface:** HR Dashboard (`/admin/hr`)

Shows aggregate KPIs:
- **Employees by Status** — Breakdown of all employment statuses
- **Total Departments** — Active department count
- **Pending Leave Requests** — Leave requests awaiting approval
- **Active Payroll Runs** — Runs in draft/calculated/approved state
- **Today's Attendance** — Employees who clocked in today

**API Reference:**
```
GET /hr/dashboard?organisationId=
Permission: hr.dashboard.view
```

**Source:** `hr.controller.ts:1502-1544`

---

## Chapter: Viewing Reports (Reports Module)

### 1. Purpose

As an Organisation Admin or Super Admin, you can generate and view reports across 9 categories: financial, bookings, users, organisations, marketplace, tournaments, coaches, ads, and audit. All reports are available through the Reports page (`/admin/reports`).

### 2. Prerequisites

- `super_admin` role OR explicit report permission keys assigned via role
- The `reportGuard` checks either `super_admin` bypass or specific `role_permissions`

### 3. Financial Reports

| Report | Endpoint | What It Shows |
|--------|----------|---------------|
| Revenue Summary | `GET /reports/financial/summary` | Total revenue, commission, deposits, withdrawals, refunds, settlements |
| Revenue By Source | `GET /reports/financial/by-source` | Revenue grouped by transaction_type (payment, commission) |
| Revenue Timeline | `GET /reports/financial/timeline?groupBy=` | Revenue over time (day/week/month) |
| Payment Methods | `GET /reports/financial/payment-methods` | Breakdown by payment_method (wallet, cash, card, etc.) |
| Settlements | `GET /reports/financial/settlements` | Settlement status distribution |

**Source table:** `wallet_transactions` (primary), `payment_transactions`, `settlements`

**Source:** `reports.repository.ts:26-94`

### 4. Booking Reports

| Report | Endpoint | What It Shows |
|--------|----------|---------------|
| Booking Volume | `GET /reports/bookings/volume?groupBy=` | Total bookings, revenue, cancellations over time |
| By Type | `GET /reports/bookings/by-type` | Count + revenue per booking_type |
| By Sport | `GET /reports/bookings/by-sport` | Count + revenue per sport (via resources JOIN) |
| Peak Hours | `GET /reports/bookings/peak-hours` | Booking count by hour of day |
| Cancellation Rate | `GET /reports/bookings/cancellation` | Total bookings vs cancelled, cancellation percentage |

**Source table:** `bookings`

**Source:** `reports.repository.ts:100-161`

### 5. User Reports

| Report | Endpoint | What It Shows |
|--------|----------|---------------|
| Registrations | `GET /reports/users/registrations?groupBy=` | New user signups over time |
| Demographics | `GET /reports/users/demographics` | Users by country |
| Gender | `GET /reports/users/gender` | Gender distribution |
| Active Users | `GET /reports/users/active?groupBy=` | Active users from `user_sessions` |
| Roles | `GET /reports/users/roles` | User count per role |

**Source tables:** `users`, `user_sessions`, `user_roles`

**Source:** `reports.repository.ts:167-215`

### 6. Organisation Reports

| Report | Endpoint | What It Shows |
|--------|----------|---------------|
| Top Organisations | `GET /reports/organisations/top` | Top N orgs by booking revenue |
| By Type | `GET /reports/organisations/by-type` | Org count per organisation_type |
| Subscription Status | `GET /reports/organisations/subscriptions` | Plan + status breakdown |

**Source tables:** `organisations`, `organisation_subscriptions`

**Source:** `reports.repository.ts:221-255`

### 7. Marketplace Reports

| Report | Endpoint | What It Shows |
|--------|----------|---------------|
| Overview | `GET /reports/marketplace/overview` | Total orders, revenue, commissions, unique buyers/sellers |
| Top Products | `GET /reports/marketplace/top-products` | Best-selling products |
| Order Status | `GET /reports/marketplace/orders` | Order status distribution |

**Source tables:** `orders`, `order_items`, `products`

**Source:** `reports.repository.ts:261-302`

### 8. Additional Reports

Tournament, coach, ad, and audit reports are also available via their respective endpoints (see TECH-ARCH-24 for full inventory).

### 9. Using the Reports Page

**Interface:** `/admin/reports`

1. Select a tab (Financial, Bookings, Users, Orgs, Marketplace, Tournaments, Ads, Audit)
2. Use the DateRangePicker to filter by date range
3. Each tab shows multiple endpoint blocks with charts or tables
4. Charts are interactive (tooltips, zoom via recharts)

**Source:** `frontend/src/pages/admin/reports/ReportsPage.tsx:181-247`

---

## Chapter: Using the BI Dashboard

### 1. Purpose

The Business Intelligence (BI) Dashboard provides executive-level aggregated metrics and drill-down capability. It complements the Reports module with higher-level KPIs and trend visualization.

### 2. Prerequisites

- `bi.dashboard.view` — Access the BI dashboard
- `bi.export` — Export CSV reports
- `bi.observability.view` — View Web Vitals and client errors
- `bi.kpi.view` — View KPI snapshot history

### 3. Executive Dashboard

**Interface:** `/admin/bi/dashboard`

The executive dashboard shows platform-wide KPIs:
- **Revenue** (30d, 7d, today)
- **Bookings** (30d, 7d, today)
- **Active Users** (logged in within 30 days)
- **Active Organisations**
- **Revenue Trend** (12-month bar chart)
- **Booking Trend** (30-day bar chart)
- **Top 10 Organisations** by revenue
- **User Growth** (12-month bar chart)

### 4. Organisation Drill-Down

Use the org selector dropdown to switch to a single-organisation view:

| Section | What It Shows |
|---------|---------------|
| Revenue | 30d, 7d, today (scoped) |
| Bookings | 30d, 7d, today (scoped) |
| Revenue Trend | 12-month (scoped) |
| Booking Trend | 30-day (scoped) |
| User Growth | 12-month (scoped) |
| Branch Breakdown | Per-branch bookings and revenue |
| Coach Utilization | Sessions per coach (30d) |
| Court Utilization | Bookings vs available slots per resource (30d) |

### 5. CSV Export

**Interface:** ExportPanel component on the BI dashboard

1. Select a report type from dropdown (Revenue, Bookings, Users, Organisations)
2. Optionally set date range
3. Click "Export CSV" — downloads a `.csv` file

**Supported export types:**
- `revenue` — Daily revenue from `payment_transactions`
- `bookings` — Daily booking count
- `users` — Daily registrations
- `organisations` — Org list with type

### 6. KPI Snapshots

**Interface:** Via API (`GET /bi/kpi-snapshots`)

Historical KPI records stored in `kpi_snapshots` table. Filterable by:
- `kpiKey`, `dateFrom`, `dateTo`, `organisationId`, `branchId`
- Returns paginated, ordered by `recorded_at DESC`

**Permission:** `bi.kpi.view`

### 7. Monitoring Web Vitals

**Interface:** `/admin/bi/observability`

Real-user monitoring (RUM) metrics:
- **LCP** (Largest Contentful Paint) — Loading performance
- **CLS** (Cumulative Layout Shift) — Visual stability
- **FCP** (First Contentful Paint) — Perceived load speed

Each metric is displayed as a daily average trend chart with sample count. Use date range filter to narrow the view.

### 8. Monitoring Client Errors

**Interface:** `/admin/bi/observability` (errors table)

Aggregated client-side JS errors grouped by message/stack/type:
- Error message and type
- Frequency count
- First and last seen timestamps

Use this to proactively identify frontend issues affecting users.

### 9. API Reference

| Endpoint | Method | Permission | Description |
|----------|--------|-----------|-------------|
| `/bi/dashboard` | GET | `bi.dashboard.view` | Executive dashboard data |
| `/bi/dashboard/org/:orgId` | GET | `bi.dashboard.view` | Org-scoped dashboard |
| `/bi/kpi-snapshots` | GET | `bi.kpi.view` | KPI historical snapshots |
| `/bi/export/:reportType` | GET | `bi.export` | CSV report export |
| `/bi/web-vitals` | GET | `bi.observability.view` | Web Vitals metrics |
| `/bi/client-errors` | GET | `bi.observability.view` | Client error reports |

**Source:** `bi.routes.ts:8-18`, `bi.controller.ts:1-393`, `BIDashboardPage.tsx:59-274`, `ObservabilityPage.tsx:53-141`

---

### 9. Standings Management

**Interface:** Standings tab on LeagueDetailPage

Standings are **persisted** and recalculated after every result. Manual recalculation available.

**Recalculation (`computeLeagueStandings()`):**

For each completed match with a result:
- Win: +3 points (or `points_per_win`)
- Draw: +1 point (or `points_per_draw`)
- Loss: 0 points
- Tracks GF, GA, GD
- Form array: appends 'W', 'L', or 'D' (truncated to last 5)

**Sorting:** Points DESC → Goal Difference DESC → Goals For DESC

**Formatting:** Form is limited to the last 5 results (e.g., `["W", "W", "L", "D", "W"]`)

**Source:** `standing.service.ts:9-48`, `domain/league-aggregate.ts:49-138`.

### 10. Player & Team Statistics

**Interface:** Statistics tab on LeagueDetailPage

**Player Statistics:**

Fields: appearances, goals, assists, clean_sheets, yellow_cards, red_cards, minutes_played, rating

Sport-specific stats stored in `stats_json` (JSON extension).

**Recalculation:** `POST /admin/leagues/statistics/player/recalculate` — for each confirmed team in a division, parses player_ids JSON, calculates stats from completed matches, upserts into `player_statistics`.

**Team Statistics:**

Fields: played, wins, draws, losses, goals_for, goals_against, clean_sheets

Split into `home_record` and `away_record` (each with wins, draws, losses, gf, ga).

**Recalculation:** `POST /admin/leagues/statistics/team/recalculate` — recalculates team stats from completed matches.

**Source:** `statistics.service.ts:1-196`.
