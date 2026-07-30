---
document_id: "TECH-ARCH-22"
document_name: "CRM Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 12
business_owner: "Marketing Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-15", "TECH-DB-03"]
  related: ["TECH-MOD-14", "GOV-ADR-010"]
---

# CRM Architecture (TECH-ARCH-22)

**Source:** `backend/src/modules/crm/` (`crm.controller.ts:1-647`, `crm.routes.ts:1-39`)

## 1. Customer 360 — Unified Profile

The CRM does **not** own customer data. It aggregates via **read-model queries** across all business domains. The `getCustomerHandler` (`crm.controller.ts:52-110`) queries:

| Data Source | Query | Aggregation |
|------------|-------|-------------|
| `users` | `SELECT * FROM users WHERE id = ?` | Core profile (name, email, phone, status) |
| `bookings` | `SELECT COUNT(*), SUM(cancelled), SUM(completed) ... WHERE user_id = ?` | Booking stats |
| `orders` | `SELECT COUNT(*), SUM(total_amount) ... WHERE user_id = ?` | Order stats + lifetime spend |
| `wallet_transactions` | `SELECT SUM(credit), SUM(debit) ... WHERE user_id = ?` | Wallet deposits/withdrawals |
| `academy_enrollments` | `SELECT COUNT(*) ... WHERE user_id = ?` | Enrollment count |
| `tournament_registrations` | `SELECT COUNT(*) ... WHERE user_id = ?` | Tournament participation |
| `league_teams` | `SELECT COUNT(*) ... WHERE user_id = ?` | League participation |
| All of the above | `MAX(GREATEST(...))` composite | Last activity timestamp |

**Evidence:** `crm.controller.ts:52-110`

## 2. Customer Timeline — Chronological UNION

The `getCustomerTimelineHandler` (`crm.controller.ts:112-137`) builds a unified event feed via `UNION ALL`:

```sql
SELECT created_at, 'booking' AS type, id AS ref_id, status AS ref_status, NULL AS ref_amount FROM bookings WHERE user_id = ?
UNION ALL
SELECT created_at, 'order', id, status, total_amount FROM orders WHERE user_id = ?
UNION ALL
SELECT created_at, 'enrollment', id, status, NULL FROM academy_enrollments WHERE user_id = ?
UNION ALL
SELECT created_at, 'tournament_registration', id, status, NULL FROM tournament_registrations WHERE user_id = ?
UNION ALL
SELECT created_at, 'wallet_transaction', id, type, amount FROM wallet_transactions WHERE user_id = ?
UNION ALL
SELECT created_at, 'activity_log', id, action, NULL FROM activity_logs WHERE user_id = ?
ORDER BY created_at DESC
```

**Event types:** `booking`, `order`, `enrollment`, `tournament_registration`, `wallet_transaction`, `activity_log`

**Evidence:** `crm.controller.ts:119-134`

## 3. Segments — Rule-Based Customer Groups

Segments are defined by JSON rules and populated into `segment_members` via a refresh mechanism.

### Schema: `customer_segments`

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT UNSIGNED | PK |
| `name` | VARCHAR(200) | Segment name |
| `description` | TEXT | Human-readable description |
| `rules_json` | JSON | Segment definition rules |
| `is_active` | TINYINT(1) | Soft toggle |
| `member_count` | INT UNSIGNED | Denormalized count (updated on refresh) |
| `created_by` | INT UNSIGNED | FK to `users` |

**Source:** `database/migrations/069_crm_marketing.sql:2-14`

### Segment Members: `segment_members`

Many-to-many join: `segment_id` × `user_id` with UNIQUE constraint.

**Source:** `database/migrations/069_crm_marketing.sql:17-26`

### Rule Engine

Supported conditions (`refreshSegmentHandler`, `crm.controller.ts:204-271`):

| Condition | SQL Translation | Params |
|-----------|----------------|--------|
| `has_booking` | `EXISTS (SELECT 1 FROM bookings WHERE user_id = u.id)` | none |
| `has_order` | `EXISTS (SELECT 1 FROM orders WHERE user_id = u.id)` | none |
| `has_enrollment` | `EXISTS (SELECT 1 FROM academy_enrollments WHERE user_id = u.id)` | none |
| `created_after` | `u.created_at >= ?` | date |
| `created_before` | `u.created_at <= ?` | date |
| `is_active` | `u.is_active = ?` | boolean |

**Operator:** `AND` or `OR` (from `rules.operator`). If no conditions match (or empty), all users are included.

**Refresh flow:** DELETE stale members → INSERT IGNORE new members → UPDATE `member_count`. Runs in a transaction.

**Evidence:** `crm.controller.ts:214-270`

## 4. Leads Lifecycle

### Statuses: `new → qualified → converted → lost`

| Status | Definition |
|--------|-----------|
| `new` | Fresh lead captured |
| `qualified` | Meets criteria, assigned to sales rep |
| `converted` | Became a customer (linked to `converted_user_id`) |
| `lost` | Disqualified or declined |

**Schema:** `leads` table (`database/migrations/069_crm_marketing.sql:29-47`)

**Key fields:** `source` (registration, referral, manual, import), `assigned_to`, `converted_user_id`

**Conversion logic** (`convertLeadHandler`, `crm.controller.ts:379-417`):
1. Validates lead is not already converted
2. Optionally links to an existing `user_id` from the request
3. Otherwise matches by email (`SELECT id FROM users WHERE email = ?`)
4. Updates `status = 'converted'` and sets `converted_user_id`
5. Records `CRM.LEAD.CONVERT` audit event

**Evidence:** `crm.controller.ts:295-417`, `crm.routes.ts:20-24`

## 5. Marketing Campaigns Lifecycle

### Statuses: `draft → active → paused → completed → cancelled`

| Status Transition | Endpoint | Validation |
|------------------|----------|-----------|
| draft → active | `POST /admin/crm/campaigns/:id/launch` | Must be draft or paused |
| active → paused | `POST /admin/crm/campaigns/:id/pause` | Must be active |
| active/paused → completed | `POST /admin/crm/campaigns/:id/complete` | Must not be completed/cancelled |

**Schema:** `marketing_campaigns` (`database/migrations/069_crm_marketing.sql:50-69`)

**Key fields:** `type` (email, sms, push, in_app, multi_channel), `segment_id`, `scheduled_at`, `stats_json`

**Evidence:** `crm.controller.ts:501-590`, `crm.routes.ts:26-32`

## 6. Communication Log

Unified cross-channel history stored in `communication_log` (`database/migrations/069_crm_marketing.sql:72-87`).

| Column | Description |
|--------|-------------|
| `user_id` | Target user (nullable) |
| `channel` | email, sms, push, in_app, whatsapp |
| `direction` | outbound, inbound |
| `status` | sent, delivered, failed, opened, clicked |
| `reference_type` | Polymorphic reference (e.g. campaign_id, notification_id) |

**Query:** Filterable by `userId`, `channel`, `status`, `referenceType`, `referenceId`, date range.

**Evidence:** `crm.controller.ts:592-618`, `crm.routes.ts:35`

## 7. CRM Dashboard

`GET /admin/crm/dashboard` returns:
- `totalCustomers` — COUNT from users
- `leadStats` — GROUP BY status on leads
- `activeCampaigns` — COUNT campaigns WHERE status = 'active'
- `activeSegments` — COUNT segments WHERE is_active = 1
- `recentLeads` — Last 10 leads with assignee info

**Evidence:** `crm.controller.ts:620-647`

## 8. API Routes Summary

| Group | Routes | Permissions |
|-------|--------|-------------|
| Customer 360 | 3 | `crm.customers.view` |
| Segments | 5 | `crm.segments.view`, `crm.segments.manage` |
| Leads | 4 | `crm.leads.view`, `crm.leads.manage` |
| Campaigns | 5 | `crm.campaigns.view`, `crm.campaigns.manage` |
| Communications | 1 | `crm.communications.view` |
| Dashboard | 1 | `crm.dashboard.view` |

**Total:** 19 endpoints. **Source:** `crm.routes.ts:9-39`

## 9. Audit Events

| Event | Trigger |
|-------|---------|
| `CRM.SEGMENT.CREATE` | Create segment |
| `CRM.SEGMENT.UPDATE` | Update segment |
| `CRM.SEGMENT.REFRESH` | Refresh segment members |
| `CRM.SEGMENT.DELETE` | Delete segment |
| `CRM.LEAD.CREATE` | Create lead |
| `CRM.LEAD.UPDATE` | Update lead |
| `CRM.LEAD.CONVERT` | Convert lead to customer |
| `CRM.CAMPAIGN.CREATE` | Create campaign |
| `CRM.CAMPAIGN.UPDATE` | Update campaign |
| `CRM.CAMPAIGN.LAUNCH` | Launch campaign |
| `CRM.CAMPAIGN.PAUSE` | Pause campaign |
| `CRM.CAMPAIGN.COMPLETE` | Complete campaign |

All audit events logged via `recordAudit()` in `crm.controller.ts`.
