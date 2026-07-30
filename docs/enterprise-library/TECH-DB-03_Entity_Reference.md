---
document_id: "TECH-DB-03"
document_name: "Entity Reference"
family: "TECH-DB"
document_type: "DB"
status: "Draft"
version: "0.1"
audience: ["developer", "dba"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
---

# Entity Reference (TECH-DB-03)

## Booking Entities

### bookings

The central booking entity. Stores every court/resource reservation. Uses optimistic concurrency via `version`.

**Source:** `database/baseline/001_courtzon_v3.sql:573-614`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | YES | NULL | UUID for QR codes and public sharing |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to `users` — the booking owner |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to `organisations` — org owning the branch |
| `resource_id` | `bigint(20) unsigned` | NO | — | FK to `resources` — the court/resource booked |
| `branch_id` | `int(10) unsigned` | YES | NULL | FK to `branches` — denormalized for branch-level accounting |
| `booking_type` | `enum('public_match','private_match','academy','clinic','coach_session')` | NO | — | Categorizes the booking purpose |
| `visibility` | `enum('public','private')` | YES | 'public' | Whether the booking appears in match discovery |
| `start_at_utc` | `timestamp` | NO | — | Absolute start time in UTC. Source of truth for all time operations |
| `end_at_utc` | `timestamp` | NO | — | Absolute end time in UTC |
| `booking_date` | `date` | NO | — | Local date of the booking |
| `business_date` | `date` | NO | — | The Business Day this booking belongs to. Resolved by OperatingHoursEngine |
| `start_time` | `time` | NO | — | Local start time |
| `end_time` | `time` | NO | — | Local end time |
| `total_amount` | `decimal(12,2)` | NO | — | Total price charged |
| `commission_rate` | `decimal(5,2)` | YES | 0.00 | Platform commission percentage |
| `commission_amount` | `decimal(12,2)` | YES | 0.00 | Calculated commission value |
| `net_amount` | `decimal(12,2)` | YES | 0.00 | Amount after commission |
| `plan_name` | `varchar(100)` | YES | NULL | Membership plan name if applicable |
| `club_amount` | `decimal(12,2)` | YES | 0.00 | Amount owed to the club |
| `payment_status` | `enum('pending','paid','refunded','partially_refunded','failed','penalty')` | YES | 'pending' | Current payment state |
| `payment_method` | `varchar(50)` | YES | NULL | e.g. wallet, cash, card, online, cod |
| `booking_status` | `enum('pending','pending_payment','confirmed','cancelled','completed','expired','checked_in','no_show')` | YES | 'pending' | Current booking lifecycle state |
| `cancellation_policy_snapshot` | `longtext` | YES | NULL | JSON snapshot of the policy at time of booking |
| `notes` | `text` | YES | NULL | Free-text notes |
| `expires_at` | `datetime` | YES | NULL | When pending/pending_payment bookings expire |
| `version` | `int(11)` | YES | 1 | Optimistic concurrency version — incremented on every state transition |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `idx_user` | `user_id` | KEY | User's bookings lookup |
| `idx_date` | `booking_date` | KEY | Date-range queries |
| `idx_status` | `booking_status`, `payment_status` | KEY | Filtered status queries |
| `idx_organisation` | `organisation_id` | KEY | Org-scoped listing |
| `idx_resource` | `resource_id` | KEY | Resource availability checks |
| `idx_branch` | `branch_id` | KEY | Branch accounting queries |
| `idx_bookings_org_resource` | `organisation_id`, `resource_id`, `booking_date`, `booking_status` | KEY | Org + resource + date + status composite |
| `idx_bookings_start_at_utc` | `start_at_utc` | KEY | UTC time-range queries |
| `idx_bookings_business_date` | `business_date` | KEY | Business day queries |

**Foreign Keys:**

| Name | Child Cols | Parent Table | Parent Col | On Delete |
|------|-----------|-------------|------------|-----------|
| `fk_booking_branch` | `branch_id` | `branches` | `id` | SET NULL |

---

### booking_slots

Individual time-slot records for a booking. Supports multi-slot bookings where a single booking spans multiple consecutive slots.

**Source:** `database/baseline/001_courtzon_v3.sql:556-568`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `booking_id` | `bigint(20) unsigned` | NO | — | FK to `bookings` |
| `resource_id` | `bigint(20) unsigned` | NO | — | FK to `resources` — denormalized for slot queries |
| `booking_date` | `date` | NO | — | Date of this specific slot |
| `slot_start` | `time` | NO | — | Start time of this slot |
| `slot_end` | `time` | NO | — | End time of this slot |
| `is_available` | `tinyint(1)` | YES | 1 | Whether the slot is available (1) or booked (0) |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `uk_slot` | `resource_id`, `booking_date`, `slot_start` | UNIQUE | Prevents double-booking a slot |
| `idx_booking` | `booking_id` | KEY | Reverse lookup by booking |

---

### booking_matchmaking_requests

Stores matchmaking criteria for bookings that are opened to public match discovery.

**Source:** `database/baseline/001_courtzon_v3.sql:516-536`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `booking_id` | `bigint(20) unsigned` | NO | — | FK to `bookings` (1:1) |
| `min_age` | `int(11)` | YES | NULL | Minimum player age filter |
| `max_age` | `int(11)` | YES | NULL | Maximum player age filter |
| `target_gender` | `enum('male','female','any')` | YES | 'any' | Gender preference for matchmaking |
| `target_level_id` | `int(10) unsigned` | YES | NULL | FK to `player_levels` — skill level filter |
| `max_players` | `int(11)` | NO | 2 | Maximum participants (default 2 = singles) |
| `deadline` | `datetime` | YES | NULL | Application deadline |
| `auto_apply` | `tinyint(1)` | NO | 0 | Auto-accept matching applicants |
| `is_active` | `tinyint(1)` | NO | 1 | Soft-delete flag |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `booking_id` | `booking_id` | UNIQUE | One matchmaking request per booking |
| `idx_booking` | `booking_id` | KEY | Booking lookup |
| `idx_active` | `is_active` | KEY | Active request filtering |
| `target_level_id` | `target_level_id` | KEY | Skill-level join |

**Foreign Keys:**

| Name | Child Cols | Parent Table | Parent Col | On Delete |
|------|-----------|-------------|------------|-----------|
| `booking_matchmaking_requests_ibfk_1` | `booking_id` | `bookings` | `id` | CASCADE |
| `booking_matchmaking_requests_ibfk_2` | `target_level_id` | `player_levels` | `id` | SET NULL |

---

### booking_invitations

Stores invitations/applications for booking participation. Each row represents either a direct invitation (host invites a specific user) or an application (player applies to join a public match).

**Source:** `database/baseline/001_courtzon_v3.sql:499-511`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `booking_id` | `bigint(20) unsigned` | NO | — | FK to `bookings` |
| `invited_user_id` | `bigint(20) unsigned` | YES | NULL | FK to `users` — the invited/applicant user |
| `email` | `varchar(255)` | YES | NULL | For external invitees without accounts |
| `status` | `enum('pending','accepted','declined')` | NO | 'pending' | Current invitation/applicant status |
| `token` | `varchar(255)` | NO | — | Unique token for anonymous response links |
| `responded_at` | `timestamp` | YES | NULL | When the invitee responded |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `token` | `token` | UNIQUE | Unique response token |
| `idx_booking` | `booking_id` | KEY | Booking-level lookup |

**Business meaning:** A `booking_invitations` row serves double duty:
1. **Invitation** — the booking creator invites a known user to join a private booking
2. **Application** — a player applies to join a public match (the host is recorded as the inviter)

The `respondToApplicant` endpoint transitions status from `pending` to `accepted` or `declined`.

---

### booking_intents

Temporary intent records for the prepare-booking flow. Captures all booking parameters before payment gateway processing. Auto-expires after 15 minutes.

**Source:** `database/baseline/001_courtzon_v3.sql:466-494`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to `users` |
| `branch_id` | `int(10) unsigned` | NO | — | FK to `branches` |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to `organisations` |
| `resource_id` | `bigint(20) unsigned` | NO | — | FK to `resources` |
| `booking_type` | `enum('public_match','private_match','academy','clinic','coach_session')` | NO | 'private_match' | Intended booking type |
| `booking_date` | `date` | NO | — | Intended date |
| `business_date` | `date` | NO | — | Business day resolved by OperatingHoursEngine |
| `start_time` | `time` | NO | — | Intended start time |
| `end_time` | `time` | NO | — | Intended end time |
| `start_at_utc` | `timestamp` | NO | — | UTC start time |
| `end_at_utc` | `timestamp` | NO | — | UTC end time |
| `total_amount` | `decimal(12,2)` | NO | — | Calculated price |
| `commission_amount` | `decimal(12,2)` | YES | 0.00 | Commission at intent time |
| `club_amount` | `decimal(12,2)` | YES | 0.00 | Net club amount |
| `payment_method` | `varchar(50)` | YES | NULL | Selected payment method |
| `notes` | `text` | YES | NULL | Booking notes |
| `matchmaking` | `longtext` | YES | NULL | JSON — matchmaking criteria |
| `participants` | `longtext` | YES | NULL | JSON — additional participants |
| `expires_at` | `timestamp` | NO | `current_timestamp() + interval 15 minute` | Auto-expiry |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `idx_expires` | `expires_at` | KEY | Expiry worker queries |
| `idx_booking_intents_user` | `user_id` | KEY | User intents lookup |
| `idx_booking_intents_resource_date` | `resource_id`, `booking_date` | KEY | Slot conflict check at intent time |
| `idx_booking_intents_start_at_utc` | `start_at_utc` | KEY | UTC queries |
| `idx_booking_intents_business_date` | `business_date` | KEY | Business-day queries |

---

### booking_cancellations

Tracks cancellation details including reason, refund amounts, and processing status.

**Source:** `database/baseline/001_courtzon_v3.sql:449-461`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `booking_id` | `bigint(20) unsigned` | NO | — | FK to `bookings` (1:1) |
| `cancelled_by` | `bigint(20) unsigned` | NO | — | FK to `users` — who cancelled |
| `reason` | `varchar(500)` | NO | — | Cancellation reason |
| `refund_amount` | `decimal(12,2)` | NO | 0.00 | Amount to be refunded |
| `refund_status` | `enum('pending','processed','skipped')` | NO | 'pending' | Refund processing state |
| `processed_at` | `timestamp` | YES | NULL | When refund was processed |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `booking_id` | `booking_id` | UNIQUE | One cancellation record per booking |
| `idx_booking` | `booking_id` | KEY | Booking lookup |

---

### booking_participants

Additional participants on a booking beyond the booking creator (used for group bookings).

**Source:** `database/baseline/001_courtzon_v3.sql:541-551`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `booking_id` | `bigint(20) unsigned` | NO | — | FK to `bookings` |
| `user_id` | `bigint(20) unsigned` | YES | NULL | FK to `users` — registered participant |
| `full_name` | `varchar(150)` | YES | NULL | Participant name (unregistered) |
| `email` | `varchar(255)` | YES | NULL | Participant email (unregistered) |
| `phone` | `varchar(25)` | YES | NULL | Participant phone (unregistered) |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `idx_booking` | `booking_id` | KEY | Booking participant lookup |

**Evidence:** All table schemas verified against `database/baseline/001_courtzon_v3.sql:449-614`.

---

## Payment Entities

### payment_transactions

Central payment ledger. Records every payment attempt through any gateway. Uses optimistic concurrency via `aggregate_version`.

**Source:** `database/baseline/001_courtzon_v3.sql:2066-2088`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to `users` |
| `booking_id` | `bigint(20) unsigned` | YES | NULL | FK to `bookings` (if reference type is booking) |
| `order_id` | `bigint(20) unsigned` | YES | NULL | FK to `orders` (if reference type is order) |
| `reference_type` | `varchar(50)` | YES | NULL | e.g. `booking`, `order`, `wallet_topup`, `subscription` |
| `payment_method` | `enum('wallet','cash','card','bank_transfer','online')` | NO | — | How the user paid |
| `gateway_provider` | `varchar(100)` | YES | NULL | e.g. `paymob`, `mock`, `wallet_system` |
| `gateway_reference` | `varchar(255)` | YES | NULL | Gateway-side transaction ID |
| `amount` | `decimal(14,2)` | NO | — | Payment amount |
| `currency` | `char(3)` | NOT NULL | 'EGP' | Currency code |
| `payment_status` | `enum('pending','paid','failed','refunded')` | YES | 'pending' | Current payment state |
| `gateway_response` | `longtext` | YES | NULL | JSON — sanitized gateway response (PCI-sensitive fields stripped) |
| `idempotency_key` | `varchar(64)` | YES | NULL | Client idempotency key |
| `trace_id` | `char(36)` | YES | NULL | UUID trace identifier |
| `aggregate_version` | `int(11)` | YES | 1 | Optimistic concurrency version |
| `paid_at` | `timestamp` | YES | NULL | When payment was confirmed paid |
| `cancelled_at` | `timestamp` | YES | NULL | When payment was cancelled/expired |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `uk_gateway_reference` | `gateway_reference` | UNIQUE | Prevents duplicate gateway references |
| `idx_user` | `user_id` | KEY | User payment history lookup |
| `idx_booking` | `booking_id` | KEY | Booking payment lookup |
| `idx_status` | `payment_status` | KEY | Status-based queries (sync, expiry) |
| `idx_order` | `order_id` | KEY | Order payment lookup |

**Business meaning:** One row per payment attempt. The `payment_status` corresponds to the lifecycle in `payment-aggregate.ts:3-11`. Gateway responses are stored with PCI fields (pan, cvv, expiry, card_holder, billing_data, first_6_digits, last_4_digits) stripped by `sanitizeGatewayResponse()` at `payment.service.ts:31-47`.

---

### financial_journal_entries

Double-entry bookkeeping records for all financial movements. Each entry records a single debit/credit pair.

**Source:** `database/baseline/001_courtzon_v3.sql:1445-1457`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `entry_type` | `varchar(100)` | YES | NULL | e.g. `payment`, `refund`, `settlement` |
| `reference_type` | `varchar(100)` | YES | NULL | e.g. `payment`, `gateway_webhook`, `gateway_sync` |
| `reference_id` | `bigint(20) unsigned` | YES | NULL | FK to the source transaction |
| `debit_account` | `varchar(100)` | YES | NULL | e.g. `Cash`, `Bad Debt`, `Refund Expense` |
| `credit_account` | `varchar(100)` | YES | NULL | e.g. `Revenue`, `Cash` |
| `amount` | `decimal(14,2)` | YES | NULL | Journal amount |
| `description` | `text` | YES | NULL | Free-text description |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `idx_reference` | `reference_type`, `reference_id` | KEY | Reference-based lookup |

**Created by:** `payment.repository.ts:199-210` — `createJournalEntry()`. Called with debit/credit pairs:
- **Payment success:** debit `Cash`, credit `Revenue`
- **Payment failure:** debit `Bad Debt`, credit `Cash`
- **Refund:** debit `Refund Expense`, credit `Cash`
- **Wallet payment:** debit `Cash`, credit `Revenue`

---

## Wallet Entities

### user_wallets

Per-user digital wallet with optimistic locking. One wallet per user (1:1).

**Source:** `database/baseline/001_courtzon_v3.sql:3388-3398`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to `users` (1:1) |
| `balance` | `decimal(14,2)` | YES | 0.00 | Current wallet balance |
| `currency_code` | `varchar(10)` | YES | 'EGP' | Wallet currency |
| `is_locked` | `tinyint(1)` | YES | 0 | Administrative lock flag |
| `version` | `int(11)` | YES | 1 | Optimistic concurrency version — incremented on every balance update |
| `created_at` | `timestamp` | NO | current_timestamp() | Creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `uk_wallet_user` | `user_id` | UNIQUE | One wallet per user |

**Foreign Keys:** None explicitly (FK logic in application layer via `wallet.repository.ts:44-51`).

**Auto-creation:** If `walletRepository.findByUserId()` returns null, `wallet.service.ts:16-39` auto-creates a wallet with balance 0 and currency from the user's country.

---

### wallet_transactions

Individual wallet movement records. Each deposit, withdrawal, payment, refund, commission, settlement, due, or penalty.

**Source:** `database/baseline/001_courtzon_v3.sql:3469-3485`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | YES | NULL | UUID for external reference |
| `wallet_id` | `bigint(20) unsigned` | NO | — | FK to `user_wallets` |
| `transaction_type` | `enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty')` | NO | — | Category of transaction |
| `amount` | `decimal(14,2)` | NO | — | Transaction amount (always positive) |
| `direction` | `enum('credit','debit')` | NO | — | Credit adds funds, debit removes funds |
| `reference_type` | `varchar(100)` | YES | NULL | Business reference type (e.g., `booking`, `order`) |
| `reference_id` | `bigint(20) unsigned` | YES | NULL | Business reference ID |
| `description` | `text` | YES | NULL | Free-text description |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `idx_wallet` | `wallet_id` | KEY | Wallet transaction lookup |
| `idx_reference` | `reference_type`, `reference_id` | KEY | Reference-based lookup |
| `idx_wallet_txn_wallet_created` | `wallet_id`, `created_at` | KEY | Wallet date-range queries |
| `idx_wallet_txn_type_created` | `wallet_id`, `transaction_type`, `created_at` | KEY | Wallet type+date queries |

**Created by:** `wallet.repository.ts:80-92` — `createTransaction()`. Called with `generateUUID()` for `public_id`, the wallet ID, transaction type, direction, amount, and optional reference.

---

### withdrawal_requests

Withdrawal requests submitted by users and reviewed by admins.

**Source:** `database/baseline/001_courtzon_v3.sql:3506-3525`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `int(10) unsigned` | NO | — | FK to `users` |
| `wallet_id` | `int(10) unsigned` | NO | — | FK to `user_wallets` |
| `amount` | `decimal(10,2)` | NO | — | Withdrawal amount |
| `branch_financial_details_id` | `int(10) unsigned` | YES | NULL | FK for bank transfer details |
| `status` | `enum('pending','approved','rejected','completed','cancelled')` | NOT NULL | 'pending' | Lifecycle state |
| `admin_notes` | `text` | YES | NULL | Admin review notes |
| `reviewed_by` | `int(10) unsigned` | YES | NULL | FK to `users` (admin who reviewed) |
| `reviewed_at` | `timestamp` | YES | NULL | When the review occurred |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| `reviewed_by` | `reviewed_by` | KEY | Admin lookup |
| `idx_withdrawal_user` | `user_id` | KEY | User withdrawal lookup |
| `idx_withdrawal_status` | `status` | KEY | Status-based filtering |
| `fk_wr_branch_financial` | `branch_financial_details_id` | KEY | Branch bank details lookup |

**Foreign Keys:**

| Name | Child Cols | Parent Table | Parent Col | On Delete |
|------|-----------|-------------|------------|-----------|
| `fk_wr_branch_financial` | `branch_financial_details_id` | `branch_financial_details` | `id` | SET NULL |
| `withdrawal_requests_ibfk_1` | `user_id` | `users` | `id` | CASCADE |
| `withdrawal_requests_ibfk_3` | `reviewed_by` | `users` | `id` | SET NULL |

**Lifecycle:** Created with `status = 'pending'` (`wallet.service.ts:118`). Admin updates via `withdrawal-request.repository.ts:48-55` — `updateStatus()` transitions to `approved`, `rejected`, or `cancelled`. Approval is followed by manual payout (external), then status updated to `completed`.

---

**Evidence:** All table schemas verified against `database/baseline/001_courtzon_v3.sql:1445-1457` (financial_journal_entries), `2066-2088` (payment_transactions), `3388-3398` (user_wallets), `3469-3485` (wallet_transactions), `3506-3525` (withdrawal_requests). Repository layer at `payment.repository.ts:8-211`, `wallet.repository.ts:21-122`, `withdrawal-request.repository.ts:7-56`.

---

## Organisation Entities

### organisations

The top-level organisation entity. Represents a club, gym, facility, academy, or seller organisation on the platform.

**Source:** `database/baseline/001_courtzon_v3.sql:1939-1969`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | NO | — | UUID for public reference |
| `org_type_id` | `int(10) unsigned` | NO | — | FK to `organisation_types` (club, gym, clinic, spa, etc.) |
| `owner_id` | `int(10) unsigned` | NO | — | FK to `users` — the organisation owner |
| `name` | `varchar(200)` | NO | — | Display name |
| `slug` | `varchar(200)` | NO | — | URL-friendly unique slug |
| `description` | `text` | YES | NULL | Organisation description |
| `logo_url` | `varchar(500)` | YES | NULL | Logo image URL |
| `cover_url` | `varchar(500)` | YES | NULL | Cover image URL |
| `documents` | `longtext` | YES | NULL | JSON array of uploaded verification documents |
| `email` | `varchar(255)` | YES | NULL | Contact email |
| `phone` | `varchar(25)` | YES | NULL | Contact phone |
| `website` | `varchar(255)` | YES | NULL | Website URL |
| `country_id` | `smallint(5) unsigned` | YES | NULL | FK to `countries` |
| `tax_id` | `varchar(100)` | YES | NULL | Tax/VAT registration number |
| `tax_id_type` | `varchar(50)` | YES | NULL | e.g. VAT, CR, TaxID |
| `cr_number` | `varchar(100)` | YES | NULL | Commercial registration number |
| `cancellation_policy_level` | `enum('organisation','branch')` | NO | 'organisation' | Whether policies apply org-wide or per-branch |
| `cancellation_before_hours` | `int(11)` | NO | 24 | Default cancellation notice period |
| `cancellation_fee_percentage` | `decimal(5,2)` | NO | 0.00 | Percentage-based cancellation fee |
| `cancellation_fee_fixed` | `decimal(12,2)` | NO | 0.00 | Fixed cancellation fee |
| `is_verified` | `tinyint(1)` | NO | 0 | Verification badge status |
| `is_active` | `tinyint(1)` | NO | 1 | Whether the org is active and visible |
| `rating_avg` | `decimal(3,2)` | NO | 0.00 | Average review rating |
| `rating_count` | `int(10) unsigned` | NO | 0 | Number of reviews |
| `version` | `int(10) unsigned` | NO | 1 | Optimistic concurrency version |
| `deleted_at` | `timestamp` | YES | NULL | Soft-delete timestamp |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `public_id` | `public_id` | UNIQUE | UUID lookup |
| UNIQUE `slug` | `slug` | UNIQUE | Slug uniqueness |
| `idx_org_country` | `country_id` | KEY | Country-based filtering |
| `idx_org_type` | `org_type_id` | KEY | Type-based filtering |
| `idx_owner` | `owner_id` | KEY | Owner lookup |

**Managed by:** `OrganisationRepository` (`organisation.repository.ts:8-252`)

---

### organisation_types

Classification types for organisations (club, gym, clinic, spa, sports_center, academy, etc.).

**Source:** `database/baseline/001_courtzon_v3.sql:1889-1901`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `slug` | `varchar(50)` | NO | — | e.g. club, gym, clinic, spa |
| `name` | `varchar(100)` | YES | NULL | Display name |
| `description` | `text` | YES | NULL | Description |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `sort_order` | `smallint(5) unsigned` | NO | 0 | Display order |

**Indexes:** UNIQUE `slug`

---

### branches

Physical locations belonging to an organisation. Each branch has its own address, operating hours, access type, and financial details.

**Source:** `database/baseline/001_courtzon_v3.sql:700-730`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | NO | — | UUID |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `name` | `varchar(200)` | NO | — | Branch name |
| `slug` | `varchar(200)` | NO | — | URL-friendly slug |
| `description` | `text` | YES | NULL | Branch description |
| `email` | `varchar(255)` | YES | NULL | Branch contact email |
| `phone` | `varchar(25)` | YES | NULL | Branch contact phone |
| `address_line1` | `varchar(255)` | YES | NULL | Street address |
| `address_line2` | `varchar(255)` | YES | NULL | Apartment/suite |
| `city` | `varchar(100)` | YES | NULL | City |
| `state` | `varchar(100)` | YES | NULL | State/province |
| `country_id` | `smallint(5) unsigned` | YES | NULL | FK to `countries` |
| `postal_code` | `varchar(20)` | YES | NULL | Postal/ZIP code |
| `latitude` | `decimal(10,7)` | YES | NULL | Geolocation latitude |
| `longitude` | `decimal(10,7)` | YES | NULL | Geolocation longitude |
| `access_type` | `enum('open','restricted','invite_only')` | NO | 'open' | Who can book without approval |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `rating_avg` | `decimal(3,2)` | NO | 0.00 | Average rating |
| `rating_count` | `int(10) unsigned` | NO | 0 | Review count |
| `images` | `longtext` | YES | NULL | JSON array of gallery photos |
| `currency_id` | `tinyint(3) unsigned` | YES | NULL | Override org currency |
| `timezone` | `varchar(50)` | YES | NULL | Override org timezone |
| `opening_time` | `time` | YES | '08:00:00' | Daily opening time |
| `closing_time` | `time` | YES | '22:00:00' | Daily closing time |
| `version` | `int(10) unsigned` | NO | 1 | Optimistic concurrency |
| `deleted_at` | `timestamp` | YES | NULL | Soft-delete |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `public_id` | `public_id` | UNIQUE | UUID lookup |
| UNIQUE `uk_branch_org_slug` | `organisation_id`, `slug` | UNIQUE | Slug per org |
| `idx_branch_org` | `organisation_id` | KEY | Org-level branch listing |

**Managed by:** `BranchRepository` (`branch.repository.ts`)

---

### resources

Bookable resources/courts within a branch. Each resource has a type (court, pool, treatment_room), optional sport association, pricing, slot configuration, and operating hours.

**Source:** `database/baseline/001_courtzon_v3.sql:2546-2576`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | NO | — | UUID |
| `branch_id` | `int(10) unsigned` | NO | — | FK to `branches` |
| `resource_type_id` | `int(10) unsigned` | NO | — | FK to `resource_types` |
| `sport_id` | `int(10) unsigned` | YES | NULL | FK to `sports` (NULL for non-sport resources) |
| `name` | `varchar(200)` | NO | — | Resource name (e.g. "Court 1") |
| `description` | `text` | YES | NULL | Resource description |
| `capacity` | `int(10) unsigned` | NO | 1 | Max players |
| `hourly_price` | `decimal(12,2)` | YES | NULL | Base hourly rate |
| `pricing_type` | `enum('per_hour','fixed')` | NO | 'per_hour' | Pricing model |
| `peak_hour_value` | `decimal(12,2)` | YES | NULL | Peak time rate override |
| `images` | `longtext` | YES | NULL | JSON array of images |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `slot_duration` | `int(10) unsigned` | YES | NULL | Override resource type default slot duration (minutes) |
| `max_bookings_per_slot` | `int(10) unsigned` | NO | 1 | Max concurrent bookings per slot |
| `opening_time` | `time` | YES | NULL | Per-resource opening time override |
| `closing_time` | `time` | YES | NULL | Per-resource closing time override |
| `version` | `int(10) unsigned` | NO | 1 | Optimistic concurrency |
| `deleted_at` | `timestamp` | YES | NULL | Soft-delete |

**Indexes:**

| Name | Columns | Type | Purpose |
|------|---------|------|---------|
| PRIMARY | `id` | PK | Row identity |
| UNIQUE `public_id` | `public_id` | UNIQUE | UUID lookup |
| `idx_branch` | `branch_id` | KEY | Branch resource listing |
| `idx_type` | `resource_type_id` | KEY | Type filtering |
| `idx_sport` | `sport_id` | KEY | Sport filtering |
| `idx_active` | `is_active`, `branch_id` | KEY | Active resource queries |

**Managed by:** `ResourceRepository` (`resource.repository.ts`)

---

### resource_types

Typology for resources (court, pool, jacuzzi, treatment_room, etc.).

**Source:** `database/baseline/001_courtzon_v3.sql:2510-2523`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `slug` | `varchar(50)` | NO | — | e.g. court, pool, jacuzzi, treatment_room |
| `name` | `varchar(100)` | NO | — | Display name |
| `has_slots` | `tinyint(1)` | NO | 1 | FALSE for appointment-based |
| `default_slot_duration` | `int(10) unsigned` | NO | 30 | Default slot length in minutes |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `sort_order` | `smallint(5) unsigned` | NO | 0 | Display order |

---

### branch_player_access

Player access requests and approvals for restricted/private branches. Tracks per-player access status per branch.

**Source:** `database/baseline/001_courtzon_v3.sql:670-678`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `branch_id` | `int(10) unsigned` | NO | — | FK to `branches` |
| `player_id` | `bigint(20) unsigned` | NO | — | FK to `users` |
| `status` | `enum('pending','approved','rejected','banned')` | NO | 'pending' | Access state |
| `review_note` | `varchar(500)` | YES | NULL | Admin's review note |
| `reviewed_by` | `bigint(20) unsigned` | YES | NULL | FK to `users` (reviewer) |
| `reviewed_at` | `timestamp` | YES | NULL | When reviewed |
| `created_at` | `timestamp` | NO | current_timestamp() | When requested |

**Indexes:** UNIQUE `uk_player_branch` (`player_id`, `branch_id`), idx on `branch_id`, `status`.

---

### coach_org_agreements

Agreement between a coach profile and an organisation defining revenue split and engagement terms.

**Source:** `database/baseline/001_courtzon_v3.sql:1000-1017`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `coach_id` | `int(10) unsigned` | NO | — | FK to `coach_profiles` |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `coach_split_pct` | `decimal(5,2)` | NO | — | Coach % after platform commission |
| `org_split_pct` | `decimal(5,2)` | NO | — | Org % after platform commission |
| `hourly_rate` | `decimal(12,2)` | YES | NULL | Agreed hourly rate |
| `is_active` | `tinyint(1)` | NO | 1 | Active flag |
| `status` | `enum('pending','accepted','rejected')` | NO | 'accepted' | Agreement state |
| `initiated_by` | `enum('coach','org')` | NO | 'coach' | Who initiated |
| `invited_by` | `int(10) unsigned` | YES | NULL | FK to `users` |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** UNIQUE `uk_coach_org` (`coach_id`, `organisation_id`)

**Managed by:** `org-portal.repository.ts:362-460`

---

### subscription_plans

Available subscription plans with pricing, feature allocations, and commission rates.

**Source:** `database/baseline/001_courtzon_v3.sql:2941-2954`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `plan_name` | `varchar(255)` | NO | — | Display name |
| `price_monthly` | `decimal(12,2)` | YES | NULL | Monthly price |
| `price_yearly` | `decimal(12,2)` | YES | NULL | Yearly price |
| `is_unlimited` | `tinyint(1)` | NO | 0 | Unlimited features |
| `features` | `longtext` | YES | NULL | Legacy JSON features |
| `applicable_org_types` | `longtext` | YES | NULL | JSON array of allowed org type IDs |
| `is_active` | `tinyint(1)` | NO | 1 | Available for assignment |
| `is_internal` | `tinyint(1)` | NO | 0 | Admin-only (hidden from public) |
| `sort_order` | `int(10) unsigned` | NO | 0 | Display order |

**Managed by:** `OrganisationService` (`organisation.service.ts:550-741`)

---

### subscription_plan_rates

Commission rates per entity type for each subscription plan.

**Source:** `database/baseline/001_courtzon_v3.sql:2926-2936`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `plan_id` | `bigint(20) unsigned` | NO | — | FK to `subscription_plans` |
| `applicable_entity` | `varchar(100)` | NO | — | Entity type (booking, tournament, marketplace, coach_session, academy) |
| `rate_type` | `enum('percentage','fixed')` | NO | 'percentage' | Rate calculation type |
| `amount` | `decimal(5,2)` | NO | — | Rate value |

**Indexes:** UNIQUE `uq_plan_entity` (`plan_id`, `applicable_entity`)

---

### organisation_subscriptions

Active/pending subscriptions linking an organisation to a plan with snapshot.

**Source:** `database/baseline/001_courtzon_v3.sql:1849-1866`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `plan_id` | `bigint(20) unsigned` | NO | — | FK to `subscription_plans` |
| `billing_cycle` | `enum('monthly','yearly')` | NO | 'monthly' | Billing period |
| `start_date` | `date` | YES | NULL | Subscription start |
| `end_date` | `date` | YES | NULL | Subscription end |
| `subscription_status` | `enum('active','expired','cancelled','pending')` | NO | 'pending' | Lifecycle state |
| `auto_renew` | `tinyint(1)` | YES | 1 | Auto-renew flag |
| `plan_snapshot` | `longtext` | YES | NULL | JSON snapshot of plan at activation |
| `last_reminder_sent` | `varchar(50)` | YES | NULL | Comma-separated reminder intervals sent |

**Indexes:** `idx_organisation`, `idx_plan`, `idx_status`

---

### organisation_upgrade_requests

Subscription upgrade/downgrade requests submitted by organisations and reviewed by admins.

**Source:** `database/baseline/001_courtzon_v3.sql:1906-1934`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `registration_type` | `enum('player','seller','organization','upgrade')` | NO | 'upgrade' | Request type category |
| `requested_by` | `int(10) unsigned` | NO | — | FK to `users` |
| `requested_org_type_id` | `int(10) unsigned` | YES | NULL | FK to `organisation_types` |
| `requested_plan_id` | `bigint(20) unsigned` | YES | NULL | FK to `subscription_plans` |
| `status` | `enum('pending','approved','rejected')` | NO | 'pending' | Current state |
| `notes` | `text` | YES | NULL | Request notes |
| `metadata` | `longtext` | YES | NULL | JSON metadata |
| `approved_by` | `int(10) unsigned` | YES | NULL | FK to `users` (admin) |
| `approved_at` | `timestamp` | YES | NULL | When approved/rejected |
| `request_type` | `varchar(50)` | YES | NULL | `NEW_SUBSCRIPTION` or `PLAN_CHANGE` |
| `current_plan_id` | `bigint(20) unsigned` | YES | NULL | Previous plan ID |
| `current_plan_name` | `varchar(255)` | YES | NULL | Previous plan name |
| `current_price` | `decimal(12,2)` | YES | NULL | Previous plan price |
| `current_billing_cycle` | `varchar(10)` | YES | NULL | Previous billing cycle |
| `requested_plan_name` | `varchar(255)` | YES | NULL | Requested plan name |
| `requested_price` | `decimal(12,2)` | YES | NULL | Requested plan price |
| `requested_billing_cycle` | `varchar(10)` | YES | NULL | Requested billing cycle |
| `approval_notes` | `text` | YES | NULL | Admin approval notes |
| `rejection_reason` | `text` | YES | NULL | Admin rejection reason |
| `cancelled_by` | `int(10) unsigned` | YES | NULL | FK to `users` |
| `cancelled_at` | `timestamp` | YES | NULL | When cancelled |
| `cancellation_reason` | `text` | YES | NULL | Cancellation reason |

---

### cancellation_policies

Cancellation and refund rules at org or branch level.

**Source:** `database/baseline/001_courtzon_v3.sql:762-774`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `branch_id` | `int(10) unsigned` | YES | NULL | FK to `branches` (NULL = org-level) |
| `organisation_id` | `bigint(20) unsigned` | YES | NULL | FK to `organisations` |
| `cancellation_window_minutes` | `int(11)` | NO | — | Minutes before start for valid cancellation |
| `refund_percent` | `decimal(5,2)` | NO | — | Percentage refunded |
| `is_active` | `tinyint(1)` | YES | 1 | Soft toggle |

**Indexes:** `idx_organisation`, `idx_branch`

**Managed by:** `CancellationPolicyRepository` (`cancellation-policy.repository.ts:7-98`)

---

### holidays (branch_holidays)

Holiday/unavailable periods for organisations, branches, or resources.

**Source:** `database/baseline/001_courtzon_v3.sql:1462-1477`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `owner_type` | `enum('organisation','branch','resource')` | NO | — | Scope of the holiday |
| `owner_id` | `int(10) unsigned` | NO | — | FK to the owner entity |
| `name` | `varchar(200)` | NO | — | Holiday name (e.g. Ramadan, Eid) |
| `date_from` | `date` | NO | — | Start date |
| `date_to` | `date` | NO | — | End date |
| `is_recurring` | `tinyint(1)` | NO | 0 | Recurring yearly |
| `is_open_modified` | `tinyint(1)` | NO | 0 | TRUE if hours differ on these days |
| `open_time` | `time` | YES | NULL | Modified opening time |
| `close_time` | `time` | YES | NULL | Modified closing time |

**Indexes:** `idx_holiday_owner` (`owner_type`, `owner_id`), `idx_holiday_dates` (`date_from`, `date_to`)

---

### branch_financial_details

Bank account and tax information per branch for settlement payouts.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `branch_id` | `int(10) unsigned` | NO | — | FK to `branches` |
| `account_holder_name` | `varchar(255)` | YES | NULL | Bank account holder |
| `account_number` | `varchar(100)` | YES | NULL | Bank account number |
| `bank_name` | `varchar(255)` | YES | NULL | Bank name |
| `iban` | `varchar(50)` | YES | NULL | IBAN |
| `swift_code` | `varchar(20)` | YES | NULL | SWIFT/BIC code |
| `tax_id` | `varchar(100)` | YES | NULL | Tax ID for this branch |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Managed by:** `BranchFinancialRepository` (`branch-financial.repository.ts`)

---

### organisation_attribute_values

EAV (Entity-Attribute-Value) storage for dynamic organisation attributes defined by `organisation_type_attributes`.

**Source:** `database/baseline/001_courtzon_v3.sql:1832-1844`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `attribute_id` | `int(10) unsigned` | NO | — | FK to `organisation_type_attributes` |
| `value` | `text` | NO | — | Attribute value |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** UNIQUE `uk_org_attr` (`organisation_id`, `attribute_id`)

---

### organisation_type_attributes

Dynamic attribute definitions per organisation type (EAV schema).

**Source:** `database/baseline/001_courtzon_v3.sql:1871-1884`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `org_type_id` | `int(10) unsigned` | NO | — | FK to `organisation_types` |
| `attribute_key` | `varchar(100)` | NO | — | Unique key per org type |
| `attribute_type` | `enum('text','number','boolean','select','multiselect','date','image')` | NO | — | Value type |
| `options` | `longtext` | YES | NULL | JSON for select/multiselect |
| `is_required` | `tinyint(1)` | NO | 0 | Required flag |
| `sort_order` | `smallint(5) unsigned` | NO | 0 | Display order |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |

**Indexes:** UNIQUE `uk_attr` (`org_type_id`, `attribute_key`)

---

### sports

Sports supported by the platform for resource classification, matchmaking, and marketplace filtering.

**Source:** `database/baseline/001_courtzon_v3.sql:2878-2891`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `name` | `varchar(100)` | NO | — | Sport name |
| `slug` | `varchar(100)` | NO | — | URL-friendly slug |
| `icon` | `varchar(100)` | YES | NULL | Icon identifier |
| `is_active` | `tinyint(1)` | NO | 1 | Active flag |
| `show_in_marketplace` | `tinyint(1)` | NO | 1 | Marketplace visibility |
| `sort_order` | `smallint(5) unsigned` | NO | 0 | Display order |
| `deleted_at` | `timestamp` | YES | NULL | Soft-delete |

**Indexes:** UNIQUE `slug`

**Managed by:** `OrganisationRepository` (`organisation.repository.ts:112-163`)

---

### organisation_coaches / org_announcements / organisation_reviews / organisation_verification_log

Additional org-related tables for coaches, announcements, reviews, and verification history. Schemas are defined in `database/baseline/001_courtzon_v3.sql`.

**Evidence:** All table schemas verified against `database/baseline/001_courtzon_v3.sql:670-678` (branch_player_access), `700-730` (branches), `762-774` (cancellation_policies), `1000-1017` (coach_org_agreements), `1462-1477` (holidays), `1832-1844` (organisation_attribute_values), `1849-1866` (organisation_subscriptions), `1871-1884` (organisation_type_attributes), `1889-1901` (organisation_types), `1906-1934` (organisation_upgrade_requests), `1939-1969` (organisations), `2510-2523` (resource_types), `2546-2576` (resources), `2878-2891` (sports), `2896-2936` (subscription_features/plan_features/plan_rates), `2941-2954` (subscription_plans). Repository layer at `organisation.repository.ts`, `branch.repository.ts`, `resource.repository.ts`, `org-portal.repository.ts`, `cancellation-policy.repository.ts`, `branch-financial.repository.ts`.

---

## Marketplace Entities

### products (marketplace_products)

The core product entity for the marketplace. Each product belongs to a seller (organisation) and a category.

**Source:** `database/baseline/001_courtzon_v3.sql` (marketplace tables section)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `seller_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `category_id` | `bigint(20) unsigned` | YES | NULL | FK to product_categories |
| `brand_id` | `bigint(20) unsigned` | YES | NULL | FK to brands |
| `sport_id` | `int(10) unsigned` | YES | NULL | FK to sports |
| `name` | `varchar(255)` | NO | — | Product name |
| `slug` | `varchar(255)` | YES | NULL | URL-friendly slug |
| `description` | `text` | YES | NULL | Product description |
| `price` | `decimal(12,2)` | NO | — | Base price |
| `discounted_price` | `decimal(12,2)` | YES | NULL | Sale/discounted price |
| `currency_code` | `varchar(3)` | YES | 'EGP' | Currency |
| `status` | `enum('draft','pending','active','sold_out','archived')` | NO | 'draft' | Product lifecycle status |
| `condition_status` | `varchar(50)` | YES | NULL | e.g. new, used, refurbished |
| `gender` | `varchar(50)` | YES | NULL | Target gender filter |
| `images` | `longtext` | YES | NULL | JSON array of image URLs |
| `video_url` | `varchar(500)` | YES | NULL | Product video URL |
| `quantity` | `int(11)` | NO | 0 | Total stock across variants |
| `min_stock_level` | `int(11)` | YES | NULL | Low-stock threshold |
| `max_stock_level` | `int(11)` | YES | NULL | Reorder point |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_seller`, `idx_category`, `idx_status`, `idx_seller_status`

---

### product_variants

Variant options for products (size, color, etc.). Each variant has its own stock level and price adjustment.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `variant_type` | `varchar(100)` | NO | — | e.g. Size, Color |
| `variant_name` | `varchar(255)` | NO | — | e.g. Large, Red |
| `variant_color` | `varchar(50)` | YES | NULL | Hex color code for color swatches |
| `sku` | `varchar(100)` | YES | NULL | Stock keeping unit |
| `price_adjustment` | `decimal(12,2)` | YES | 0.00 | Price delta from base product price |
| `quantity` | `int(11)` | NO | 0 | Current stock level |
| `cost_price` | `decimal(12,2)` | YES | NULL | Cost per unit for margin calculation |
| `min_stock_level` | `int(11)` | YES | NULL | Low-stock threshold |
| `max_stock_level` | `int(11)` | YES | NULL | Reorder point |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_product`, `idx_sku`

---

### product_categories

Hierarchical product categories for the marketplace.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `parent_id` | `bigint(20) unsigned` | YES | NULL | Self-referential FK for hierarchy |
| `name` | `varchar(255)` | NO | — | Category name |
| `slug` | `varchar(255)` | NO | — | URL-friendly slug |
| `description` | `text` | YES | NULL | Category description |
| `image` | `varchar(500)` | YES | NULL | Category image URL |
| `sort_order` | `int(11)` | NO | 0 | Display order |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |

**Indexes:** PRIMARY, `idx_parent`

---

### product_images

Individual product images (alternative to JSON array in products.images).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `image_url` | `varchar(500)` | NO | — | Image URL |
| `sort_order` | `int(11)` | NO | 0 | Display order |
| `is_primary` | `tinyint(1)` | NO | 0 | Primary/featured image flag |

---

### product_reviews

Customer reviews and ratings for products.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to users |
| `rating` | `tinyint(3) unsigned` | NO | 5 | Rating 1-5 |
| `review_text` | `text` | YES | NULL | Review content |
| `is_approved` | `tinyint(1)` | NO | 0 | Admin approval flag |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_product`, `idx_user`

---

### product_specifications

Key-value product specifications/attributes.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `spec_key` | `varchar(255)` | NO | — | Specification name |
| `spec_value` | `text` | NO | — | Specification value |

**Indexes:** PRIMARY, `idx_product`

---

### related_products

Cross-sell and up-sell product relationships.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `related_product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `relation_type` | `enum('cross_sell','up_sell','accessory')` | YES | 'cross_sell' | Relationship type |

---

### tags

Marketplace tags for product filtering and discovery.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `name` | `varchar(100)` | NO | — | Tag name |
| `slug` | `varchar(100)` | NO | — | URL-friendly slug |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |

---

### product_tags

Many-to-many join between products and tags.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `tag_id` | `bigint(20) unsigned` | NO | — | FK to tags |

**Indexes:** UNIQUE `uk_product_tag` (`product_id`, `tag_id`)

---

### brands

Product brands for the marketplace.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `name` | `varchar(255)` | NO | — | Brand name |
| `slug` | `varchar(255)` | NO | — | URL-friendly slug |
| `logo` | `varchar(500)` | YES | NULL | Brand logo URL |
| `description` | `text` | YES | NULL | Brand description |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |

---

### orders

Marketplace orders. Tracks the full order lifecycle with financial columns.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | YES | NULL | UUID for public reference |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to users (buyer) |
| `status` | `enum('pending','confirmed','processing','shipped','delivered','cancelled','refunded')` | NO | 'pending' | Current order status |
| `subtotal` | `decimal(12,2)` | NO | 0.00 | Product total before discounts |
| `discount_amount` | `decimal(12,2)` | YES | 0.00 | Coupon discount amount |
| `shipping_cost` | `decimal(12,2)` | YES | 0.00 | Total shipping cost |
| `total` | `decimal(12,2)` | NO | — | Grand total |
| `currency_code` | `varchar(3)` | YES | 'EGP' | Currency |
| `payment_method` | `varchar(50)` | YES | NULL | cash, card, wallet |
| `payment_status` | `varchar(50)` | YES | 'pending' | Payment processing status |
| `shipping_address_id` | `bigint(20) unsigned` | YES | NULL | FK to saved shipping address |
| `shipping_address_snapshot` | `longtext` | YES | NULL | JSON snapshot of address at order time |
| `province_name` | `varchar(255)` | YES | NULL | Denormalized province name |
| `tracking_number` | `varchar(255)` | YES | NULL | Carrier tracking number |
| `shipping_carrier` | `varchar(255)` | YES | NULL | Carrier name |
| `estimated_delivery_date` | `date` | YES | NULL | Estimated delivery date |
| `courtzon_commission` | `decimal(12,2)` | YES | 0.00 | Platform commission amount |
| `courtzon_fee` | `decimal(12,2)` | YES | 0.00 | Platform fee amount |
| `org_product_share` | `decimal(12,2)` | YES | 0.00 | Org product revenue share |
| `org_shipping_share` | `decimal(12,2)` | YES | 0.00 | Org shipping revenue share |
| `cash_holder` | `varchar(50)` | YES | 'courtzon' | Who holds the cash (org/courtzon) |
| `cash_collection_status` | `varchar(50)` | YES | 'under_collection' | Cash collection state |
| `aggregate_version` | `int(11)` | YES | 1 | Optimistic concurrency version |
| `settlement_status` | `varchar(50)` | YES | 'pending' | Settlement state (pending/settled) |
| `notes` | `text` | YES | NULL | Order notes |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_user`, `idx_status`, `idx_public_id`, `idx_created_at`

---

### order_items

Individual line items within an order.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `order_id` | `bigint(20) unsigned` | NO | — | FK to orders |
| `seller_id` | `bigint(20) unsigned` | NO | — | FK to organisations (seller) |
| `variant_id` | `bigint(20) unsigned` | YES | NULL | FK to product_variants |
| `product_name` | `varchar(255)` | NO | — | Snapshot at order time |
| `variant_name` | `varchar(255)` | YES | NULL | Variant name snapshot |
| `quantity` | `int(11)` | NO | — | Quantity ordered |
| `unit_price` | `decimal(12,2)` | NO | — | Price per unit |
| `total_price` | `decimal(12,2)` | NO | — | quantity × unit_price |
| `commission_amount` | `decimal(12,2)` | YES | 0.00 | Commission on this item |
| `commission_rate` | `decimal(5,2)` | YES | 0.00 | Commission rate applied |
| `settlement_status` | `varchar(50)` | YES | 'pending' | Settlement state per item |
| `images` | `text` | YES | NULL | Product image snapshot |
| `shop_name` | `varchar(255)` | YES | NULL | Seller shop name snapshot |

**Indexes:** PRIMARY, `idx_order`, `idx_seller`

---

### order_status_history

Audit trail of all order status transitions.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `order_id` | `bigint(20) unsigned` | NO | — | FK to orders |
| `from_status` | `varchar(50)` | YES | NULL | Previous status |
| `to_status` | `varchar(50)` | NO | — | New status |
| `changed_by` | `bigint(20) unsigned` | NO | — | FK to users |
| `changed_by_role` | `varchar(50)` | NO | — | buyer, seller, admin, system |
| `note` | `text` | YES | NULL | Transition note |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_order`

---

### cart_items

Individual items in a user's shopping cart.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `cart_id` | `bigint(20) unsigned` | NO | — | FK to carts |
| `variant_id` | `bigint(20) unsigned` | YES | NULL | FK to product_variants |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `quantity` | `int(11)` | NO | 1 | Quantity |

**Indexes:** PRIMARY, `idx_cart`

---

### wishlist_items

Products saved by users to their wishlist.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to users |
| `product_id` | `bigint(20) unsigned` | NO | — | FK to marketplace_products |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** UNIQUE `uk_user_product` (`user_id`, `product_id`)

---

### seller_profiles

Seller-specific profile settings and metadata.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `shop_name` | `varchar(255)` | YES | NULL | Public shop display name |
| `shop_description` | `text` | YES | NULL | Shop description |
| `shop_logo` | `varchar(500)` | YES | NULL | Shop logo URL |
| `shop_banner` | `varchar(500)` | YES | NULL | Shop banner URL |
| `is_active` | `tinyint(1)` | NO | 1 | Selling enabled flag |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

---

### seller_shipping_rates

Per-seller shipping rates by province and city.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `seller_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `province_id` | `int(10) unsigned` | NO | — | FK to provinces |
| `city_id` | `int(10) unsigned` | YES | NULL | FK to cities (NULL = province-wide) |
| `rate` | `decimal(12,2)` | NO | — | Shipping cost |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |

**Indexes:** UNIQUE `uk_seller_province_city`

---

### coupons

Discount coupons for marketplace orders.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `code` | `varchar(100)` | NO | — | Unique coupon code |
| `discount_type` | `enum('percentage','fixed')` | NO | — | Discount calculation type |
| `discount_value` | `decimal(12,2)` | NO | — | Discount amount or percentage |
| `min_order_amount` | `decimal(12,2)` | YES | NULL | Minimum order subtotal |
| `max_uses` | `int(11)` | YES | NULL | Global usage limit |
| `max_uses_per_user` | `int(11)` | YES | NULL | Per-user usage limit |
| `starts_at` | `datetime` | YES | NULL | Validity window start |
| `expires_at` | `datetime` | YES | NULL | Validity window end |
| `is_active` | `tinyint(1)` | NO | 0 | Published status |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** UNIQUE `uk_code`

---

### marketplace_ledger_entries

Financial ledger entries for marketplace transactions (fees, commissions).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `order_id` | `bigint(20) unsigned` | NO | — | FK to orders |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `entry_type` | `varchar(100)` | NO | — | e.g. due_to_courtzon, org_revenue |
| `payment_method` | `varchar(50)` | NO | — | cod, online |
| `amount` | `decimal(12,2)` | NO | — | Entry amount |
| `currency_code` | `varchar(3)` | NO | 'EGP' | Currency |
| `description` | `text` | YES | NULL | Description |
| `metadata` | `longtext` | YES | NULL | JSON metadata |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

---

### settlements

Marketplace settlement records for seller payouts.

**See TECH-MOD-30** for full schema.

---

### settlement_orders

Links settlements to individual orders with per-order financial breakdown.

**See TECH-MOD-30** for full schema.

---

### settlement_transfers

Transfer records for settlement payouts.

**See TECH-MOD-30** for full schema.

---

## Inventory Entities

### warehouses

Physical stock locations per organisation.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `name` | `varchar(255)` | NO | — | Warehouse name |
| `location` | `varchar(255)` | YES | NULL | Physical location |
| `status` | `enum('active','inactive')` | NO | 'active' | Operational status |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

---

### suppliers

Product suppliers for purchase orders.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `name` | `varchar(255)` | NO | — | Supplier name |
| `contact_name` | `varchar(255)` | YES | NULL | Primary contact |
| `email` | `varchar(255)` | YES | NULL | Contact email |
| `phone` | `varchar(50)` | YES | NULL | Contact phone |
| `payment_terms` | `varchar(100)` | YES | NULL | e.g. Net 30 |
| `lead_time_days` | `int(11)` | YES | NULL | Estimated delivery days |
| `status` | `enum('active','inactive')` | NO | 'active' | Operational status |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

---

### purchase_orders

Purchase orders for restocking inventory.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `bigint(20) unsigned` | NO | — | FK to organisations |
| `supplier_id` | `bigint(20) unsigned` | NO | — | FK to suppliers |
| `warehouse_id` | `bigint(20) unsigned` | NO | — | FK to warehouses |
| `status` | `enum('draft','submitted','approved','received','cancelled')` | NO | 'draft' | PO lifecycle state |
| `total_cost` | `decimal(12,2)` | YES | 0.00 | Total PO cost |
| `notes` | `text` | YES | NULL | PO notes |
| `created_by` | `bigint(20) unsigned` | NO | — | FK to users |
| `received_at` | `timestamp` | YES | NULL | When fully received |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_organisation`, `idx_supplier`, `idx_status`

---

### purchase_order_items

Individual line items within a purchase order.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `purchase_order_id` | `bigint(20) unsigned` | NO | — | FK to purchase_orders |
| `variant_id` | `bigint(20) unsigned` | NO | — | FK to product_variants |
| `quantity` | `int(11)` | NO | — | Ordered quantity |
| `unit_cost` | `decimal(12,2)` | NO | — | Cost per unit |
| `total_cost` | `decimal(12,2)` | NO | — | quantity × unit_cost |
| `received_qty` | `int(11)` | YES | 0 | Quantity received so far |

**Indexes:** PRIMARY, `idx_purchase_order`

---

### stock_transfers

Stock transfers between warehouses.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `variant_id` | `bigint(20) unsigned` | NO | — | FK to product_variants |
| `from_warehouse_id` | `bigint(20) unsigned` | NO | — | Source warehouse |
| `to_warehouse_id` | `bigint(20) unsigned` | NO | — | Destination warehouse |
| `quantity` | `int(11)` | NO | — | Transfer quantity |
| `status` | `enum('pending','completed','cancelled')` | NO | 'pending' | Transfer state |
| `created_by` | `bigint(20) unsigned` | NO | — | FK to users |
| `completed_at` | `timestamp` | YES | NULL | When completed |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_from_warehouse`, `idx_to_warehouse`, `idx_status`

---

### inventory_logs

Immutable ledger of all stock movements with before/after snapshots.

**Source:** `database/migrations/067_marketplace_inventory.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `variant_id` | `bigint(20) unsigned` | NO | — | FK to product_variants |
| `warehouse_id` | `bigint(20) unsigned` | YES | NULL | FK to warehouses |
| `movement_type` | `enum('in','out','adjustment','reservation','release','return')` | NO | — | Type of movement |
| `quantity` | `int(11)` | NO | — | Movement quantity |
| `stock_before` | `int(11)` | NO | — | Stock level before movement |
| `stock_after` | `int(11)` | NO | — | Stock level after movement |
| `reason` | `varchar(255)` | YES | NULL | Reason for movement |
| `reference_type` | `varchar(50)` | YES | NULL | Source document type |
| `reference_id` | `bigint(20) unsigned` | YES | NULL | Source document ID |
| `created_by` | `bigint(20) unsigned` | YES | NULL | FK to users |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_variant`, `idx_warehouse`, `idx_movement_type`, `idx_reference`, `idx_created_at`

---

**Evidence:** All marketplace entities verified against `database/baseline/001_courtzon_v3.sql` and `database/migrations/067_marketplace_inventory.sql`. Repository and service layer at `backend/src/modules/marketplace/` and `backend/src/modules/settlement/`.

---

## Academy Entities

### academy_programs

The core program entity for academy courses. Each program has a category, capacity, pricing model, and a stateful lifecycle.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | bigint(20) unsigned | NO | auto_increment | Primary key |
| `code` | varchar(50) | NO | — | Unique program code |
| `name` | varchar(200) | NO | — | Display name |
| `description` | text | YES | NULL | Program description |
| `category` | varchar(100) | NO | — | Sport/category classification |
| `level` | varchar(50) | YES | NULL | Skill level (beginner, intermediate, advanced) |
| `season` | varchar(50) | YES | NULL | Season tag (e.g. "2025-Spring") |
| `capacity` | int(11) | NO | 0 | Max enrollments (0 = unlimited) |
| `price` | decimal(12,2) | NO | 0.00 | Enrollment fee |
| `currency` | char(3) | NO | 'USD' | ISO 4217 currency |
| `price_type` | enum('FREE','FIXED','MEMBERS_ONLY') | NO | 'FIXED' | Pricing model |
| `status` | enum('draft','published','open','full','running','completed','cancelled','archived') | NO | 'draft' | Program lifecycle state |
| `is_public` | tinyint(1) | NO | 1 | Public visibility flag |
| `archived_at` | datetime | YES | NULL | Archived timestamp |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_program_code` (`code`), `idx_program_status` (`status`), `idx_program_category` (`category`)

**Managed by:** `program.repository.ts` — CRUD, listing with search/category/status filters, dashboard aggregation.

---

### academy_groups

Class divisions within a program. Each group belongs to one program, has an optional coach assignment, and capacity limit independent of the program.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | bigint(20) unsigned | NO | auto_increment | Primary key |
| `program_id` | bigint(20) unsigned | NO | — | FK to `academy_programs` |
| `name` | varchar(200) | NO | — | Group name |
| `coach_id` | bigint(20) unsigned | YES | NULL | FK to `users` — assigned coach |
| `capacity` | int(11) | NO | 0 | Max enrollments in this group |
| `status` | enum('active','inactive','archived') | NO | 'active' | Group status |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_group_program` (`program_id`), `idx_group_coach` (`coach_id`)

**Managed by:** `group.repository.ts` — CRUD, list by program, coach assignment.

---

### academy_enrollments

Player registration records for academy programs. Supports waiting list via `waiting_order`. Status transitions validated by `lifecycle.ts`.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | bigint(20) unsigned | NO | auto_increment | Primary key |
| `player_id` | bigint(20) unsigned | NO | — | FK to `users` — the enrolled player |
| `program_id` | bigint(20) unsigned | NO | — | FK to `academy_programs` |
| `group_id` | bigint(20) unsigned | YES | NULL | FK to `academy_groups` |
| `membership_id` | bigint(20) unsigned | YES | NULL | FK to membership plans |
| `status` | enum('pending','confirmed','waiting','cancelled','completed') | NO | 'pending' | Enrollment lifecycle state |
| `waiting_order` | int(11) | YES | NULL | Position in waiting list |
| `enrolled_at` | datetime | YES | NULL | When enrollment was created |
| `cancelled_at` | datetime | YES | NULL | When cancelled |
| `completed_at` | datetime | YES | NULL | When completed |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_enrollment_player` (`player_id`), `idx_enrollment_program` (`program_id`), `idx_enrollment_group` (`group_id`), UNIQUE `uk_player_program` (`player_id`, `program_id`) (partial for active statuses)

**Managed by:** `enrollment.repository.ts` — CRUD, capacity checks, waiting list order, group move, audit log queries.

---

### academy_enrollments_legacy

Migration/backup table for enrollment records from earlier schema versions. Preserved for historical data continuity.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int(11) | Legacy PK |
| `user_id` | int(11) | Legacy user reference |
| `program_id` | int(11) | Legacy program reference |
| `group_id` | int(11) | Legacy group reference |
| `status` | varchar(50) | Legacy status string |
| `created_at` | datetime | Original creation timestamp |

---

### academy_group_sessions

Scheduled class meetings for a group. Each session has a date, optional court/coach assignment, and its own status lifecycle.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | bigint(20) unsigned | NO | auto_increment | Primary key |
| `group_id` | bigint(20) unsigned | NO | — | FK to `academy_groups` |
| `session_date` | date | NO | — | Date of the session |
| `start_time` | time | YES | NULL | Session start time |
| `end_time` | time | YES | NULL | Session end time |
| `court_id` | int(10) unsigned | YES | NULL | FK to `resources` |
| `coach_id` | bigint(20) unsigned | YES | NULL | FK to `users` — session coach |
| `status` | enum('scheduled','in_progress','completed','cancelled') | NO | 'scheduled' | Session status |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_session_group` (`group_id`), `idx_session_date` (`session_date`), `idx_session_court` (`court_id`)

**Managed by:** Group sessions CRUD via academy DTO (`CreateGroupSessionSchema`, `UpdateGroupSessionSchema`).

---

### academy_attendance

Immutable attendance records for group sessions. One record per enrollment per session (unique constraint prevents duplicates). Once created, only attendance_status and notes can be updated.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | bigint(20) unsigned | NO | auto_increment | Primary key |
| `group_session_id` | bigint(20) unsigned | NO | — | FK to `academy_group_sessions` |
| `enrollment_id` | bigint(20) unsigned | NO | — | FK to `academy_enrollments` |
| `attendance_status` | enum('present','absent','excused','late') | NO | 'present' | Attendance value |
| `notes` | text | YES | NULL | Free-text notes |
| `created_at` | timestamp | NO | current_timestamp() | Immutable creation timestamp |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_session_enrollment` (`group_session_id`, `enrollment_id`), `idx_attendance_session` (`group_session_id`)

**Managed by:** `attendance.repository.ts` — single and bulk record, update, summary aggregation.

**Evidence:** All academy table schemas verified against `database/baseline/001_courtzon_v3.sql`. Repository implementations at `backend/src/modules/academy/infrastructure/repositories/`. Types at `domain/academy.types.ts:1-87`.

---

## Tournament Entities

### tournaments

The central tournament entity. Supports 7 formats and 5 registration types. Status lifecycle validated by `lifecycle.ts`.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `code` | varchar(50) | NO | — | Unique tournament code |
| `name` | varchar(200) | NO | — | Display name |
| `description` | text | YES | NULL | Description |
| `format` | varchar(50) | NO | 'knockout' | Tournament format |
| `sport_id` | int(10) unsigned | NO | — | FK to `sports` |
| `organisation_id` | int(10) unsigned | YES | NULL | FK to `organisations` |
| `branch_id` | int(10) unsigned | YES | NULL | FK to `branches` |
| `category` | varchar(100) | YES | NULL | Category tag |
| `season` | varchar(100) | YES | NULL | Season tag |
| `status` | enum('draft','published','registration_open','registration_closed','running','completed','cancelled','archived') | NO | 'draft' | Tournament lifecycle state |
| `registration_type` | varchar(50) | NO | 'public' | individual, team, academy, invitation, public |
| `max_players` | int(11) | YES | NULL | Participant capacity |
| `max_teams` | int(11) | YES | NULL | Team capacity |
| `current_players` | int(11) | YES | 0 | Denormalized participant count |
| `current_teams` | int(11) | YES | 0 | Denormalized team count |
| `registration_fee` | decimal(12,2) | YES | 0.00 | Fee amount |
| `price_type` | varchar(50) | YES | NULL | Pricing model |
| `currency` | char(3) | YES | 'USD' | Currency |
| `is_public` | tinyint(1) | YES | 1 | Visibility |
| `registration_open_at` | datetime | YES | NULL | Registration window start |
| `registration_close_at` | datetime | YES | NULL | Registration window end |
| `start_date` | date | YES | NULL | Tournament start |
| `end_date` | date | YES | NULL | Tournament end |
| `match_duration_minutes` | int(11) | YES | NULL | Per-match duration |
| `rules` | text | YES | NULL | Rules |
| `prize_description` | text | YES | NULL | Prize info |
| `metadata` | longtext | YES | NULL | Extensible JSON |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_tournament_code` (`code`), `idx_tournament_status` (`status`), `idx_tournament_sport` (`sport_id`), `idx_tournament_org` (`organisation_id`)

**Managed by:** `tournament.repository.ts` — CRUD, listings, dashboard, bracket queries.

---

### tournament_bracket_types

Seed data for supported bracket formats. Defines 4 types: single elimination, double elimination, round robin, swiss.

**Source:** Seed data in `database/seeds/001_baseline.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `slug` | varchar(50) | NO | — | Unique machine name |
| `name` | varchar(100) | NO | — | Display name |
| `description` | text | YES | NULL | Description |

**Seed data:**

| Slug | Name | Description |
|------|------|-------------|
| `single_elimination` | Single Elimination | Standard knockout — each loss eliminates |
| `double_elimination` | Double Elimination | Losers bracket — eliminated after 2 losses |
| `round_robin` | Round Robin | All participants play each other |
| `swiss` | Swiss System | Paired based on current standings |

---

### tournament_registrations

Participant registration records for tournaments. Supports individual and team registration, seeding, and waiting list.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `tournament_id` | int(10) unsigned | NO | — | FK to `tournaments` |
| `user_id` | int(10) unsigned | YES | NULL | FK to `users` — individual registrant |
| `team_id` | int(10) unsigned | YES | NULL | FK for team registration |
| `team_name` | varchar(200) | YES | NULL | Team name |
| `seed` | int(11) | NO | 0 | Seeding position |
| `status` | enum('pending','confirmed','waiting','cancelled','completed') | NO | 'pending' | Registration lifecycle state |
| `waiting_order` | int(11) | YES | NULL | Position in waiting list |
| `registered_at` | datetime | NO | — | Registration timestamp |
| `confirmed_at` | datetime | YES | NULL | Confirmation timestamp |
| `checked_in_at` | datetime | YES | NULL | Check-in timestamp |

**Indexes:** PRIMARY (`id`), `idx_reg_tournament` (`tournament_id`), `idx_reg_user` (`user_id`), `idx_reg_status` (`status`), UNIQUE `uk_reg_user_tournament` (`user_id`, `tournament_id`)

---

### tournament_matches

Individual match records within a tournament. Stores round, bracket position, players, winner, court/referee assignment, and status.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `tournament_id` | int(10) unsigned | NO | — | FK to `tournaments` |
| `round` | int(11) | NO | — | Round number |
| `group_id` | int(10) unsigned | YES | NULL | FK to `tournament_groups` |
| `bracket_position` | int(11) | YES | NULL | Position in bracket tree |
| `player1_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `player2_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `winner_id` | int(10) unsigned | YES | NULL | FK to winner |
| `status` | enum('scheduled','in_progress','completed','walkover','forfeit','no_show') | NO | 'scheduled' | Match status |
| `court_id` | int(10) unsigned | YES | NULL | FK to `resources` |
| `referee_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `scheduled_at` | datetime | YES | NULL | Scheduled time |
| `started_at` | datetime | YES | NULL | Actual start |
| `completed_at` | datetime | YES | NULL | Actual completion |
| `notes` | text | YES | NULL | Match notes |

**Indexes:** PRIMARY (`id`), `idx_match_tournament` (`tournament_id`), `idx_match_group` (`group_id`), `idx_match_round` (`round`)

---

### tournament_match_scores

Per-player score records within a match. Supports individual scoring breakdowns.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `match_id` | int(10) unsigned | FK to `tournament_matches` |
| `player_id` | int(10) unsigned | FK to `users` |
| `score` | varchar(50) | Individual score |
| `position` | tinyint(4) | Player position |

---

### tournament_match_players

Junction table linking players to tournament matches (for team-based or multi-player matches).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `match_id` | int(10) unsigned | FK to `tournament_matches` |
| `player_id` | int(10) unsigned | FK to `users` |
| `team_id` | int(10) unsigned | FK for team affiliation |

---

### tournament_match_results

Result record for a completed match. Stores winner, home/away scores, and score details (JSON string for flexible score formats like tie-breaks).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `match_id` | int(10) unsigned | NO | — | FK to `tournament_matches` (1:1) |
| `winner_id` | int(10) unsigned | YES | NULL | FK to winner |
| `home_score` | int(11) | YES | NULL | Home/player1 score |
| `away_score` | int(11) | YES | NULL | Away/player2 score |
| `score_details` | varchar(500) | YES | NULL | Extended score JSON |
| `entered_by` | int(10) unsigned | NO | — | FK to `users` — who entered |
| `entered_at` | datetime | NO | — | Entry timestamp |

---

### tournament_groups

Group stage groups within a tournament. Each group has an advance count specifying how many teams advance to knockout.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `tournament_id` | int(10) unsigned | NO | — | FK to `tournaments` |
| `name` | varchar(100) | NO | — | Group name/letter |
| `advance_count` | int(11) | NO | 0 | Teams advancing to knockout |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |

---

### tournament_group_members

Membership records linking registrations to groups.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Description |
|--------|------|-------------|
| `id` | int(10) unsigned | PK |
| `group_id` | int(10) unsigned | FK to `tournament_groups` |
| `registration_id` | int(10) unsigned | FK to `tournament_registrations` |
| `seed` | int(11) | Seeding within group |

---

### tournament_standings

Persisted standing rows for each tournament/group. Recalculated after every confirmed match result.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `tournament_id` | int(10) unsigned | NO | — | FK to `tournaments` |
| `group_id` | int(10) unsigned | YES | NULL | FK to `tournament_groups` |
| `registration_id` | int(10) unsigned | YES | NULL | FK to `tournament_registrations` |
| `player_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `team_id` | int(10) unsigned | YES | NULL | FK for team standings |
| `points` | int(11) | NO | 0 | Accumulated points |
| `wins` | int(11) | NO | 0 | Wins count |
| `losses` | int(11) | NO | 0 | Losses count |
| `draws` | int(11) | NO | 0 | Draws count |
| `games_for` | int(11) | NO | 0 | Points/Goals for |
| `games_against` | int(11) | NO | 0 | Points/Goals against |
| `position` | int(11) | NO | 0 | Rank position |
| `played` | int(11) | NO | 0 | Matches played |

**Indexes:** PRIMARY (`id`), `idx_standing_tournament` (`tournament_id`), `idx_standing_group` (`group_id`)

---

### elo_ratings

ELO rating tracking per player per sport. Updated after tournament match results.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `player_id` | int(10) unsigned | NO | — | FK to `users` |
| `sport_id` | int(10) unsigned | NO | — | FK to `sports` |
| `rating` | int(11) | NO | 1200 | Current ELO rating |
| `matches_played` | int(11) | NO | 0 | Total matches |
| `last_updated` | timestamp | NO | current_timestamp() | Last update |

**Indexes:** UNIQUE `uk_player_sport_elo` (`player_id`, `sport_id`)

**Evidence:** All tournament table schemas verified against `database/baseline/001_courtzon_v3.sql`. Repository at `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts`. Domain logic at `domain/tournament-aggregate.ts:137-209` (bracket generation, standings).

---

## League Entities

### seasons

Seasonal containers for leagues. Each season has a date range and a 5-state lifecycle.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `code` | varchar(50) | NO | — | Unique code |
| `name` | varchar(200) | NO | — | Display name |
| `description` | text | YES | NULL | Season description |
| `sport_id` | int(10) unsigned | YES | NULL | FK to `sports` |
| `start_date` | date | NO | — | Season start |
| `end_date` | date | YES | NULL | Season end |
| `status` | enum('draft','published','running','completed','archived') | NO | 'draft' | Season lifecycle |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_season_code` (`code`)

**Managed by:** `season.repository.ts` — CRUD, status transitions, listing.

---

### leagues

League entities within a season. Supports round-robin and double-round-robin formats, configurable points per win/draw.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `season_id` | int(10) unsigned | NO | — | FK to `seasons` |
| `code` | varchar(50) | NO | — | Unique code |
| `name` | varchar(200) | NO | — | Display name |
| `description` | text | YES | NULL | Description |
| `sport_id` | int(10) unsigned | YES | NULL | FK to `sports` |
| `format` | enum('round_robin','double_round_robin') | NO | 'round_robin' | Fixture generation format |
| `max_teams` | int(11) | NO | 0 | Team capacity (0 = unlimited) |
| `registration_fee` | decimal(12,2) | NO | 0.00 | Team registration fee |
| `price_type` | enum('FREE','FIXED','MEMBERS_ONLY') | NO | 'FIXED' | Pricing model |
| `currency` | char(3) | NO | 'USD' | Currency |
| `status` | enum('draft','registration_open','registration_closed','running','completed','cancelled','archived') | NO | 'draft' | League lifecycle |
| `is_public` | tinyint(1) | NO | 1 | Public visibility |
| `points_per_win` | int(11) | NO | 3 | Points awarded per win |
| `points_per_draw` | int(11) | NO | 1 | Points awarded per draw |
| `archived_at` | datetime | YES | NULL | Archived timestamp |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_league_code` (`code`), `idx_league_season` (`season_id`), `idx_league_status` (`status`)

**Managed by:** `league.repository.ts` — CRUD, status transitions, team registration.

---

### league_divisions

Tiered divisions within a league. Each division has promotion/relegation parameters (`advance_count`, `relegation_count`).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `league_id` | int(10) unsigned | NO | — | FK to `leagues` |
| `name` | varchar(200) | NO | — | Division name |
| `tier` | int(11) | NO | 1 | Numeric tier (1 = highest) |
| `capacity` | int(11) | NO | 0 | Team capacity |
| `advance_count` | int(11) | NO | 0 | Teams promoted per season |
| `relegation_count` | int(11) | NO | 0 | Teams relegated per season |
| `status` | enum('active','inactive','archived') | NO | 'active' | Division status |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY (`id`), `idx_division_league` (`league_id`), `idx_division_tier` (`tier`)

**Managed by:** `division.repository.ts` — CRUD, promotion/relegation operations.

---

### league_teams

Team registration records within a division. Supports waiting list and seeding.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `division_id` | int(10) unsigned | NO | — | FK to `league_divisions` |
| `team_name` | varchar(200) | NO | — | Team display name |
| `captain_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `player_ids` | longtext | YES | NULL | JSON array of player IDs |
| `status` | enum('pending','confirmed','waiting','cancelled','withdrawn') | NO | 'pending' | Team registration state |
| `waiting_order` | int(11) | YES | NULL | Waiting list position |
| `seed` | int(11) | YES | NULL | Seeding position |
| `registered_at` | datetime | NO | — | Registration timestamp |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY (`id`), `idx_team_division` (`division_id`), `idx_team_status` (`status`)

**Managed by:** Team registration via `league.service.ts:65-156` (registerTeam, confirmRegistration, cancelRegistration).

---

### league_matches

Scheduled league matches within a division. Each match connects two teams in a specific round.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `division_id` | int(10) unsigned | NO | — | FK to `league_divisions` |
| `home_team_id` | int(10) unsigned | NO | — | FK to `league_teams` |
| `away_team_id` | int(10) unsigned | NO | — | FK to `league_teams` |
| `round` | int(11) | NO | — | Round number |
| `match_date` | date | YES | NULL | Scheduled date |
| `start_time` | time | YES | NULL | Scheduled start |
| `end_time` | time | YES | NULL | Scheduled end |
| `court_id` | int(10) unsigned | YES | NULL | FK to `resources` |
| `referee_id` | int(10) unsigned | YES | NULL | FK to `users` |
| `status` | enum('scheduled','in_progress','completed','cancelled','walkover') | NO | 'scheduled' | Match status |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_match_division` (`division_id`), `idx_match_round` (`round`)

**Managed by:** `fixture.repository.ts` — fixture generation, court/referee assignment.

---

### league_results

Result records for league matches (1:1 with league_matches). Supports submitted/confirmed/disputed result statuses.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `match_id` | int(10) unsigned | NO | — | FK to `league_matches` (1:1) |
| `home_score` | varchar(50) | YES | NULL | Home team score |
| `away_score` | varchar(50) | YES | NULL | Away team score |
| `winner_team_id` | int(10) unsigned | YES | NULL | FK to winner |
| `result_status` | enum('submitted','confirmed','disputed') | NO | 'submitted' | Result verification state |
| `entered_by` | int(10) unsigned | NO | — | FK to `users` |
| `confirmed_at` | datetime | YES | NULL | Confirmation timestamp |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY (`id`), UNIQUE `uk_result_match` (`match_id`)

---

### league_standings

Persisted standing rows per division. Recalculated after every confirmed result. Includes form tracking (last 5 results as W/D/L array).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `division_id` | int(10) unsigned | NO | — | FK to `league_divisions` |
| `team_id` | int(10) unsigned | NO | — | FK to `league_teams` |
| `played` | int(11) | NO | 0 | Matches played |
| `wins` | int(11) | NO | 0 | Wins count |
| `draws` | int(11) | NO | 0 | Draws count |
| `losses` | int(11) | NO | 0 | Losses count |
| `goals_for` | int(11) | NO | 0 | Goals/points scored |
| `goals_against` | int(11) | NO | 0 | Goals/points conceded |
| `goal_difference` | int(11) | NO | 0 | GF - GA |
| `points` | int(11) | NO | 0 | Calculated points |
| `position` | int(11) | YES | NULL | Rank position |
| `form` | longtext | YES | NULL | JSON array of last 5 results (W/D/L) |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_standing_division` (`division_id`), `idx_standing_position` (`position`)

**Managed by:** `standing.repository.ts` — getStandings, recalculateStandings via `computeLeagueStandings()`.

---

### player_statistics

Per-player statistics within a season. Sport-agnostic via `stats_json` extension. Recalculated by `statistics.service.ts`.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `season_id` | int(10) unsigned | NO | — | FK to `seasons` |
| `player_id` | int(10) unsigned | NO | — | FK to `users` |
| `team_id` | int(10) unsigned | YES | NULL | FK to `league_teams` |
| `division_id` | int(10) unsigned | YES | NULL | FK to `league_divisions` |
| `appearances` | int(11) | NO | 0 | Matches played |
| `goals` | int(11) | NO | 0 | Goals scored |
| `assists` | int(11) | NO | 0 | Assists |
| `clean_sheets` | int(11) | NO | 0 | Clean sheets |
| `yellow_cards` | int(11) | NO | 0 | Yellow cards |
| `red_cards` | int(11) | NO | 0 | Red cards |
| `minutes_played` | int(11) | NO | 0 | Minutes played |
| `rating` | decimal(3,2) | YES | NULL | Average rating |
| `stats_json` | longtext | YES | NULL | Sport-agnostic extension JSON |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_player_stat_season` (`season_id`), `idx_player_stat_player` (`player_id`)

---

### team_statistics

Per-team statistics within a season. Includes split home/away records. Sport-agnostic via `stats_json`.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | int(10) unsigned | NO | auto_increment | Primary key |
| `season_id` | int(10) unsigned | NO | — | FK to `seasons` |
| `team_id` | int(10) unsigned | NO | — | FK to `league_teams` |
| `division_id` | int(10) unsigned | YES | NULL | FK to `league_divisions` |
| `played` | int(11) | NO | 0 | Matches played |
| `wins` | int(11) | NO | 0 | Wins count |
| `draws` | int(11) | NO | 0 | Draws count |
| `losses` | int(11) | NO | 0 | Losses count |
| `goals_for` | int(11) | NO | 0 | Goals scored |
| `goals_against` | int(11) | NO | 0 | Goals conceded |
| `clean_sheets` | int(11) | NO | 0 | Clean sheets |
| `home_record` | longtext | YES | NULL | JSON: H wins/draws/losses/gf/ga |
| `away_record` | longtext | YES | NULL | JSON: A wins/draws/losses/gf/ga |
| `stats_json` | longtext | YES | NULL | Sport-agnostic extension JSON |
| `created_at` | timestamp | NO | current_timestamp() | Record creation |
| `updated_at` | timestamp | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY (`id`), `idx_team_stat_season` (`season_id`), `idx_team_stat_team` (`team_id`)

**Managed by:** `statistics.repository.ts` — getPlayerStats, getTeamStats, recalculatePlayerStats, recalculateTeamStats.

**Evidence:** All league table schemas verified against `database/baseline/001_courtzon_v3.sql`. Repository implementations at `backend/src/modules/leagues/infrastructure/repositories/` (6 files). Domain logic at `domain/league-aggregate.ts:1-138` (fixture generation, standings calculation). Statistics at `application/statistics.service.ts:1-196`.

---

## CRM Entities

**Source:** `database/migrations/069_crm_marketing.sql`

### customer_segments

Rule-based customer grouping. Each segment has a JSON rules definition and a denormalized `member_count` refreshed on demand.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `name` | `varchar(200)` | NO | — | Segment name |
| `description` | `text` | YES | NULL | Human-readable description |
| `rules_json` | `json` | YES | NULL | JSON — segment definition rules |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `member_count` | `int(10) unsigned` | NO | 0 | Denormalized member count (updated on refresh) |
| `created_by` | `int(10) unsigned` | NO | — | FK to `users` |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_active`
**FK:** `fk_seg_creator` → `users(id)`

**Source:** `database/migrations/069_crm_marketing.sql:2-14`

**Managed by:** `crm.controller.ts:150-173` (create), `175-202` (update), `204-271` (refresh), `273-293` (delete).

---

### segment_members

Junction table linking users to segments. Populated by the segment refresh mechanism.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `segment_id` | `int(10) unsigned` | NO | — | FK to `customer_segments` |
| `user_id` | `int(10) unsigned` | NO | — | FK to `users` |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** UNIQUE `uk_seg_user` (`segment_id`, `user_id`), `idx_user` (`user_id`)
**FK:** `fk_sm_segment` → `customer_segments(id)` ON DELETE CASCADE, `fk_sm_user` → `users(id)` ON DELETE CASCADE

**Source:** `database/migrations/069_crm_marketing.sql:17-26`

---

### leads

Sales leads with source tracking and a 4-state lifecycle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `source` | `varchar(100)` | YES | NULL | registration, referral, manual, import |
| `full_name` | `varchar(200)` | NO | — | Lead full name |
| `email` | `varchar(255)` | YES | NULL | Email address |
| `phone` | `varchar(50)` | YES | NULL | Phone number |
| `status` | `enum('new','qualified','converted','lost')` | NO | 'new' | Lead lifecycle state |
| `converted_user_id` | `int(10) unsigned` | YES | NULL | FK to `users` when converted |
| `notes` | `text` | YES | NULL | Sales notes |
| `assigned_to` | `int(10) unsigned` | YES | NULL | FK to `users` — assigned sales rep |
| `created_by` | `int(10) unsigned` | YES | NULL | FK to `users` — creator |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_status`, `idx_assigned`, `idx_source`
**FK:** `fk_lead_conv` → `users(id)` ON DELETE SET NULL, `fk_lead_assign` → `users(id)` ON DELETE SET NULL

**Source:** `database/migrations/069_crm_marketing.sql:29-47`

**Managed by:** `crm.controller.ts:295-417`

---

### marketing_campaigns

Marketing campaigns with a 5-state lifecycle. Can be targeted at a specific customer segment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `name` | `varchar(200)` | NO | — | Campaign name |
| `description` | `text` | YES | NULL | Campaign description |
| `type` | `enum('email','sms','push','in_app','multi_channel')` | NO | 'multi_channel' | Campaign channel |
| `status` | `enum('draft','active','paused','completed','cancelled')` | NO | 'draft' | Campaign lifecycle state |
| `segment_id` | `int(10) unsigned` | YES | NULL | FK to `customer_segments` — target segment |
| `scheduled_at` | `timestamp` | YES | NULL | Scheduled launch time |
| `started_at` | `timestamp` | YES | NULL | Actual launch time |
| `completed_at` | `timestamp` | YES | NULL | Completion timestamp |
| `stats_json` | `json` | YES | NULL | JSON — cached campaign statistics |
| `created_by` | `int(10) unsigned` | NO | — | FK to `users` |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_status`, `idx_segment`, `idx_type`
**FK:** `fk_mc_segment` → `customer_segments(id)` ON DELETE SET NULL, `fk_mc_creator` → `users(id)`

**Source:** `database/migrations/069_crm_marketing.sql:50-69`

**Managed by:** `crm.controller.ts:419-590`

---

### communication_log

Unified cross-channel communication history.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `int(10) unsigned` | YES | NULL | FK to `users` — target user |
| `channel` | `enum('email','sms','push','in_app','whatsapp')` | NO | — | Communication channel |
| `direction` | `enum('outbound','inbound')` | NO | 'outbound' | Message direction |
| `subject` | `varchar(500)` | YES | NULL | Message subject |
| `body` | `text` | YES | NULL | Message body |
| `status` | `enum('sent','delivered','failed','opened','clicked')` | NO | 'sent' | Delivery status |
| `reference_type` | `varchar(50)` | YES | NULL | Polymorphic reference type |
| `reference_id` | `int(10) unsigned` | YES | NULL | Polymorphic reference ID |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_user`, `idx_channel`, `idx_reference`, `idx_created`

**Source:** `database/migrations/069_crm_marketing.sql:72-87`

**Managed by:** `crm.controller.ts:592-618`

---

## HR Entities

**Source:** `database/migrations/070_hr_payroll.sql`

### departments

Hierarchical organisation departments with self-referencing `parent_id`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `name` | `varchar(200)` | NO | — | Department name |
| `parent_id` | `int(10) unsigned` | YES | NULL | Self-referencing FK for hierarchy |
| `head_employee_id` | `int(10) unsigned` | YES | NULL | FK to `employees` — department head |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_org`, `idx_parent`
**FK:** `fk_dept_org` → `organisations(id)` ON DELETE CASCADE, `fk_dept_parent` → `departments(id)` ON DELETE SET NULL

**Source:** `database/migrations/070_hr_payroll.sql:2-15`

**Managed by:** `hr.controller.ts:23-134`

---

### positions

Job positions within an organisation, optionally linked to a department.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `department_id` | `int(10) unsigned` | YES | NULL | FK to `departments` |
| `title` | `varchar(200)` | NO | — | Position title |
| `description` | `text` | YES | NULL | Position description |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_org`, `idx_dept`
**FK:** `fk_pos_org` → `organisations(id)` ON DELETE CASCADE, `fk_pos_dept` → `departments(id)` ON DELETE SET NULL

**Source:** `database/migrations/070_hr_payroll.sql:18-31`

**Managed by:** `hr.controller.ts:138-248`

---

### employees

Employee records extending `users` with HR-specific fields. Core entity for all HR operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `int(10) unsigned` | NO | — | FK to `users` |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `department_id` | `int(10) unsigned` | YES | NULL | FK to `departments` |
| `position_id` | `int(10) unsigned` | YES | NULL | FK to `positions` |
| `employee_code` | `varchar(50)` | YES | NULL | Unique employee identifier |
| `employment_status` | `enum('draft','onboarding','active','on_leave','suspended','terminated','archived')` | NO | 'draft' | Employee lifecycle state |
| `hire_date` | `date` | YES | NULL | Date of hire |
| `termination_date` | `date` | YES | NULL | Date of termination |
| `termination_reason` | `varchar(500)` | YES | NULL | Reason for termination |
| `reports_to` | `int(10) unsigned` | YES | NULL | Self-referencing FK — manager |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** UNIQUE `uk_user_org` (`user_id`, `organisation_id`), `idx_org`, `idx_dept`, `idx_status`
**FK:** `fk_emp_user` → `users(id)` ON DELETE CASCADE, `fk_emp_org` → `organisations(id)` ON DELETE CASCADE, `fk_emp_dept` → `departments(id)` ON DELETE SET NULL, `fk_emp_pos` → `positions(id)` ON DELETE SET NULL, `fk_emp_reports` → `employees(id)` ON DELETE SET NULL

**Source:** `database/migrations/070_hr_payroll.sql:34-57`

**Managed by:** `hr.controller.ts:250-400`

---

### employment_contracts

Employee contracts with salary info and a 4-state lifecycle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `employee_id` | `int(10) unsigned` | NO | — | FK to `employees` |
| `contract_type` | `enum('permanent','fixed_term','probation','internship','freelance')` | NO | 'permanent' | Type of employment |
| `start_date` | `date` | NO | — | Contract start |
| `end_date` | `date` | YES | NULL | Contract end (for fixed-term) |
| `salary_amount` | `decimal(14,2)` | NO | 0.00 | Base salary |
| `currency` | `char(3)` | NO | 'USD' | Salary currency |
| `payment_frequency` | `enum('monthly','biweekly','weekly','daily','hourly')` | NO | 'monthly' | Payment schedule |
| `status` | `enum('draft','active','expired','terminated')` | NO | 'draft' | Contract lifecycle state |
| `document_url` | `varchar(500)` | YES | NULL | Scanned contract URL |
| `notes` | `text` | YES | NULL | Contract notes |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_employee`
**FK:** `fk_ec_emp` → `employees(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:60-76`

**Managed by:** `hr.controller.ts:402-529`

---

### leave_types

Configurable leave categories per organisation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `name` | `varchar(200)` | NO | — | e.g. Annual, Sick, Personal |
| `default_days` | `decimal(5,1)` | NO | 0 | Default annual allocation |
| `is_paid` | `tinyint(1)` | NO | 1 | Paid or unpaid |
| `requires_approval` | `tinyint(1)` | NO | 1 | Requires manager approval |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_org`
**FK:** `fk_lt_org` → `organisations(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:79-90`

**Managed by:** `hr.controller.ts:533-628`

---

### leave_requests

Employee leave requests with a 6-state lifecycle. Status transitions validated by `LEAVE_TRANSITIONS`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `employee_id` | `int(10) unsigned` | NO | — | FK to `employees` |
| `leave_type_id` | `int(10) unsigned` | NO | — | FK to `leave_types` |
| `start_date` | `date` | NO | — | Leave start date |
| `end_date` | `date` | NO | — | Leave end date |
| `duration_days` | `decimal(5,1)` | NO | — | Calculated duration |
| `reason` | `text` | YES | NULL | Leave reason |
| `status` | `enum('draft','submitted','approved','rejected','cancelled','completed')` | NO | 'draft' | Leave lifecycle state |
| `approved_by` | `int(10) unsigned` | YES | NULL | FK to `users` — approver |
| `approved_at` | `timestamp` | YES | NULL | Approval timestamp |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_employee`, `idx_status`
**FK:** `fk_lr_emp` → `employees(id)` ON DELETE CASCADE, `fk_lr_type` → `leave_types(id)` ON DELETE CASCADE, `fk_lr_approver` → `users(id)` ON DELETE SET NULL

**Source:** `database/migrations/070_hr_payroll.sql:93-111`

**Managed by:** `hr.controller.ts:630-894`

---

### leave_balances

Auto-calculated leave balances per employee, per leave type, per year. Updated atomically during leave approval/cancellation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `employee_id` | `int(10) unsigned` | NO | — | FK to `employees` |
| `leave_type_id` | `int(10) unsigned` | NO | — | FK to `leave_types` |
| `total_days` | `decimal(5,1)` | NO | 0 | Annual entitlement |
| `used_days` | `decimal(5,1)` | NO | 0 | Days taken |
| `pending_days` | `decimal(5,1)` | NO | 0 | Days in pending/approved requests |
| `year` | `int(10) unsigned` | NO | — | Calendar year |

**Indexes:** UNIQUE `uk_emp_type_year` (`employee_id`, `leave_type_id`, `year`)
**FK:** `fk_lb_emp` → `employees(id)` ON DELETE CASCADE, `fk_lb_type` → `leave_types(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:114-125`

**Managed by:** `hr.controller.ts:898-956`

---

### staff_attendance

Daily attendance records with clock-in/out times and status.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `employee_id` | `int(10) unsigned` | NO | — | FK to `employees` |
| `attendance_date` | `date` | NO | — | Attendance date |
| `clock_in` | `time` | YES | NULL | Clock-in time |
| `clock_out` | `time` | YES | NULL | Clock-out time |
| `status` | `enum('present','absent','late','early_leave','excused')` | NO | 'present' | Attendance status |
| `notes` | `text` | YES | NULL | Free-text notes |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** UNIQUE `uk_emp_date` (`employee_id`, `attendance_date`), `idx_date`
**FK:** `fk_sa_emp` → `employees(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:128-141`

**Managed by:** `hr.controller.ts:960-1084`

---

### payroll_components

Configurable earning and deduction types per organisation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `name` | `varchar(200)` | NO | — | Component name |
| `type` | `enum('earning','deduction')` | NO | — | Earning or deduction |
| `calculation_type` | `enum('fixed','percentage','formula')` | NO | 'fixed' | How amount is calculated |
| `default_amount` | `decimal(14,2)` | NO | 0.00 | Default value |
| `is_active` | `tinyint(1)` | NO | 1 | Soft toggle |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** PRIMARY, `idx_org`
**FK:** `fk_pc_org` → `organisations(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:144-155`

**Managed by:** `hr.controller.ts:1088-1175`

---

### payroll_runs

Payroll run records with financial totals and a 6-state lifecycle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `organisation_id` | `int(10) unsigned` | NO | — | FK to `organisations` |
| `period_start` | `date` | NO | — | Payroll period start |
| `period_end` | `date` | NO | — | Payroll period end |
| `status` | `enum('draft','calculated','approved','posted','paid','closed')` | NO | 'draft' | Payroll lifecycle state |
| `total_gross` | `decimal(14,2)` | NO | 0.00 | Sum of gross pay |
| `total_deductions` | `decimal(14,2)` | NO | 0.00 | Sum of deductions |
| `total_net` | `decimal(14,2)` | NO | 0.00 | Sum of net pay |
| `posted_at` | `timestamp` | YES | NULL | When posted to GL |
| `posted_by` | `int(10) unsigned` | YES | NULL | FK to `users` — who posted |
| `paid_at` | `timestamp` | YES | NULL | When marked paid |
| `created_by` | `int(10) unsigned` | NO | — | FK to `users` — creator |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |
| `updated_at` | `timestamp` | NO | ON UPDATE current_timestamp() | Last update |

**Indexes:** PRIMARY, `idx_org`, `idx_status`
**FK:** `fk_pr_org` → `organisations(id)` ON DELETE CASCADE, `fk_pr_creator` → `users(id)`, `fk_pr_poster` → `users(id)` ON DELETE SET NULL

**Source:** `database/migrations/070_hr_payroll.sql:158-178`

**Managed by:** `hr.controller.ts:1177-1498`

---

### payroll_entries

Per-employee payroll calculation details within a payroll run.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `payroll_run_id` | `int(10) unsigned` | NO | — | FK to `payroll_runs` |
| `employee_id` | `int(10) unsigned` | NO | — | FK to `employees` |
| `base_salary` | `decimal(14,2)` | NO | 0.00 | Base salary from contract |
| `total_earnings` | `decimal(14,2)` | NO | 0.00 | Sum of earning components |
| `total_deductions` | `decimal(14,2)` | NO | 0.00 | Sum of deduction components |
| `net_pay` | `decimal(14,2)` | NO | 0.00 | Base + earnings - deductions |
| `component_breakdown` | `json` | YES | NULL | JSON — per-component detail |

**Indexes:** PRIMARY, `idx_run`, `idx_employee`
**FK:** `fk_pe_run` → `payroll_runs(id)` ON DELETE CASCADE, `fk_pe_emp` → `employees(id)` ON DELETE CASCADE

**Source:** `database/migrations/070_hr_payroll.sql:180-193`

**Managed by:** `hr.controller.ts:1259-1349` (calculated during payroll run calculation)

---

**Evidence:** All table schemas verified against `database/migrations/069_crm_marketing.sql` (CRM) and `database/migrations/070_hr_payroll.sql` (HR). Handler implementations at `backend/src/modules/crm/presentation/crm.controller.ts` and `backend/src/modules/hr/presentation/hr.controller.ts`.

---

## Reports & Observability Entities

### kpi_snapshots

Timestamped snapshots of key business metrics for historical trend analysis. Captured daily by scheduled job.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `kpi_key` | `varchar(100)` | NO | — | Unique KPI identifier (e.g. total_revenue, active_users) |
| `kpi_value` | `decimal(14,2)` | NO | — | Numeric KPI value |
| `kpi_label` | `varchar(255)` | YES | NULL | Human-readable label |
| `organisation_id` | `int(10) unsigned` | YES | NULL | FK to `organisations` (NULL = platform-wide) |
| `branch_id` | `int(10) unsigned` | YES | NULL | FK to `branches` (NULL = org-wide) |
| `period_start` | `date` | YES | NULL | Snapshot period start |
| `period_end` | `date` | YES | NULL | Snapshot period end |
| `recorded_at` | `timestamp` | NO | current_timestamp() | When snapshot was taken |

**Indexes:** `idx_kpi_key`, `idx_organisation`, `idx_branch`, `idx_recorded_at`

**Managed by:** BI module (`bi.controller.ts:231-258`)
**Viewer:** `GET /bi/kpi-snapshots` (permission: `bi.kpi.view`)

---

### web_vitals_metrics

Client-side Web Vitals measurements reported by the browser. Used for real-user monitoring (RUM).

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | YES | NULL | FK to `users` (NULL if anonymous) |
| `lcp` | `int(10) unsigned` | YES | NULL | Largest Contentful Paint (ms) |
| `cls` | `decimal(10,4)` | YES | NULL | Cumulative Layout Shift score |
| `fcp` | `int(10) unsigned` | YES | NULL | First Contentful Paint (ms) |
| `ttfb` | `int(10) unsigned` | YES | NULL | Time to First Byte (ms) |
| `url` | `varchar(500)` | YES | NULL | Page URL where measured |
| `user_agent` | `varchar(500)` | YES | NULL | Browser user agent |
| `recorded_at` | `timestamp` | NO | current_timestamp() | When measurement was recorded |

**Indexes:** `idx_recorded_at`, `idx_user`

**Ingested via:** `POST /client/web-vitals`
**Viewer:** `GET /bi/web-vitals` (permission: `bi.observability.view`)
**Aggregation:** Daily average grouped by `DATE(recorded_at)` with `AVG(lcp)`, `AVG(cls)`, `AVG(fcp)`, `COUNT(*)` as sample_count

---

### client_error_reports

Client-side JavaScript error reports submitted by the browser's error boundary. Used for proactive error monitoring.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | YES | NULL | FK to `users` (NULL if anonymous) |
| `error_message` | `text` | NO | — | JS error message text |
| `error_stack` | `text` | YES | NULL | Stack trace |
| `error_type` | `varchar(100)` | YES | NULL | Error type (e.g. TypeError, ReferenceError) |
| `error_url` | `varchar(500)` | YES | NULL | URL where error occurred |
| `user_agent` | `varchar(500)` | YES | NULL | Browser user agent |
| `recorded_at` | `timestamp` | NO | current_timestamp() | When error was reported |

**Indexes:** `idx_recorded_at`, `idx_user`, `idx_error_type`

**Ingested via:** `POST /client/errors`
**Viewer:** `GET /bi/client-errors` (permission: `bi.observability.view`)
**Aggregation:** Grouped by `error_message`, `error_stack`, `error_type` with frequency count

---

### notification_analytics

Aggregated notification delivery analytics for monitoring notification system health.

**Source:** `database/baseline/001_courtzon_v3.sql`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `channel` | `varchar(50)` | NO | — | Notification channel (email, sms, push, in_app) |
| `status` | `varchar(50)` | NO | — | Delivery status (sent, delivered, failed, opened, clicked) |
| `count` | `int(10) unsigned` | NO | 0 | Aggregate count |
| `period_start` | `datetime` | NO | — | Analytics period start |
| `period_end` | `datetime` | NO | — | Analytics period end |
| `created_at` | `timestamp` | NO | current_timestamp() | Record creation |

**Indexes:** `idx_channel_status`, `idx_period`

**Managed by:** Notifications module (TECH-MOD-14)
**Purpose:** Powers notification delivery alerting (see TECH-ARCH-25 alert rule `NotificationDeliveryFailure`)

---

**Evidence:** All table schemas verified against `database/baseline/001_courtzon_v3.sql`. BI handlers at `bi.controller.ts:231-393`. Health/metrics at `health.service.ts`, `metrics.ts`. Monitoring stack at `monitoring/alerts.yml`, `monitoring/prometheus.yml`.
