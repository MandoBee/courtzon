# Production Data Sanitization Plan

> **Date:** 2026-07-28
> **Source:** `docs/database/database-manifest.md` (275 active tables per final schema)
> **Goal:** Strip all non-essential production data while retaining master data, configuration, reference data, and the super admin + Tarek Zaki user accounts.

---

## 1. Protected Master Data (72 tables)

**Action:** KEEP ALL ROWS
**Rationale:** These tables contain business-defining entities, catalog definitions, template definitions, and published content. Every row is part of the application's essential baseline — deleting any would break seeding, onboarding, or system functionality.

| # | Table | Reason |
|---|-------|--------|
| 1 | `academies` | Academy/entity definitions (master) |
| 2 | `academy_curriculums` | Curriculum definitions |
| 3 | `academy_programs` | Program definitions |
| 4 | `academy_sessions` | Session templates/definitions |
| 5 | `accounting_periods` | Fiscal period definitions (chart-of-accounts scaffold) |
| 6 | `ad_campaigns` | Campaign definition templates |
| 7 | `ad_creatives` | Creative asset definitions |
| 8 | `ad_placements` | Ad placement zone definitions |
| 9 | `ad_pricing` | Ad pricing model definitions |
| 10 | `ad_targeting_rules` | Targeting rule definitions |
| 11 | `amenities` | Amenity master list |
| 12 | `app_versions` | Application version registry |
| 13 | `brands` | Brand master list (marketplace) |
| 14 | `cancellation_policies` | Cancellation/refund policy definitions |
| 15 | `chart_of_accounts` | Chart of accounts definitions (finance) |
| 16 | `cms_blogs` | Published blog content |
| 17 | `cms_media` | CMS media assets |
| 18 | `cms_pages` | CMS page content |
| 19 | `cms_section_blocks` | CMS section block definitions |
| 20 | `cms_sections` | CMS section definitions |
| 21 | `commission_rules` | Commission rule definitions |
| 22 | `cron_jobs` | Scheduled job definitions |
| 23 | `departments` | HR department definitions |
| 24 | `holidays` | Holiday reference data |
| 25 | `leave_types` | Leave type definitions (HR) |
| 26 | `loyalty_campaigns` | Loyalty campaign definitions |
| 27 | `membership_benefits` | Membership benefit definitions |
| 28 | `membership_plans` | Membership plan definitions |
| 29 | `migration_history` | Database migration tracking table |
| 30 | `notification_ab_tests` | Notification A/B test definitions |
| 31 | `notification_actions` | Notification action type definitions |
| 32 | `notification_broadcasts` | Broadcast template definitions |
| 33 | `notification_categories` | Notification category definitions |
| 34 | `notification_cleanup_policies` | Retention/cleanup policy definitions |
| 35 | `notification_digest_windows` | Digest window configuration |
| 36 | `notification_feature_flags` | Notification feature flag definitions |
| 37 | `notification_providers` | Notification provider configurations (SES, FCM, etc.) |
| 38 | `notification_rate_limits` | Rate limit definitions |
| 39 | `notification_template_versions` | Template version definitions |
| 40 | `notification_templates` | Notification template definitions |
| 41 | `notification_types` | Notification type definitions |
| 42 | `notification_webhooks` | Webhook endpoint definitions |
| 43 | `operating_hours` | Branch operating hour templates |
| 44 | `organisation_type_attributes` | Org type attribute definitions |
| 45 | `organisation_types` | Organisation type definitions (club, academy, etc.) |
| 46 | `payroll_components` | Payroll component definitions |
| 47 | `peak_hour_pricing` | Peak hour pricing definitions |
| 48 | `permission_modules` | Permission module definitions |
| 49 | `permissions` | Permission key definitions (UI access control) |
| 50 | `player_levels` | Player level definitions (beginner–advanced) |
| 51 | `platform_accounts` | Platform financial account configurations |
| 52 | `positions` | Job position definitions (HR) |
| 53 | `product_categories` | Product category definitions (marketplace catalog) |
| 54 | `resource_type_attributes` | Resource type attribute definitions |
| 55 | `resource_types` | Resource type definitions (court, hall, etc.) |
| 56 | `reward_catalog` | Reward catalog definitions (loyalty) |
| 57 | `role_permissions` | Role-to-permission mapping definitions |
| 58 | `role_theme_overrides` | Role-specific theme overrides |
| 59 | `roles` | Role definitions (super_admin, org_admin, seller, etc.) |
| 60 | `seasons` | League season definitions |
| 61 | `sport_positions` | Sport position definitions (goalkeeper, etc.) |
| 62 | `sports` | Sport master list |
| 63 | `subscription_features` | Subscription feature definitions |
| 64 | `subscription_plan_features` | Plan-to-feature mapping definitions |
| 65 | `subscription_plan_rates` | Plan rate definitions |
| 66 | `subscription_plans` | Subscription plan definitions |
| 67 | `tags` | Tag master list |
| 68 | `tax_rates` | Tax rate definitions |
| 69 | `tournament_bracket_types` | Tournament bracket type definitions (single elim, round robin, etc.) |
| 70 | `workflow_definitions` | Workflow template definitions |
| 71 | `workflow_event_subscriptions` | Workflow event subscription definitions |
| 72 | `workflow_steps` | Workflow step definitions |

---

## 2. Protected Configuration (9 tables)

**Action:** KEEP ALL ROWS
**Rationale:** System configuration tables control runtime behaviour. Deleting rows would alter application behaviour and require manual reconfiguration.

| # | Table | Reason |
|---|-------|--------|
| 1 | `app_settings` | Application-level configuration key-values |
| 2 | `system_settings` | System-level configuration key-values |
| 3 | `feature_flags` | Feature toggle state definitions |
| 4 | `design_tokens` | Design system CSS variable definitions |
| 5 | `sidebar_layout` | Sidebar menu layout configuration |
| 6 | `application_settings_history` | Settings change audit trail (configuration version history) |
| 7 | `payment_gateway_config` | Payment gateway integration configuration |
| 8 | `design_token_versions` | Design token version history |
| 9 | `design_theme_reset_baseline` | Theme reset baseline (design system) |

---

## 3. Protected Reference Data (11 tables)

**Action:** KEEP ALL ROWS
**Rationale:** Reference data is geo-political and financial lookup data. It changes infrequently and is required for all user-facing operations (address entry, currency conversion, translation, etc.).

| # | Table | Reason |
|---|-------|--------|
| 1 | `bank_branches` | Bank branch lookup |
| 2 | `banks` | Bank master list |
| 3 | `cities` | City lookup (geography) |
| 4 | `countries` | Country master list |
| 5 | `currencies` | Currency master list |
| 6 | `exchange_rates` | Currency exchange rate reference |
| 7 | `languages` | Language master list |
| 8 | `payment_methods` | Payment method reference |
| 9 | `provinces` | Province/state lookup |
| 10 | `translation_keys` | Translation key definitions |
| 11 | `translations` | Translation value storage |

---

## 4. Protected User Data (26 tables)

**Action:** KEEP SELECTED ROWS (delete all other rows)

**Filter criteria:**
- **`users`:** Keep only rows matching Super Admin (ID 1) and Tarek Zaki (phone: `01227771587`). Delete all other users.
- **`user_roles` / `user_role_scopes`:** Keep only rows referencing the two kept users.
- **`organisations`:** Keep only the default/origin organisation (ID 1). Delete test/demo organisations.
- **`branches`:** Keep only branches belonging to the default organisation (ID 1). Delete all other branches.
- **All other tables in this section:** Keep only rows referencing kept users, kept organisations, or kept branches via foreign key. Delete orphaned rows.

| # | Table | Filter |
|---|-------|--------|
| 1 | `users` | WHERE `id` IN (1, <Tarek Zaki ID>) OR `phone` = '01227771587' |
| 2 | `user_roles` | WHERE `user_id` IN (kept user IDs) |
| 3 | `user_role_scopes` | WHERE `user_id` IN (kept user IDs) |
| 4 | `organisations` | WHERE `id` = 1 (default organisation) |
| 5 | `branches` | WHERE `organisation_id` = 1 |
| 6 | `user_organisations` | WHERE `user_id` IN (kept user IDs) AND `organisation_id` = 1 |
| 7 | `user_branches` | WHERE `user_id` IN (kept user IDs) AND `branch_id` IN (kept branches) |
| 8 | `user_addresses` | WHERE `user_id` IN (kept user IDs) |
| 9 | `user_wallets` | WHERE `user_id` IN (kept user IDs) |
| 10 | `user_notification_preferences` | WHERE `user_id` IN (kept user IDs) |
| 11 | `user_channel_preferences` | WHERE `user_id` IN (kept user IDs) |
| 12 | `user_quiet_hours` | WHERE `user_id` IN (kept user IDs) |
| 13 | `player_profiles` | WHERE `user_id` IN (kept user IDs) |
| 14 | `player_sport_interests` | WHERE `user_id` IN (kept user IDs) |
| 15 | `coach_profiles` | WHERE `user_id` IN (kept user IDs) |
| 16 | `seller_profiles` | WHERE `user_id` IN (kept user IDs) |
| 17 | `seller_shipping_rates` | WHERE `seller_id` IN (kept seller profiles) |
| 18 | `branch_amenity_assignments` | WHERE `branch_id` IN (kept branches) |
| 19 | `branch_financial_details` | WHERE `branch_id` IN (kept branches) |
| 20 | `branch_player_access` | WHERE `branch_id` IN (kept branches) |
| 21 | `branch_unavailability` | WHERE `branch_id` IN (kept branches) |
| 22 | `organisation_attribute_values` | WHERE `organisation_id` = 1 |
| 23 | `organisation_subscriptions` | WHERE `organisation_id` = 1 |
| 24 | `resources` | WHERE `branch_id` IN (kept branches). Physical court/hall/field instances belonging to the default organisation's branches. |
| 25 | `resource_attribute_values` | WHERE `resource_id` IN (kept resources). Attribute values for kept resources. |
| 26 | `resource_peak_hours` | WHERE `resource_id` IN (kept resources). Peak hour schedules assigned to kept resources. |

---

## 5. Transactional Data (133 tables)

**Action:** DELETE ALL ROWS
**Rationale:** These tables hold runtime business transactions, user-generated content instances, and operational records. They represent activity that occurred during testing/staging and are safe to reset. The system will regenerate fresh data as users interact with the production environment.

**Academy / Training**
| # | Table | Justification |
|---|-------|---------------|
| 1 | `academy_attendance` | Attendance records per training session |
| 2 | `academy_enrollments` | Student enrollment instances |
| 3 | `academy_enrollments_legacy` | Legacy enrollment records (pre-migration) |
| 4 | `academy_evaluations` | Student evaluation records |
| 5 | `academy_group_sessions` | Group session instances |
| 6 | `academy_groups` | Training group instances |
| 7 | `academy_session_attendance` | Per-session attendance records |

**Advertising**
| # | Table | Justification |
|---|-------|---------------|
| 8 | `ad_clicks` | Ad click-through events |
| 9 | `ad_impressions` | Ad impression events |

**Announcements / Community**
| # | Table | Justification |
|---|-------|---------------|
| 10 | `announcement_comments` | Comments on announcements |
| 11 | `announcement_likes` | Likes on announcements |
| 12 | `announcements` | Announcement posts |
| 13 | `org_announcements` | Organisation-scoped announcements |

**Bookings**
| # | Table | Justification |
|---|-------|---------------|
| 14 | `booking_cancellations` | Booking cancellation records |
| 15 | `booking_intents` | Provisional booking intents |
| 16 | `booking_invitations` | Invitations to join a booking |
| 17 | `booking_matchmaking_requests` | Matchmaking requests for booking partners |
| 18 | `booking_participants` | Per-booking participant records |
| 19 | `booking_slots` | Created booking slot instances |
| 20 | `bookings` | Core booking records |

**Cart / Wishlist**
| # | Table | Justification |
|---|-------|---------------|
| 21 | `cart_items` | Shopping cart line items |
| 22 | `wishlist_items` | Wishlist product references |

**Coach**
| # | Table | Justification |
|---|-------|---------------|
| 23 | `coach_availability` | Coach availability schedules |
| 24 | `coach_availability_blackouts` | Coach blackout periods |
| 25 | `coach_org_agreements` | Agreements between coaches and orgs |
| 26 | `coach_reviews` | Coach review/rating records |
| 27 | `coach_session_events` | Coach session event instances |
| 28 | `coach_sessions` | Coach session instances |

**Communication / Social**
| # | Table | Justification |
|---|-------|---------------|
| 29 | `conversation_participants` | Conversation membership records |
| 30 | `conversations` | Conversation threads |
| 31 | `group_invitations` | Group invitation records |
| 32 | `invitations` | Generic invitation records |
| 33 | `join_requests` | Group/org join requests |
| 34 | `messages` | Chat message content |
| 35 | `user_follows` | Social follow relationships |
| 36 | `user_friends` | Friendship relationships |

**Community Events / Tournaments**
| # | Table | Justification |
|---|-------|---------------|
| 37 | `community_event_participants` | Community event attendee records |
| 38 | `community_events` | Community events |
| 39 | `community_tournaments` | Community-organised tournaments |

**Coupons / Promotions**
| # | Table | Justification |
|---|-------|---------------|
| 40 | `coupon_assignments` | Coupon-to-user assignments |
| 41 | `coupon_usage` | Coupon redemption records |
| 42 | `coupons` | Coupon instances |

**CRM / Marketing**
| # | Table | Justification |
|---|-------|---------------|
| 43 | `cms_contact_submission_attachments` | Contact form file attachments |
| 44 | `cms_contact_submissions` | Contact form submissions |
| 45 | `customer_segments` | Dynamic customer segment definitions |
| 46 | `leads` | Lead/capture records |
| 47 | `marketing_campaigns` | Marketing campaign instances |
| 48 | `segment_members` | Segment membership records |

**Finance / Accounting**
| # | Table | Justification |
|---|-------|---------------|
| 49 | `financial_journal_entries` | Journal entry instances |
| 50 | `general_ledger` | General ledger records |
| 51 | `invoice_items` | Invoice line items |
| 52 | `invoices` | Invoice instances |
| 53 | `marketplace_ledger_entries` | Marketplace financial ledger |
| 54 | `payment_transactions` | Payment gateway transaction records |
| 55 | `settlement_batches` | Settlement batch records |
| 56 | `settlement_orders` | Settlement order records |
| 57 | `settlement_transfers` | Settlement transfer records |
| 58 | `settlements` | Settlement records |
| 59 | `transaction_entries` | Financial transaction entry records |
| 60 | `transactions` | Financial transactions (deposits, transfers, payouts) |
| 61 | `wallet_transactions` | Wallet transaction history |
| 62 | `withdrawal_requests` | Withdrawal request records |

**HR / Payroll**
| # | Table | Justification |
|---|-------|---------------|
| 62 | `employees` | Employee records |
| 63 | `employment_contracts` | Employment contract records |
| 64 | `leave_balances` | Employee leave balance records |
| 65 | `leave_requests` | Employee leave request records |
| 66 | `payroll_entries` | Payroll entry instances |
| 67 | `payroll_runs` | Payroll run records |
| 68 | `staff_attendance` | Staff attendance records |

**Standalone Matches (non-league, non-tournament)**
| # | Table | Justification |
|---|-------|---------------|
| 69 | `matches` | Standalone match records (user-created) |
| 70 | `match_participants` | Match participant/player records |
| 71 | `match_sessions` | Match session instances |

**Leagues**
| # | Table | Justification |
|---|-------|---------------|
| 72 | `elo_ratings` | Player ELO rating changes |
| 73 | `league_divisions` | League division instances |
| 74 | `league_matches` | League match records |
| 75 | `league_results` | League match results |
| 76 | `league_standings` | League standing calculations |
| 77 | `league_teams` | League team registrations |
| 78 | `leagues` | League instances (user-created competitions) |
| 79 | `player_statistics` | Player statistical records |
| 80 | `team_statistics` | Team statistical records |

**Ledger / Financial Engine**
| # | Table | Justification |
|---|-------|---------------|
| 78 | `ledger_entries` | Core financial ledger entries |

**Loyalty / Rewards**
| # | Table | Justification |
|---|-------|---------------|
| 79 | `loyalty_points` | User loyalty point balances/transactions |
| 80 | `reward_claims` | Reward redemption records |

**Membership Runtime**
| # | Table | Justification |
|---|-------|---------------|
| 81 | `membership_history` | User membership change history |
| 82 | `memberships` | User membership instances |
| 83 | `user_memberships` | User membership records |

**Messages / Notifications Runtime**
| # | Table | Justification |
|---|-------|---------------|
| 84 | `notification_ab_results` | A/B test result data |
| 85 | `notification_alerts` | Alert instances |
| 86 | `notification_analytics` | Delivery analytics records |
| 87 | `notification_audit_trail` | Notification audit trail |
| 88 | `notification_dead_letter_queue` | Undeliverable notification records |
| 89 | `notification_delivery` | Notification delivery records |
| 90 | `notification_queue` | Queued notification instances |
| 91 | `notification_replay_log` | Notification replay records |
| 92 | `notifications` | Notification instances |

**Orders / Marketplace**
| # | Table | Justification |
|---|-------|---------------|
| 93 | `inventory_logs` | Inventory change log |
| 94 | `order_items` | Order line items |
| 95 | `order_status_history` | Order status transitions |
| 96 | `orders` | Marketplace orders |
| 97 | `purchase_order_items` | Purchase order line items |
| 98 | `purchase_orders` | Purchase orders |
| 99 | `stock_transfers` | Inter-warehouse stock transfers |
| 100 | `suppliers` | Supplier records |
| 101 | `warehouses` | Warehouse records |

**Product Reviews**
| # | Table | Justification |
|---|-------|---------------|
| 102 | `product_reviews` | Product review/rating records |

**Support Tickets**
| # | Table | Justification |
|---|-------|---------------|
| 103 | `support_ticket_messages` | Ticket message content |
| 104 | `support_tickets` | Support ticket instances |

**Tournaments**
| # | Table | Justification |
|---|-------|---------------|
| 105 | `tournament_group_members` | Tournament group members |
| 106 | `tournament_groups` | Tournament groups |
| 107 | `tournament_match_players` | Tournament match player records |
| 108 | `tournament_match_results` | Tournament match results |
| 109 | `tournament_match_scores` | Tournament match scores |
| 110 | `tournament_matches` | Tournament match instances |
| 111 | `tournament_participants` | Tournament participants |
| 112 | `tournament_registrations` | Tournament registration records |
| 113 | `tournament_standings` | Tournament standing calculations |
| 114 | `tournaments` | Tournament instances (user-created competitions) |

**Player Ratings**
| # | Table | Justification |
|---|-------|---------------|
| 115 | `player_ratings` | Player rating/ranking change records |

**API Keys**
| # | Table | Justification |
|---|-------|---------------|
| 116 | `api_keys` | Integration platform API key assignments |

**Match / Public Match Details**
| # | Table | Justification |
|---|-------|---------------|
| 115 | `public_match_details` | Publicly visible match details/results |

**User Devices / Push**
| # | Table | Justification |
|---|-------|---------------|
| 116 | `push_tokens` | Device push notification tokens |
| 117 | `user_devices` | User device registrations |

**Resource Runtime**
| # | Table | Justification |
|---|-------|---------------|
| 118 | `resource_maintenance` | Resource maintenance/closing records |
| 119 | `resource_unavailability` | Resource unavailability periods |

**Waiting List**
| # | Table | Justification |
|---|-------|---------------|
| 120 | `waiting_list` | Booking waiting list entries |

**Workflow Runtime**
| # | Table | Justification |
|---|-------|---------------|
| 121 | `dead_letter_entries` | Failed event/message records |
| 122 | `outbox_cursors` | Outbox cursor positions (event bus) |
| 123 | `processed_commands` | Processed command records |
| 124 | `processed_events` | Processed event records |
| 125 | `published_events` | Published event records |
| 126 | `workflow_branch_instances` | Workflow branch execution instances |
| 127 | `workflow_events` | Workflow event instances |
| 128 | `workflow_instances` | Workflow execution instances |

---

## 6. Historical / Analytics Data (8 tables)

**Action:** ARCHIVE ROWS (export to cold storage, then DELETE from production)
**Rationale:** These tables contain audit trails, activity logs, and analytics data valuable for compliance and historical analysis but not needed for production operation. Archive before purging.

| # | Table | Justification |
|---|-------|---------------|
| 1 | `activity_logs` | General activity audit trail |
| 2 | `audit_logs` | System audit log (state-changing operations) |
| 3 | `client_error_reports` | Client-side JavaScript error reports |
| 4 | `communication_log` | Outbound communication (email/SMS) log |
| 5 | `kpi_snapshots` | KPI metric snapshots (BI) |
| 6 | `push_log` | Push notification delivery log |
| 7 | `revert_logs` | Data revert/rollback audit records |
| 8 | `web_vitals_metrics` | Web Vitals performance metrics |

---

## 7. Temporary / Session Data (5 tables)

**Action:** DELETE ALL ROWS
**Rationale:** These tables hold short-lived, disposable data. Sessions expire, tokens are verified once, and jobs complete. Safe to clear entirely.

| # | Table | Justification |
|---|-------|---------------|
| 1 | `email_verification_tokens` | One-time email verification tokens |
| 2 | `password_reset_tokens` | One-time password reset tokens |
| 3 | `scheduled_jobs` | Pending scheduled job records |
| 4 | `user_sessions` | Active user session records |
| 5 | `verification_tokens` | Generic verification tokens |

---

## 8. Tables Requiring Manual Review (11 tables)

**Action:** Case-by-case cleanup. These tables contain a mix of protected reference/definition rows and transactional/operational rows that require human judgment.

| # | Table | Guidance |
|---|-------|----------|
| 1 | `products` | **KEEP** catalog products where `is_active = 1` and seeded/system products. **DELETE** test products, draft products, and products created during UAT. |
| 2 | `product_images` | **KEEP** images linked to kept products. **DELETE** images of deleted products. |
| 3 | `product_specifications` | **KEEP** specs of kept products. **DELETE** specs of deleted products. |
| 4 | `product_tags` | **KEEP** tag mappings for kept products. **DELETE** mappings for deleted products. |
| 5 | `product_variants` | **KEEP** variants of kept products. **DELETE** variants of deleted products. |
| 6 | `related_products` | **KEEP** relationships between kept products. **DELETE** all others. |
| 7 | `media_uploads` | **KEEP** uploads linked to kept products, kept CMS content, and kept user profiles. **DELETE** orphaned/transient uploads. Requires auditing `attachable_type`/`attachable_id`. |
| 8 | `uploads` | Same as `media_uploads`. Cross-reference with kept entities. |
| 9 | `organisation_upgrade_requests` | **KEEP** any approved/completed upgrades for the default organisation. **DELETE** pending/rejected/test requests. |
| 10 | `pricing_rules` | **KEEP** system-defined rules (seeded). **DELETE** ad-hoc/user-created rules added during testing. Requires defining which rules are "system" vs "custom". |
| 11 | `pricing_seasons` | **KEEP** system-defined seasons. **DELETE** test seasons. Same approach as pricing_rules. |

---

## 9. Summary Statistics

| Category | Count |
|----------|-------|
| **Protected Master Data** (KEEP ALL) | 72 |
| **Protected Configuration** (KEEP ALL) | 9 |
| **Protected Reference Data** (KEEP ALL) | 11 |
| **Protected User Data** (KEEP SELECTED) | 26 |
| **Transactional Data** (DELETE ALL) | 133 |
| **Historical / Analytics Data** (ARCHIVE THEN DELETE) | 8 |
| **Temporary / Session Data** (DELETE ALL) | 5 |
| **Manual Review Required** | 11 |
| **Total active tables** | **275**¹ |

¹ Per `database-manifest.md`. The user referenced 274 — the delta is `academy_enrollments_legacy` (Legacy status, still physically present).

**Grand total rows affected:** All rows in 146 tables (133 Transactional + 5 Temporary + 8 Historical) will be removed. 146 tables will be fully emptied. 26 tables will have selective deletions (Protected User Data). 11 tables require manual curation.

---

## Execution Order

1. **Backup** the entire database before any deletion.
2. Delete Temporary/Session data first (no FK dependencies).
3. Delete Transactional data — order matters due to FK constraints:
   - Delete children before parents (e.g., `order_items` before `orders`)
   - Suggested safe order: academy → advertising → community → booking → cart → coach → social → coupons → CRM → finance → HR → leagues → loyalty → membership → notifications → marketplace → support → tournaments → user devices → waiting lists → workflow
4. Archive Historical data (export, then delete from production).
5. Purge Protected User Data (delete non-selected users, then cascade/clean up related tables).
6. Execute Manual Review cleanup last (requires human sign-off).
7. Verify: run `node backend/scripts/seed.js` if seed data was also reset; run `node backend/scripts/sync-ui-registry.js` if permissions changed.
