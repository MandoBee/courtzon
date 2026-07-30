# CourtZon Enterprise — Final Data Cleanup Specification

**Date:** 2026-07-28
**Total tables:** 275 (274 active + 1 legacy)
**Purpose:** Precise executable specification for automated cleanup SQL generation.

---

## How To Read This Specification

Every table is assigned exactly one action:

| Action | Meaning |
|--------|---------|
| **`KEEP`** | All rows preserved. No DELETE generated. |
| **`KEEP_SELECTED`** | Only rows matching the defined `WHERE` condition are kept; all others are deleted. |
| **`DELETE`** | All rows deleted (`DELETE FROM table`). |
| **`EXPORT_THEN_DELETE`** | All rows exported to cold storage first, then deleted. |
| **`MANUAL_REVIEW`** | No automatic action. Requires human inspection before cleanup. |

---

## Dependency Map: Preserved Users

If these users are preserved:
- **Super Admin** (ID 1, presumably `users.id = 1`)
- **Tarek Zaki** (`users.phone = '01227771587'`)

Then the following related records must ALSO be preserved:

```
users  (WHERE id IN (1, TarekZakiId))
 ↓
 user_roles                  WHERE user_id IN (preserved user IDs)
 user_role_scopes            WHERE user_id IN (preserved user IDs)
 user_organisations          WHERE user_id IN (preserved user IDs)
 user_branches               WHERE user_id IN (preserved user IDs)
 user_addresses              WHERE user_id IN (preserved user IDs)
 user_wallets                WHERE user_id IN (preserved user IDs)
 user_notification_preferences  WHERE user_id IN (preserved user IDs)
 user_channel_preferences    WHERE user_id IN (preserved user IDs)
 user_quiet_hours            WHERE user_id IN (preserved user IDs)
 user_devices                WHERE user_id IN (preserved user IDs)
 user_sessions               WHERE user_id IN (preserved user IDs)
 player_profiles             WHERE user_id IN (preserved user IDs)
 player_sport_interests      WHERE user_id IN (preserved user IDs)
 coach_profiles              WHERE user_id IN (preserved user IDs)
 seller_profiles             WHERE user_id IN (preserved user IDs)
 user_follows                WHERE user_id IN (preserved user IDs) OR followed_user_id IN (preserved user IDs)
 user_friends                WHERE user_id IN (preserved user IDs) OR friend_id IN (preserved user IDs)
 member_profiles             WHERE user_id IN (preserved user IDs)
 push_tokens                 WHERE user_id IN (preserved user IDs)
 wallet_transactions         WHERE wallet_id IN (preserved user wallets)
 memberships                 WHERE user_id IN (preserved user IDs)
 user_memberships            WHERE user_id IN (preserved user IDs)
 loyalty_points              WHERE user_id IN (preserved user IDs)
 reward_claims               WHERE user_id IN (preserved user IDs)
 booking_*                   WHERE user_id IN (preserved user IDs)
 match_*                     WHERE user_id IN (preserved user IDs) OR player1_id IN (...) OR player2_id IN (...)
 orders                      WHERE user_id IN (preserved user IDs)
 cart_items                  WHERE user_id IN (preserved user IDs)
 invitations                 WHERE user_id IN (preserved user IDs) OR invited_user_id IN (...)
 join_requests               WHERE user_id IN (preserved user IDs)
 messages                    WHERE sender_id IN (preserved user IDs)
```

## Dependency Map: Preserved Organisation & Branches

```
organisations  (WHERE id = 1)
 ↓
 organisation_attribute_values   WHERE organisation_id = 1
 organisation_subscriptions      WHERE organisation_id = 1
 organisation_upgrade_requests   WHERE organisation_id = 1
 branches                        WHERE organisation_id = 1
  ↓
  branch_amenity_assignments     WHERE branch_id IN (preserved branch IDs)
  branch_financial_details       WHERE branch_id IN (preserved branch IDs)
  branch_player_access           WHERE branch_id IN (preserved branch IDs)
  branch_unavailability          WHERE branch_id IN (preserved branch IDs)
  resources                      WHERE branch_id IN (preserved branch IDs)
   ↓
   resource_attribute_values     WHERE resource_id IN (preserved resource IDs)
   resource_peak_hours           WHERE resource_id IN (preserved resource IDs)
   resource_maintenance          WHERE resource_id IN (preserved resource IDs)
   pricing_rules                 WHERE resource_id IN (preserved resource IDs)
   pricing_seasons               WHERE resource_id IN (preserved resource IDs)
```

---

## Section 1: Protected Master Data

**Action:** `KEEP`

All rows preserved. No deletion.

| # | Table | Rationale |
|---|-------|-----------|
| 1 | `academies` | Academy/entity definitions |
| 2 | `academy_curriculums` | Curriculum definitions |
| 3 | `academy_programs` | Program definitions |
| 4 | `academy_sessions` | Session templates/definitions |
| 5 | `accounting_periods` | Fiscal period definitions |
| 6 | `ad_campaigns` | Campaign definition templates |
| 7 | `ad_creatives` | Creative asset definitions |
| 8 | `ad_placements` | Ad placement zone definitions |
| 9 | `ad_pricing` | Ad pricing model definitions |
| 10 | `ad_targeting_rules` | Targeting rule definitions |
| 11 | `amenities` | Amenity master list |
| 12 | `app_versions` | Application version registry |
| 13 | `brands` | Brand master list |
| 14 | `cancellation_policies` | Cancellation/refund policy definitions |
| 15 | `chart_of_accounts` | Chart of accounts definitions |
| 16 | `cms_blogs` | Published blog content |
| 17 | `cms_media` | CMS media assets |
| 18 | `cms_pages` | CMS page content |
| 19 | `cms_section_blocks` | CMS section block definitions |
| 20 | `cms_sections` | CMS section definitions |
| 21 | `commission_rules` | Commission rule definitions |
| 22 | `cron_jobs` | Scheduled job definitions |
| 23 | `departments` | HR department definitions |
| 24 | `holidays` | Holiday reference data |
| 25 | `leave_types` | Leave type definitions |
| 26 | `loyalty_campaigns` | Loyalty campaign definitions |
| 27 | `membership_benefits` | Membership benefit definitions |
| 28 | `membership_plans` | Membership plan definitions |
| 29 | `migration_history` | Database migration tracking |
| 30 | `notification_ab_tests` | Notification A/B test definitions |
| 31 | `notification_actions` | Notification action type definitions |
| 32 | `notification_broadcasts` | Broadcast template definitions |
| 33 | `notification_categories` | Notification category definitions |
| 34 | `notification_cleanup_policies` | Retention policy definitions |
| 35 | `notification_digest_windows` | Digest window configuration |
| 36 | `notification_feature_flags` | Notification feature flag definitions |
| 37 | `notification_providers` | Notification provider configurations |
| 38 | `notification_rate_limits` | Rate limit definitions |
| 39 | `notification_template_versions` | Template version definitions |
| 40 | `notification_templates` | Notification template definitions |
| 41 | `notification_types` | Notification type definitions |
| 42 | `notification_webhooks` | Webhook endpoint definitions |
| 43 | `operating_hours` | Branch operating hour templates |
| 44 | `organisation_type_attributes` | Org type attribute definitions |
| 45 | `organisation_types` | Organisation type definitions |
| 46 | `payroll_components` | Payroll component definitions |
| 47 | `peak_hour_pricing` | Peak hour pricing definitions |
| 48 | `permission_modules` | Permission module definitions |
| 49 | `permissions` | Permission key definitions |
| 50 | `player_levels` | Player level definitions |
| 51 | `platform_accounts` | Platform financial account configs |
| 52 | `positions` | Job position definitions |
| 53 | `product_categories` | Product category definitions |
| 54 | `resource_type_attributes` | Resource type attribute definitions |
| 55 | `resource_types` | Resource type definitions |
| 56 | `reward_catalog` | Reward catalog definitions |
| 57 | `role_permissions` | Role-to-permission mapping |
| 58 | `role_theme_overrides` | Role-specific theme overrides |
| 59 | `roles` | Role definitions |
| 60 | `seasons` | League season definitions |
| 61 | `sport_positions` | Sport position definitions |
| 62 | `sports` | Sport master list |
| 63 | `subscription_features` | Subscription feature definitions |
| 64 | `subscription_plan_features` | Plan-to-feature mapping |
| 65 | `subscription_plan_rates` | Plan rate definitions |
| 66 | `subscription_plans` | Subscription plan definitions |
| 67 | `tags` | Tag master list |
| 68 | `tax_rates` | Tax rate definitions |
| 69 | `tournament_bracket_types` | Bracket type definitions |
| 70 | `workflow_definitions` | Workflow template definitions |
| 71 | `workflow_event_subscriptions` | Workflow event subscription definitions |
| 72 | `workflow_steps` | Workflow step definitions |

---

## Section 2: Protected Configuration

**Action:** `KEEP`

All rows preserved.

| # | Table | Rationale |
|---|-------|-----------|
| 1 | `app_settings` | Application config key-values |
| 2 | `system_settings` | System config key-values |
| 3 | `feature_flags` | Feature toggle states |
| 4 | `design_tokens` | Design system CSS variables |
| 5 | `sidebar_layout` | Sidebar menu layout config |
| 6 | `application_settings_history` | Settings change history |
| 7 | `payment_gateway_config` | Payment gateway integration config |
| 8 | `design_token_versions` | Design token version history |
| 9 | `design_theme_reset_baseline` | Theme reset baseline |

---

## Section 3: Protected Reference Data

**Action:** `KEEP`

All rows preserved.

| # | Table | Rationale |
|---|-------|-----------|
| 1 | `bank_branches` | Bank branch lookup |
| 2 | `banks` | Bank master list |
| 3 | `cities` | City lookup |
| 4 | `countries` | Country master list |
| 5 | `currencies` | Currency master list |
| 6 | `exchange_rates` | Currency exchange rate reference |
| 7 | `languages` | Language master list |
| 8 | `payment_methods` | Payment method reference |
| 9 | `provinces` | Province/state lookup |
| 10 | `translation_keys` | Translation key definitions |
| 11 | `translations` | Translation values |

---

## Section 4: Protected User Data

**Action:** `KEEP_SELECTED`

### 4.1 Primary User Tables

#### `users`
```
KEEP WHERE id = 1 OR phone = '01227771587'
```

| Row kept | Identification | Reason |
|----------|---------------|--------|
| Super Admin | `id = 1` | Platform super administrator |
| Tarek Zaki | `phone = '01227771587'` | Platform owner / primary test user |

**DELETE WHERE** `id NOT IN (1, TarekZakiId)` — all other users.

#### `user_roles`
```
KEEP WHERE user_id IN (SELECT id FROM users WHERE id = 1 OR phone = '01227771587')
```
**DELETE WHERE** `user_id NOT IN (preserved user IDs)`.

#### `user_role_scopes`
```
KEEP WHERE user_id IN (SELECT id FROM users WHERE id = 1 OR phone = '01227771587')
```
**DELETE WHERE** `user_id NOT IN (preserved user IDs)`.

#### `user_organisations`
```
KEEP WHERE organisation_id = 1 AND user_id IN (preserved user IDs)
```
**DELETE WHERE** `organisation_id != 1` OR `user_id NOT IN (preserved user IDs)`.

#### `user_branches`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
  AND user_id IN (preserved user IDs)
```
**DELETE** all other rows.

### 4.2 Organisation Tables

#### `organisations`
```
KEEP WHERE id = 1
```
| Row kept | Identification | Reason |
|----------|---------------|--------|
| Default Organisation | `id = 1` | Primary tenant organisation |

**DELETE WHERE** `id != 1`.

#### `organisation_attribute_values`
```
KEEP WHERE organisation_id = 1
```
**DELETE WHERE** `organisation_id != 1`.

#### `organisation_subscriptions`
```
KEEP WHERE organisation_id = 1
```
**DELETE WHERE** `organisation_id != 1`.

#### `organisation_upgrade_requests` (MANUAL REVIEW — see Section 8)
```
-- MANUAL: KEEP approved/completed requests for organisation_id = 1
-- DELETE pending/rejected/test requests
```

### 4.3 Branch Tables

#### `branches`
```
KEEP WHERE organisation_id = 1
```
**DELETE WHERE** `organisation_id != 1`.

#### `branch_amenity_assignments`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
```
**DELETE** all other rows.

#### `branch_financial_details`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
```
**DELETE** all other rows.

#### `branch_player_access`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
```
**DELETE** all other rows.

#### `branch_unavailability`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
```
**DELETE** all other rows.

### 4.4 Resource Tables

#### `resources`
```
KEEP WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
```
**DELETE WHERE** `branch_id NOT IN (preserved branch IDs)`.

#### `resource_attribute_values`
```
KEEP WHERE resource_id IN (
  SELECT id FROM resources 
  WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = 1)
)
```
**DELETE** all other rows.

#### `resource_peak_hours`
```
KEEP WHERE resource_id IN (preserved resource IDs)
```
**DELETE** all other rows.

#### `resource_maintenance`
```
-- Part of Transactional Section 5 — see below
```

### 4.5 User Profile Tables

#### `user_addresses`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `user_wallets`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `user_notification_preferences`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `user_channel_preferences`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `user_quiet_hours`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `player_profiles`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `player_sport_interests`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `coach_profiles`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `seller_profiles`
```
KEEP WHERE user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `seller_shipping_rates`
```
KEEP WHERE seller_id IN (SELECT id FROM seller_profiles WHERE user_id IN (preserved user IDs))
```
**DELETE** all other rows.

#### `user_follows`
```
KEEP WHERE user_id IN (preserved user IDs) OR followed_user_id IN (preserved user IDs)
```
**DELETE** all other rows.

#### `user_friends`
```
KEEP WHERE user_id IN (preserved user IDs) OR friend_id IN (preserved user IDs)
```
**DELETE** all other rows.

---

## Section 5: Transactional Data

**Action:** `DELETE`

All rows removed from these tables. Tables remain in schema.

### 5.1 Academy / Training

| # | Table | Condition |
|---|-------|-----------|
| 1 | `academy_attendance` | DELETE ALL ROWS |
| 2 | `academy_enrollments` | DELETE ALL ROWS |
| 3 | `academy_enrollments_legacy` | DELETE ALL ROWS |
| 4 | `academy_evaluations` | DELETE ALL ROWS |
| 5 | `academy_group_sessions` | DELETE ALL ROWS |
| 6 | `academy_groups` | DELETE ALL ROWS |
| 7 | `academy_session_attendance` | DELETE ALL ROWS |

### 5.2 Advertising

| # | Table | Condition |
|---|-------|-----------|
| 8 | `ad_clicks` | DELETE ALL ROWS |
| 9 | `ad_impressions` | DELETE ALL ROWS |

### 5.3 Announcements / Community

| # | Table | Condition |
|---|-------|-----------|
| 10 | `announcement_comments` | DELETE ALL ROWS |
| 11 | `announcement_likes` | DELETE ALL ROWS |
| 12 | `announcements` | DELETE ALL ROWS |
| 13 | `org_announcements` | DELETE ALL ROWS |

### 5.4 Bookings

| # | Table | Condition |
|---|-------|-----------|
| 14 | `booking_cancellations` | DELETE ALL ROWS |
| 15 | `booking_intents` | DELETE ALL ROWS |
| 16 | `booking_invitations` | DELETE ALL ROWS |
| 17 | `booking_matchmaking_requests` | DELETE ALL ROWS |
| 18 | `booking_participants` | DELETE ALL ROWS |
| 19 | `booking_slots` | DELETE ALL ROWS |
| 20 | `bookings` | DELETE ALL ROWS |

### 5.5 Cart / Wishlist

| # | Table | Condition |
|---|-------|-----------|
| 21 | `cart_items` | DELETE ALL ROWS |
| 22 | `wishlist_items` | DELETE ALL ROWS |

### 5.6 Coach

| # | Table | Condition |
|---|-------|-----------|
| 23 | `coach_availability` | DELETE ALL ROWS |
| 24 | `coach_availability_blackouts` | DELETE ALL ROWS |
| 25 | `coach_org_agreements` | DELETE ALL ROWS |
| 26 | `coach_reviews` | DELETE ALL ROWS |
| 27 | `coach_session_events` | DELETE ALL ROWS |
| 28 | `coach_sessions` | DELETE ALL ROWS |

### 5.7 Communication / Social

| # | Table | Condition |
|---|-------|-----------|
| 29 | `conversation_participants` | DELETE ALL ROWS |
| 30 | `conversations` | DELETE ALL ROWS |
| 31 | `group_invitations` | DELETE ALL ROWS |
| 32 | `invitations` | DELETE ALL ROWS |
| 33 | `join_requests` | DELETE ALL ROWS |
| 34 | `messages` | DELETE ALL ROWS |
| 35 | `user_follows` | KEEP_SELECTED (see Section 4.5) — delete only non-user rows |
| 36 | `user_friends` | KEEP_SELECTED (see Section 4.5) — delete only non-user rows |

### 5.8 Community Events / Tournaments (legacy)

| # | Table | Condition |
|---|-------|-----------|
| 37 | `community_event_participants` | DELETE ALL ROWS |
| 38 | `community_events` | DELETE ALL ROWS |
| 39 | `community_tournaments` | DELETE ALL ROWS |

### 5.9 Coupons / Promotions

| # | Table | Condition |
|---|-------|-----------|
| 40 | `coupon_assignments` | DELETE ALL ROWS |
| 41 | `coupon_usage` | DELETE ALL ROWS |
| 42 | `coupons` | DELETE ALL ROWS |

### 5.10 CRM / Marketing

| # | Table | Condition |
|---|-------|-----------|
| 43 | `cms_contact_submission_attachments` | DELETE ALL ROWS |
| 44 | `cms_contact_submissions` | DELETE ALL ROWS |
| 45 | `customer_segments` | DELETE ALL ROWS |
| 46 | `leads` | DELETE ALL ROWS |
| 47 | `marketing_campaigns` | DELETE ALL ROWS |
| 48 | `segment_members` | DELETE ALL ROWS |
| 49 | `communication_log` | EXPORT_THEN_DELETE (see Section 6) |

### 5.11 Finance / Accounting

| # | Table | Condition |
|---|-------|-----------|
| 50 | `financial_journal_entries` | DELETE ALL ROWS |
| 51 | `general_ledger` | DELETE ALL ROWS |
| 52 | `invoice_items` | DELETE ALL ROWS |
| 53 | `invoices` | DELETE ALL ROWS |
| 54 | `marketplace_ledger_entries` | DELETE ALL ROWS |
| 55 | `payment_transactions` | DELETE ALL ROWS |
| 56 | `settlement_batches` | DELETE ALL ROWS |
| 57 | `settlement_orders` | DELETE ALL ROWS |
| 58 | `settlement_transfers` | DELETE ALL ROWS |
| 59 | `settlements` | DELETE ALL ROWS |
| 60 | `transaction_entries` | DELETE ALL ROWS |
| 61 | `transactions` | DELETE ALL ROWS |
| 62 | `wallet_transactions` | DELETE ALL ROWS |
| 63 | `withdrawal_requests` | DELETE ALL ROWS |

### 5.12 HR / Payroll

| # | Table | Condition |
|---|-------|-----------|
| 64 | `employees` | DELETE ALL ROWS |
| 65 | `employment_contracts` | DELETE ALL ROWS |
| 66 | `leave_balances` | DELETE ALL ROWS |
| 67 | `leave_requests` | DELETE ALL ROWS |
| 68 | `payroll_entries` | DELETE ALL ROWS |
| 69 | `payroll_runs` | DELETE ALL ROWS |
| 70 | `staff_attendance` | DELETE ALL ROWS |

### 5.13 Standalone Matches

| # | Table | Condition |
|---|-------|-----------|
| 71 | `matches` | DELETE ALL ROWS |
| 72 | `match_participants` | DELETE ALL ROWS |
| 73 | `match_sessions` | DELETE ALL ROWS |
| 74 | `public_match_details` | DELETE ALL ROWS |

### 5.14 Leagues

| # | Table | Condition |
|---|-------|-----------|
| 75 | `elo_ratings` | DELETE ALL ROWS |
| 76 | `league_divisions` | DELETE ALL ROWS |
| 77 | `league_matches` | DELETE ALL ROWS |
| 78 | `league_results` | DELETE ALL ROWS |
| 79 | `league_standings` | DELETE ALL ROWS |
| 80 | `league_teams` | DELETE ALL ROWS |
| 81 | `leagues` | DELETE ALL ROWS |
| 82 | `player_statistics` | DELETE ALL ROWS |
| 83 | `team_statistics` | DELETE ALL ROWS |

### 5.15 Ledger

| # | Table | Condition |
|---|-------|-----------|
| 84 | `ledger_entries` | DELETE ALL ROWS |

### 5.16 Loyalty / Rewards

| # | Table | Condition |
|---|-------|-----------|
| 85 | `loyalty_points` | DELETE ALL ROWS |
| 86 | `reward_claims` | DELETE ALL ROWS |

### 5.17 Membership Runtime

| # | Table | Condition |
|---|-------|-----------|
| 87 | `membership_history` | DELETE ALL ROWS |
| 88 | `memberships` | DELETE ALL ROWS |
| 89 | `user_memberships` | DELETE ALL ROWS |

### 5.18 Notifications Runtime

| # | Table | Condition |
|---|-------|-----------|
| 90 | `notification_ab_results` | DELETE ALL ROWS |
| 91 | `notification_alerts` | DELETE ALL ROWS |
| 92 | `notification_analytics` | EXPORT_THEN_DELETE (see Section 6) |
| 93 | `notification_audit_trail` | EXPORT_THEN_DELETE (see Section 6) |
| 94 | `notification_dead_letter_queue` | DELETE ALL ROWS |
| 95 | `notification_delivery` | DELETE ALL ROWS |
| 96 | `notification_queue` | DELETE ALL ROWS |
| 97 | `notification_replay_log` | DELETE ALL ROWS |
| 98 | `notifications` | DELETE ALL ROWS |

### 5.19 Orders / Marketplace

| # | Table | Condition |
|---|-------|-----------|
| 99 | `inventory_logs` | DELETE ALL ROWS |
| 100 | `order_items` | DELETE ALL ROWS |
| 101 | `order_status_history` | DELETE ALL ROWS |
| 102 | `orders` | DELETE ALL ROWS |
| 103 | `purchase_order_items` | DELETE ALL ROWS |
| 104 | `purchase_orders` | DELETE ALL ROWS |
| 105 | `stock_transfers` | DELETE ALL ROWS |
| 106 | `suppliers` | DELETE ALL ROWS |
| 107 | `warehouses` | DELETE ALL ROWS |

### 5.20 Product Reviews

| # | Table | Condition |
|---|-------|-----------|
| 108 | `product_reviews` | DELETE ALL ROWS |

### 5.21 Support Tickets

| # | Table | Condition |
|---|-------|-----------|
| 109 | `support_ticket_messages` | DELETE ALL ROWS |
| 110 | `support_tickets` | DELETE ALL ROWS |

### 5.22 Tournaments

| # | Table | Condition |
|---|-------|-----------|
| 111 | `tournament_group_members` | DELETE ALL ROWS |
| 112 | `tournament_groups` | DELETE ALL ROWS |
| 113 | `tournament_match_players` | DELETE ALL ROWS |
| 114 | `tournament_match_results` | DELETE ALL ROWS |
| 115 | `tournament_match_scores` | DELETE ALL ROWS |
| 116 | `tournament_matches` | DELETE ALL ROWS |
| 117 | `tournament_participants` | DELETE ALL ROWS |
| 118 | `tournament_registrations` | DELETE ALL ROWS |
| 119 | `tournament_standings` | DELETE ALL ROWS |
| 120 | `tournaments` | DELETE ALL ROWS |

### 5.23 Player Ratings

| # | Table | Condition |
|---|-------|-----------|
| 121 | `player_ratings` | DELETE ALL ROWS |

### 5.24 API Keys

| # | Table | Condition |
|---|-------|-----------|
| 122 | `api_keys` | DELETE ALL ROWS |

### 5.25 User Devices / Push

| # | Table | Condition |
|---|-------|-----------|
| 123 | `push_tokens` | DELETE ALL ROWS |
| 124 | `user_devices` | DELETE ALL ROWS |

### 5.26 Resource Runtime

| # | Table | Condition |
|---|-------|-----------|
| 125 | `resource_maintenance` | DELETE ALL ROWS |
| 126 | `resource_unavailability` | DELETE ALL ROWS |

### 5.27 Waiting List

| # | Table | Condition |
|---|-------|-----------|
| 127 | `waiting_list` | DELETE ALL ROWS |

### 5.28 Workflow Runtime

| # | Table | Condition |
|---|-------|-----------|
| 128 | `dead_letter_entries` | DELETE ALL ROWS |
| 129 | `outbox_cursors` | DELETE ALL ROWS |
| 130 | `processed_commands` | DELETE ALL ROWS |
| 131 | `processed_events` | DELETE ALL ROWS |
| 132 | `published_events` | DELETE ALL ROWS |
| 133 | `workflow_branch_instances` | DELETE ALL ROWS |
| 134 | `workflow_events` | DELETE ALL ROWS |
| 135 | `workflow_instances` | DELETE ALL ROWS |

### 5.29 Other Transactional

| # | Table | Condition |
|---|-------|-----------|
| 136 | `activity_logs` | EXPORT_THEN_DELETE (see Section 6) |
| 137 | `user_activity_log` | EXPORT_THEN_DELETE (see Section 6) |
| 138 | `push_log` | EXPORT_THEN_DELETE (see Section 6) |

---

## Section 6: Historical / Analytics Data

**Action:** `EXPORT_THEN_DELETE`

Rows exported to cold storage, then deleted from production. Export process must timestamp and store each batch.

| # | Table | Export Criteria | Risk |
|---|-------|----------------|------|
| 1 | `activity_logs` | Export all rows by `created_at` batch | LOW — activity logs are diagnostic |
| 2 | `audit_logs` | Export all rows by `created_at` batch | **MEDIUM** — compliance/legal may require retention; verify policy first |
| 3 | `client_error_reports` | Export all rows | LOW — JS error reports |
| 4 | `communication_log` | Export all rows | **MEDIUM** — outbound communication records |
| 5 | `kpi_snapshots` | Export all rows | LOW — BI snapshots, regenerable |
| 6 | `push_log` | Export all rows | LOW — push delivery log |
| 7 | `revert_logs` | Export all rows | **MEDIUM** — audit trail for data reverts |
| 8 | `web_vitals_metrics` | Export all rows | LOW — performance metrics |
| 9 | `notification_analytics` | Export all rows | LOW — delivery analytics |
| 10 | `notification_audit_trail` | Export all rows | LOW — notification audit trail |
| 11 | `user_activity_log` | Export all rows | LOW — user activity diagnostic |

---

## Section 7: Temporary / Session Data

**Action:** `DELETE`

All rows removed.

| # | Table | Condition |
|---|-------|-----------|
| 1 | `email_verification_tokens` | DELETE ALL ROWS |
| 2 | `password_reset_tokens` | DELETE ALL ROWS |
| 3 | `scheduled_jobs` | DELETE ALL ROWS |
| 4 | `user_sessions` | DELETE ALL ROWS |
| 5 | `verification_tokens` | DELETE ALL ROWS |

---

## Section 8: Manual Review Tables (11 tables)

These tables contain a mix of protected and deletable data. No automatic action.

### `products`
| Item | Detail |
|------|--------|
| **Keep condition** | `is_active = 1` OR `is_system = 1` OR created during baseline seed |
| **Delete condition** | `is_active = 0` AND `is_system = 0` AND NOT seed data |
| **Risk** | HIGH — deleting active products breaks marketplace |

### `product_images`
| Item | Detail |
|------|--------|
| **Keep condition** | `product_id` IN (kept product IDs) |
| **Delete condition** | `product_id` NOT IN (kept product IDs) |
| **Risk** | MEDIUM — orphaned images waste storage |

### `product_specifications`
| Item | Detail |
|------|--------|
| **Keep condition** | `product_id` IN (kept product IDs) |
| **Delete condition** | `product_id` NOT IN (kept product IDs) |

### `product_tags`
| Item | Detail |
|------|--------|
| **Keep condition** | `product_id` IN (kept product IDs) |
| **Delete condition** | `product_id` NOT IN (kept product IDs) |

### `product_variants`
| Item | Detail |
|------|--------|
| **Keep condition** | `product_id` IN (kept product IDs) |
| **Delete condition** | `product_id` NOT IN (kept product IDs) |

### `related_products`
| Item | Detail |
|------|--------|
| **Keep condition** | `product_id` IN (kept product IDs) AND `related_product_id` IN (kept product IDs) |
| **Delete condition** | All others |

### `media_uploads`
| Item | Detail |
|------|--------|
| **Keep condition** | `attachable_type`/`attachable_id` references kept products, kept users, or kept CMS content |
| **Delete condition** | All others (orphaned uploads) |
| **Risk** | MEDIUM — storage waste |

### `uploads`
| Item | Detail |
|------|--------|
| **Same as** | `media_uploads` — identical logic |

### `organisation_upgrade_requests`
| Item | Detail |
|------|--------|
| **Keep condition** | `organisation_id = 1` AND `status IN ('approved', 'completed')` |
| **Delete condition** | `organisation_id != 1` OR `status IN ('pending', 'rejected', 'draft')` |
| **Risk** | LOW — only affects upgrade history |

### `pricing_rules`
| Item | Detail |
|------|--------|
| **Keep condition** | `created_at` matches seed date OR `is_system = 1` OR defined for default organisation/branches |
| **Delete condition** | Ad-hoc rules added during testing |
| **Risk** | MEDIUM — incorrect deletion may break pricing |

### `pricing_seasons`
| Item | Detail |
|------|--------|
| **Keep condition** | Same as `pricing_rules` — system-defined seasons |
| **Delete condition** | Test seasons |

---

## Section 9: Execution Order

Cleanup must execute in this order to respect FK constraints:

```
Step 1: TEMPORARY DATA
  → DELETE email_verification_tokens
  → DELETE password_reset_tokens
  → DELETE verification_tokens
  → DELETE user_sessions
  → DELETE scheduled_jobs

Step 2: EXPORT HISTORICAL DATA (no FK order concerns)
  → EXPORT AND DELETE audit_logs
  → EXPORT AND DELETE activity_logs
  → EXPORT AND DELETE user_activity_log
  → EXPORT AND DELETE communication_log
  → EXPORT AND DELETE push_log
  → EXPORT AND DELETE notification_analytics
  → EXPORT AND DELETE notification_audit_trail
  → EXPORT AND DELETE client_error_reports
  → EXPORT AND DELETE kpi_snapshots
  → EXPORT AND DELETE web_vitals_metrics
  → EXPORT AND DELETE revert_logs

Step 3: TRANSACTIONAL DATA (child before parent)
  Delete children first, then parents to respect FK constraints.

  3a. Messaging/Social
    → DELETE messages
    → DELETE conversation_participants
    → DELETE conversations
    → DELETE group_invitations
    → DELETE invitations
    → DELETE join_requests

  3b. Bookings
    → DELETE booking_cancellations
    → DELETE booking_participants
    → DELETE booking_invitations
    → DELETE booking_matchmaking_requests
    → DELETE booking_intents
    → DELETE booking_slots
    → DELETE bookings

  3c. Payments/Finance
    → DELETE wallet_transactions
    → DELETE ledger_entries
    → DELETE financial_journal_entries
    → DELETE general_ledger
    → DELETE settlement_transfers
    → DELETE settlement_orders
    → DELETE settlement_batches
    → DELETE settlements
    → DELETE transaction_entries
    → DELETE transactions
    → DELETE payment_transactions
    → DELETE invoice_items
    → DELETE invoices
    → DELETE withdrawal_requests

  3d. Orders/Marketplace
    → DELETE order_items
    → DELETE order_status_history
    → DELETE orders
    → DELETE purchase_order_items
    → DELETE purchase_orders
    → DELETE stock_transfers
    → DELETE inventory_logs
    → DELETE cart_items
    → DELETE wishlist_items

  3e. Tournaments/Leagues
    → DELETE tournament_match_players
    → DELETE tournament_match_results
    → DELETE tournament_match_scores
    → DELETE tournament_matches
    → DELETE tournament_group_members
    → DELETE tournament_groups
    → DELETE tournament_standings
    → DELETE tournament_participants
    → DELETE tournament_registrations
    → DELETE tournaments
    → DELETE league_results
    → DELETE league_matches
    → DELETE league_standings
    → DELETE league_teams
    → DELETE league_divisions
    → DELETE leagues
    → DELETE elo_ratings
    → DELETE player_statistics
    → DELETE team_statistics
    → DELETE seasons

  3f. Matches
    → DELETE match_participants
    → DELETE match_sessions
    → DELETE matches
    → DELETE public_match_details

  3g. Coach
    → DELETE coach_session_events
    → DELETE coach_sessions
    → DELETE coach_reviews
    → DELETE coach_availability_blackouts
    → DELETE coach_availability
    → DELETE coach_org_agreements

  3h. Academy
    → DELETE academy_attendance
    → DELETE academy_session_attendance
    → DELETE academy_group_sessions
    → DELETE academy_enrollments
    → DELETE academy_enrollments_legacy
    → DELETE academy_evaluations
    → DELETE academy_groups

  3i. Notifications
    → DELETE notification_dead_letter_queue
    → DELETE notification_delivery
    → DELETE notification_queue
    → DELETE notification_replay_log
    → DELETE notification_ab_results
    → DELETE notification_alerts
    → DELETE notifications

  3j. Workflow
    → DELETE dead_letter_entries
    → DELETE outbox_cursors
    → DELETE processed_commands
    → DELETE processed_events
    → DELETE published_events
    → DELETE workflow_branch_instances
    → DELETE workflow_events
    → DELETE workflow_instances

  3k. Other
    → DELETE support_ticket_messages
    → DELETE support_tickets
    → DELETE player_ratings
    → DELETE coupon_usage
    → DELETE coupon_assignments
    → DELETE coupons
    → DELETE marketing_campaigns
    → DELETE segment_members
    → DELETE customer_segments
    → DELETE leads
    → DELETE cms_contact_submission_attachments
    → DELETE cms_contact_submissions
    → DELETE member_shipping_history
    → DELETE community_event_participants
    → DELETE community_events
    → DELETE community_tournaments
    → DELETE announcement_comments
    → DELETE announcement_likes
    → DELETE announcements
    → DELETE org_announcements
    → DELETE waiting_list
    → DELETE coach_sessions
    → DELETE ad_clicks
    → DELETE ad_impressions
    → DELETE api_keys
    → DELETE push_tokens
    → DELETE user_devices
    → DELETE resource_maintenance
    → DELETE resource_unavailability
    → DELETE membership_history
    → DELETE user_memberships
    → DELETE memberships
    → DELETE loyalty_points
    → DELETE reward_claims
    → DELETE employees
    → DELETE employment_contracts
    → DELETE leave_balances
    → DELETE leave_requests
    → DELETE payroll_entries
    → DELETE payroll_runs
    → DELETE staff_attendance
    → DELETE product_reviews
    → DELETE suppliers
    → DELETE warehouses

Step 4: PROTECTED USER DATA
  → DELETE users WHERE id NOT IN (1, TarekZakiId)
  → All related KEEP_SELECTED tables cascade (see Section 4)

Step 5: MANUAL REVIEW
  → Execute manually per Section 8
```

---

## Section 10: Summary Statistics

| Category | Action | Tables | Data Status |
|----------|--------|--------|-------------|
| Protected Master Data | `KEEP` | 72 | All rows preserved |
| Protected Configuration | `KEEP` | 9 | All rows preserved |
| Protected Reference Data | `KEEP` | 11 | All rows preserved |
| Protected User Data | `KEEP_SELECTED` | 26 | ~2 users + related rows preserved |
| Transactional Data | `DELETE` | 138 | All rows removed |
| Historical / Analytics | `EXPORT_THEN_DELETE` | 11 | Exported, then removed |
| Temporary / Session | `DELETE` | 5 | All rows removed |
| Manual Review | `MANUAL_REVIEW` | 11 | Human decision required |
| **Total** | | **275** | |

**Final production dataset:** 92 tables (`KEEP`) + 26 tables (user data with selected rows) + 0 rows in 154 tables = ~92 tables populated with master/ref/config data + ~2 users + their related records.

---

*End of Final Data Cleanup Specification*
