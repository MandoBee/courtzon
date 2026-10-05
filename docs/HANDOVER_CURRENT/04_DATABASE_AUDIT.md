# 04 — DATABASE AUDIT

**Audit:** 2026-10-04 · Live DB audited (SELECT-only): MySQL container `courtzon-mysql`, database `courtzon_v3`.

Shape markers: ✅ IMPLEMENTED · 🟡 PARTIAL/GAP · ⏳ UNUSED · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Audited state

- Database hosting: Docker MySQL 8.0, host port **3307**, db `courtzon_v3`; also present on server: `courtzon_v3_baseline` (stale synthetic, **317 tables**, not referenced by code).
- **330 tables** in `courtzon_v3`.
- Baseline file `database/baseline/001_courtzon_v3.sql`: **328 CREATE TABLEs**.
- **Migration history:** 202 rows (all `direction='up'`), distinct filenames 202; **latest applied = `194_membership_entitlements.sql`**. All 201 files on disk applied. Extra history row not on disk: `103b_coa_cleanup.sql` (legacy artifact).
- Backend `expectedMigration` (from `/health/version`) = `194_membership_entitlements` — matches.

## 2. Drift / mismatches (critical)

| # | Issue | Severity | Detail |
|---|---|---|---|
| D1 | **`payment_allocations` not in baseline** | 🔴 HIGH | Created by `database/migrations/178_payment_allocations.sql` (PRODUCTION_SAFE). Live DB has it; baseline file does NOT. A fresh install from baseline+seeds **loses recurring-series payment allocation** (used by `payment.service.ts:1420` `UPDATE payment_allocations` and `booking/infrastructure/repositories/payment-allocation.repository.ts`). |
| D2 | `migration_history` not in baseline | 🟡 LOW | Created by migrate framework — expected; noted for completeness. |
| D3 | Migration numbering non-sequential (3× `002_*`; no `001`; no `076`; `103b` orphan) | 🟡 LOW | Preserved legacy; chain ordering is `filename`-sorted — keep convention. |
| D4 | `financial_journal_entries` = 0 rows; two ledger models | 🟡 MED | Code posts only `ledger_entries`+`general_ledger`. Decision needed (see 11 file). |
| D5 | `orders`, `settlements`, `gateway_settlements`, `academies`, `coach_profiles`, `seller_profiles`, `invoices`, `payment_allocations` all **0 rows** | 🟡 MED (data gap) | Modules code-complete, never run literally. Not schema bugs; operational evidence gaps. |
| D6 | `tournaments` dual registration-date columns (`registration_open_at/close_at` + `registration_opens/closes`) | 🟡 MED | Renamed in earlier fix but columns coexist; verify writer usage. |

## 3. Table inventory by domain (exact names)

### Auth / Users
`users` · `user_sessions` · `user_devices` · `push_tokens` · `login_attempts` · `password_reset_tokens` · `api_keys`

### Tenancy / RBAC
`organisations` · `branches` · `organisation_types` (+`organisation_type_attributes`) · `organisation_subscriptions` · `organisation_coa_customizations` · `organisation_upgrade_requests` · `organisation_verification_log` · `organisation_reviews` · `org_announcements` · `user_organisations` · `user_branches` · `user_role_scopes` · `roles` · `permission_modules` · `permissions` · `role_permissions` · `user_roles` · `user_follows` · `user_friends`

### Memberships (legacy + G11.22)
Legacy: `membership_plans` · `membership_benefits` · `memberships` · `user_memberships` · `membership_history`
New (M190–194): `organisation_membership_settings` · `membership_plan_versions` · `membership_plan_components` · `membership_plan_branches` · `membership_subscriptions` · `membership_subscription_components` · `membership_plan_installment_templates` · `membership_installments`
P3: `financial_entitlements.source_type` extended (`membership`).

### Courts / Resources / Booking
`resources` · `resource_types`(+attrs) · `resource_time_slots` · `resource_maintenance` · `resource_peak_hours` · `peak_hour_pricing` · `bookings` · `booking_slots` · `booking_cancellations` · `booking_players` · `booking_participants` · `booking_invitations` · `booking_matchmaking_requests` · `booking_settlements` · `booking_series` · `pricing_rules` · `pricing_seasons` · `cancellation_policies` · `holidays` · `branch_holidays` · `amenities` · `branch_amenities` / `branch_amenity_assignments`

### Payments / Wallet
`payment_transactions` · `payment_methods` · `payment_gateway_config` · `payment_allocations` · `gateway_settlements` · `gateway_settlement_transactions` · `invoices` · `invoice_items` · `user_wallets` · `wallet_transactions` · `withdrawal_requests` · `bank_accounts` · `branch_financial_details` · `banks`/`bank_branches`

### Accounting
`chart_of_accounts` · `account_templates` · `account_template_lines` · `accounting_event_mapping_lines` · `accounting_periods` · `ledger_entries` · `general_ledger` · `financial_journal_entries` (empty) · `transactions` · `transaction_entries` · `marketplace_ledger_entries` · `platform_accounts` · `year_closings`/`year_close_cycles` · `tax_rates`

### Entitlements / Settlement
`financial_entitlements` · `settlements` · `settlement_entitlements` · `settlement_orders` · `settlement_transfers` · `gateway_settlement_transactions`

### Tournaments
`tournaments` · `tournament_competitions` · `tournament_stages` · `tournament_groups` · `tournament_group_members` · `tournament_registrations` · `tournament_participants` · `tournament_participant_members` · `tournament_matches` · `tournament_match_results` · `tournament_match_scores` · `tournament_standings` · `tournament_placements` · `tournament_prizes` · `tournament_prize_awards` · `tournament_registration_refund_requests` · `tournament_replacement_requests` · `tournament_team_invitations` · `tournament_seeds` · `tournament_sponsors` · `tournament_draws` · `tournament_draw_entries` · `tournament_bracket_types` · `tournament_age_categories` · `waiting_list`

### Academies / Coaching
`academies` · `academy_categories` · `academy_programs` · `academy_curriculums` · `academy_groups` · `academy_schedules` · `academy_group_sessions` · `academy_sessions` · `academy_enrollments` · `academy_enrollment_payments` · `academy_attendance` · `academy_session_attendance` · `academy_evaluations` · `coach_profiles` · `coach_org_agreements` · `coach_availability`(+blackouts) · `coach_service_locations` · `coach_reviews` · `coach_sessions` · `coach_session_events` · `coaches` · `referees` · `referee_availability`(+blackouts)

### Marketplace
`seller_profiles` · `seller_shipping_rates` · `products` · `product_variants` · `product_categories` · `product_images` · `product_reviews` · `product_specifications` · `product_tags` · `related_products` · `cart_items` · `orders` · `order_items` · `order_status_history` · `marketplace_complaints` · `marketplace_complaint_config` · `wishlist_items` · `coupons` · `coupon_assignments` · `coupon_usage` · `warehouses` · `inventory_logs` · `stock_transfers` · `purchase_orders`/`items` · `suppliers` · `brands` · `tags`

### Notifications (M013–M015)
`notifications` · `notification_delivery` · `notification_audit_trail` · `notification_analytics` · `notification_templates` · `notification_template_versions` · `notification_categories` · `notification_types` · `notification_rules`(+conditions) · `notification_rate_limits` · `notification_cleanup_policies` · `notification_scheduled_jobs` · `notification_dead_letter_queue` · `notification_broadcasts` · `notification_ab_tests`/`ab_results` · `notification_webhooks` · `notification_replay_log` · `notification_providers` · `notification_digest_windows` · `notification_feature_flags` · `notification_global_settings` · `notification_queue` · `notification_actions` · `push_log` · `user_channel_preferences` · `user_notification_preferences` · `user_quiet_hours`

### Events / Outbox / Workflow
`processed_events` · `processed_commands` · `outbox_cursors` · `published_events` · `dead_letter_entries` · `workflow_definitions` · `workflow_instances` · `workflow_steps` · `workflow_events` · `workflow_event_subscriptions` · `workflow_branch_instances`

### Sports / Matches / Leagues
`matches` · `match_participants` · `match_result_records` · `match_result_participants` · `match_sessions` · `public_match_details` · `player_match_requests` · `match_result_records` · `sports` · `sport_formats` · `sport_positions` · `sport_rule_sets` · `player_levels` · `positions` · `elo_ratings` · `player_ratings`/`player_rating_history` · `player_statistics` · `team_statistics` · `leagues` · `league_divisions` · `league_teams` · `league_matches` · `league_results` · `league_standings` · `seasons` · `sport_formats`

### Community / CMS / others
`community_events` · `community_event_participants` · `conversations` · `conversation_participants` · `messages` · `group_invitations` · `join_requests` · `invitations` · `cms_pages` · `cms_sections` · `cms_section_blocks` · `cms_blogs` · `cms_media` · `cms_contact_submissions`(+attachments) · `uploads` · `achievements` · `user_targeted_achievements` · `reward_catalog` · `reward_claims` · `loyalty_points` · `loyalty_campaigns` · `ad_campaigns` · `ad_creatives` · `ad_impressions` · `ad_clicks` · `ad_placements` · `segments` · `segment_members` · `customer_segments` · `leads` · `employees` · `departments` · `employment_contracts` · `leave_types`/`leave_balances`/`leave_requests` · `attendance`/`staff_attendance` · `payroll_runs`/`entries`/`components` · `support_tickets`/`messages` · `communication_log` · `web_vitals_metrics` · `client_error_reports` · `feature_flags` · `app_settings` · `system_settings` · `app_config` · `application_settings_history` · `app_versions` · `design_tokens`(+versions, reset) · `sidebar_layout` · `role_theme_overrides` · `configuration_profiles`(+settings) · `translation_keys` · `translations` · `languages` · `countries`/`provinces`/`cities`/`currencies` · `audit_logs` · `user_addresses` · `player_profiles` · `player_emergency_contacts` · `professional_profiles`/`professional_services` · `user_sports` · `user_wallets` · `kpi_snapshots`

## 4. Selective important columns (verified highlights)

- **bookings**: `user_id`, `organisation_id`, `resource_id`, `branch_id`, `booking_type`, `booking_status` ENUM, `payment_status` ENUM, `start_at_utc`/`end_at_utc`, `total_amount`, `tax_*`, `commission_*`, `net_amount`, `club_amount`, `refunded_amount`, `coach_amount`, `series_id` (with UNIQUE `uk_booking_series_occurrence`), `cancellation_policy_snapshot` JSON.
- **payment_transactions**: `user_id`, `reference_type` varchar (e.g. `booking`, `wallet_topup`, `subscription`, `tournament`, `membership_subscription`), `reference_id`, `idempotency_key` UNIQUE, `gateway_reference` UNIQUE, `payment_method` ENUM(wallet,cash,card,bank_transfer,online), `payment_status` ENUM(8), `amount`, `currency`, `gateway_response` JSON, `gateway_settlement_id`, `gateway_settled_at`.
- **financial_entitlements**: `source_type` ENUM(7) incl. `membership`, `source_id`, `entitlement_type` (ORGANIZATION_EARNING, COURTZON_COMMISSION, ORGANIZATION_ADJUSTMENT, COURTZON_ADJUSTMENT), `collector` (courtzon/org), `status` PENDING/AVAILABLE/ON_HOLD/SETTLED/CANCELLED, UNIQUE `uk_fe_source_type`.
- **settlements**: 8-state `settlement_status`, `gross_amount`, `courtzon_fee`, `organization_net`, `cod_fee_total`, `online_net_total`, `settlement_direction`, `settlement_type`, `bank_account_id`, snapshots JSON.
- **ledger_entries**: `source_type` ENUM (booking… , `membership`, `invoice`, `wallet`, `settlement`, …), `source_id`, `event_type`, `chart_account_id`, `account_type` ENUM, `side` ENUM(debit/credit), `amount`, UNIQUE `uk_dedup`.

## 5. Constraints / idempotency guards (verified unique keys)

`users.public_id`, `users.email`, `users.full_phone`, `organisations.slug`, `products.(…)`, `payment_transactions.idempotency_key`, `gateway_reference`, `booking_series.idempotency_key`, `ledger_entries.uk_dedup`, `financial_entitlements.uk_fe_source_type`, `settlement_entitlements.entitlement_id`, `wallet_transactions.uq_wallet_txn_ref`, `processed_events/commands.uk_*`, `general_ledger.uk_gl_ledger_entry`, `bookings.series_id+booking_date+start_time`, `membership_subscriptions.public_id`, `membership_installments(subscription_id,seq)`, `membership_plan_versions(plan_id,version_no)`, `bookings.series+date+time`, `tournament_registrations(tournament,competition,player)`, `user_roles(user,role)`, `role_permissions(role,perm)`, `product_reviews(user,product)`, `cart_items(user,product,variant)`, `user_wallets.user_id`, `orders.public_id`, `invoices.invoice_number`, `booking_cancellations.booking_id`, `booking_matchmaking_requests.booking_id`.

## 6. Soft-delete behavior (verified columns)

- `users.deleted_at`, `organisations.deleted_at`, `branches.deleted_at`, `products.deleted_at`, `orders.deleted_at`, `seller_profiles.deleted_at`, `tournaments.archived_at/deleted_at`, `roles.deleted_at`.
- ⚠️ Inconsistent: not all business tables are soft-deleted; some rely on `status`/`is_active`. Confirm expectation per entity before coding joins (do NOT filter by `deleted_at IS NULL` blindly).

## 7. Audit fields

- `created_at`/`updated_at` on most tables; `audit_logs` (pattern-based, no FK) for entity changes; table triggers on `users` (update/soft-delete) and `orders` (insert/status change); `notification_audit_trail` (20 lifecycle events); audit-log admin module.

## 8. Missing constraints / index issues

- ❓ `EXPLAIN` not run during this audit. No evidence of missing indexes beyond judgement: `orders(seller_id, created_at)`, `payment_transactions(user_id, reference_type, reference_id)`, `ledger_entries(source_type, source_id)` exist as idx**-style columns?** — several `idx_*` exist; **recommend an index/perf pass** (30 file).
- ⚠️ `users.id` INT vs many BIGINT FKs — benign but inconsistent typing.
- ⚠️ Nullable audit/FK columns (e.g. `created_by`) accepted.
- ⚠️ `metadata`/`snapshot` JSON columns unchecked by DB (app-level json_valid on some).

## 9. Live row counts (10, translated to facts)

users 74 · organisations 66 · branches 60 · roles 92 (26 global) · permissions 965 · membership_plans 5 · **membership_plan_versions 0** · **membership_subscriptions 0** · **membership_installments 0** · bookings 25 · payment_transactions 1086 (paid 1080 · expired 6) · financial_entitlements 33 · tournaments 3 · products 58 · **orders 0** · notifications 2571 · ledger_entries 34816 · general_ledger 45890 · chart_of_accounts 141 · **gateway_settlements 0** · **settlement_entitlements 0** · **academies 0** · **coach_profiles 0** · **seller_profiles 0** · **payment_allocations 0** · **invoices 0** · **financial_journal_entries 0** · user_wallets 254 · wallet_transactions 409 · transactions 860 · transaction_entries 1646 · orders 0 · settlement 0

## 10. Final verdict

Schema is broad and internally consistent with its own idempotency philosophy, but the live DB is **data-evidence-starved** for money paths, the baseline has a **high-severity drift (payment_allocations)**, and two intact legacy concepts (`memberships` legacy, `financial_journal_entries`) coexist with modern ones. These must be made explicit before any team starts building on top.