# Database Table Manifest — CourtZon V3

> **Generated on:** 2026-07-28
> **Sources:** `database/baseline/001_courtzon_v3.sql` (baseline, 163 tables) + all `database/migrations/*.sql` (002–073)
> **Total unique table names tracked:** 279

| Canonical Table Name | Physical Table Name | Origin | Migration File(s) | Current Status | Exists in Final Schema | Previous Name | Replacement Table | Notes |
|---|---|---|---|---|---|---|---|---|
| academies | academies | Baseline | — | Active | YES | | | |
| academy_attendance | academy_attendance | Migration | 061_academy_training.sql | Active | YES | | | New table in Sprint 6 Academy & Training |
| academy_curriculums | academy_curriculums | Baseline | — | Active | YES | | | |
| academy_enrollments | academy_enrollments | Baseline | 061_academy_training.sql | Renamed | NO | | academy_enrollments_legacy | Renamed by Migration 061 to preserve legacy data |
| academy_enrollments | academy_enrollments | Migration | 061_academy_training.sql | Active | YES | | | New table created by Migration 061 with new schema after rename |
| academy_enrollments_legacy | academy_enrollments_legacy | Migration | 061_academy_training.sql | Legacy | YES | academy_enrollments | | Renamed FROM baseline academy_enrollments by Migration 061 |
| academy_evaluations | academy_evaluations | Baseline | — | Active | YES | | | |
| academy_group_sessions | academy_group_sessions | Migration | 061_academy_training.sql | Active | YES | | | New table in Sprint 6 Academy & Training |
| academy_groups | academy_groups | Migration | 061_academy_training.sql | Active | YES | | | New table in Sprint 6 Academy & Training |
| academy_programs | academy_programs | Migration | 061_academy_training.sql | Active | YES | | | New table in Sprint 6 Academy & Training |
| academy_session_attendance | academy_session_attendance | Baseline | — | Active | YES | | | |
| academy_sessions | academy_sessions | Baseline | — | Active | YES | | | |
| accounting_periods | accounting_periods | Migration | 068_finance_accounting.sql | Active | YES | | | |
| activity_logs | activity_logs | Baseline | — | Active | YES | | | |
| ad_campaigns | ad_campaigns | Baseline | — | Active | YES | | | |
| ad_clicks | ad_clicks | Baseline | — | Active | YES | | | |
| ad_creatives | ad_creatives | Baseline | — | Active | YES | | | |
| ad_impressions | ad_impressions | Baseline | — | Active | YES | | | |
| ad_placements | ad_placements | Baseline | — | Active | YES | | | |
| ad_pricing | ad_pricing | Baseline | — | Active | YES | | | |
| ad_targeting_rules | ad_targeting_rules | Baseline | — | Active | YES | | | |
| amenities | amenities | Baseline | — | Active | YES | | | |
| announcement_comments | announcement_comments | Baseline | — | Active | YES | | | |
| announcement_likes | announcement_likes | Baseline | — | Active | YES | | | |
| announcements | announcements | Baseline | — | Active | YES | | | |
| api_keys | api_keys | Migration | 072_integration_platform.sql | Active | YES | | | |
| app_settings | app_settings | Baseline | 073_mobile_platform.sql | Active | YES | | | Baseline table; Migration 073 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| app_versions | app_versions | Migration | 073_mobile_platform.sql | Active | YES | | | |
| application_settings_history | application_settings_history | Migration | 019_system_settings.sql | Active | YES | | | |
| audit_logs | audit_logs | Baseline | — | Active | YES | | | |
| bank_branches | bank_branches | Baseline | — | Active | YES | | | |
| banks | banks | Baseline | — | Active | YES | | | |
| booking_cancellations | booking_cancellations | Baseline | — | Active | YES | | | |
| booking_intents | booking_intents | Baseline | — | Active | YES | | | |
| booking_invitations | booking_invitations | Baseline | — | Active | YES | | | |
| booking_matchmaking_requests | booking_matchmaking_requests | Baseline | — | Active | YES | | | |
| booking_participants | booking_participants | Baseline | — | Active | YES | | | |
| booking_slots | booking_slots | Baseline | — | Active | YES | | | |
| bookings | bookings | Baseline | — | Active | YES | | | |
| branch_amenity_assignments | branch_amenity_assignments | Baseline | — | Active | YES | | | |
| branch_financial_details | branch_financial_details | Baseline | — | Active | YES | | | |
| branch_player_access | branch_player_access | Baseline | — | Active | YES | | | |
| branch_unavailability | branch_unavailability | Baseline | — | Active | YES | | | |
| branches | branches | Baseline | — | Active | YES | | | |
| brands | brands | Baseline | — | Active | YES | | | |
| cancellation_policies | cancellation_policies | Baseline | — | Active | YES | | | |
| cart_items | cart_items | Baseline | — | Active | YES | | | |
| chart_of_accounts | chart_of_accounts | Migration | 068_finance_accounting.sql | Active | YES | | | |
| cities | cities | Baseline | — | Active | YES | | | |
| client_error_reports | client_error_reports | Migration | 016_monitoring_alerts.sql | Active | YES | | | |
| cms_blogs | cms_blogs | Baseline | — | Active | YES | | | |
| cms_contact_submission_attachments | cms_contact_submission_attachments | Baseline | — | Active | YES | | | |
| cms_contact_submissions | cms_contact_submissions | Baseline | — | Active | YES | | | |
| cms_media | cms_media | Baseline | — | Active | YES | | | |
| cms_pages | cms_pages | Baseline | — | Active | YES | | | |
| cms_section_blocks | cms_section_blocks | Baseline | — | Active | YES | | | |
| cms_sections | cms_sections | Baseline | — | Active | YES | | | |
| coach_availability | coach_availability | Baseline | — | Active | YES | | | |
| coach_availability_blackouts | coach_availability_blackouts | Baseline | — | Active | YES | | | |
| coach_org_agreements | coach_org_agreements | Baseline | — | Active | YES | | | |
| coach_profiles | coach_profiles | Baseline | — | Active | YES | | | |
| coach_reviews | coach_reviews | Baseline | — | Active | YES | | | |
| coach_session_events | coach_session_events | Migration | 033_coach_collaboration_flow.sql | Active | YES | | | Created via dynamic SQL with IF NOT EXISTS guard |
| coach_sessions | coach_sessions | Baseline | — | Active | YES | | | |
| commission_rules | commission_rules | Baseline | — | Active | YES | | | |
| communication_log | communication_log | Migration | 069_crm_marketing.sql | Active | YES | | | |
| community_event_participants | community_event_participants | Baseline | — | Active | YES | | | |
| community_events | community_events | Baseline | — | Active | YES | | | |
| community_tournaments | community_tournaments | Baseline | — | Active | YES | | | |
| conversation_participants | conversation_participants | Baseline | — | Active | YES | | | |
| conversations | conversations | Baseline | — | Active | YES | | | |
| countries | countries | Baseline | — | Active | YES | | | |
| coupon_assignments | coupon_assignments | Baseline | — | Active | YES | | | |
| coupon_usage | coupon_usage | Baseline | — | Active | YES | | | |
| coupons | coupons | Baseline | — | Active | YES | | | |
| cron_jobs | cron_jobs | Baseline | — | Active | YES | | | |
| currencies | currencies | Baseline | — | Active | YES | | | |
| customer_segments | customer_segments | Migration | 069_crm_marketing.sql | Active | YES | | | |
| dead_letter_entries | dead_letter_entries | Migration | 043_dead_letter.sql | Active | YES | | | |
| departments | departments | Migration | 070_hr_payroll.sql | Active | YES | | | |
| design_theme_reset_baseline | design_theme_reset_baseline | Baseline | — | Active | YES | | | |
| design_token_versions | design_token_versions | Baseline | — | Active | YES | | | |
| design_tokens | design_tokens | Baseline | — | Active | YES | | | |
| elo_ratings | elo_ratings | Migration | 056_tournaments.sql | Active | YES | | | |
| email_verification_tokens | email_verification_tokens | Baseline | — | Active | YES | | | |
| employees | employees | Migration | 070_hr_payroll.sql | Active | YES | | | |
| employment_contracts | employment_contracts | Migration | 070_hr_payroll.sql | Active | YES | | | |
| exchange_rates | exchange_rates | Baseline | — | Active | YES | | | |
| feature_flags | feature_flags | Baseline | — | Active | YES | | | |
| financial_journal_entries | financial_journal_entries | Baseline | — | Active | YES | | | |
| general_ledger | general_ledger | Migration | 068_finance_accounting.sql | Active | YES | | | |
| group_invitations | group_invitations | Migration | 027_chat_groups_pins_unread.sql | Active | YES | | | |
| holidays | holidays | Baseline | — | Active | YES | | | |
| inventory_logs | inventory_logs | Baseline | — | Active | YES | | | |
| invitations | invitations | Migration | 019_create_invitations.sql | Active | YES | | | |
| invoice_items | invoice_items | Migration | 068_finance_accounting.sql | Active | YES | | | |
| invoices | invoices | Migration | 068_finance_accounting.sql | Active | YES | | | |
| join_requests | join_requests | Migration | 020_create_join_requests.sql | Active | YES | | | |
| kpi_snapshots | kpi_snapshots | Migration | 071_business_intelligence.sql | Active | YES | | | |
| languages | languages | Baseline | — | Active | YES | | | |
| leads | leads | Migration | 069_crm_marketing.sql | Active | YES | | | |
| league_divisions | league_divisions | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| league_matches | league_matches | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| league_results | league_results | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| league_standings | league_standings | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| league_teams | league_teams | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| leagues | leagues | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| leave_balances | leave_balances | Migration | 070_hr_payroll.sql | Active | YES | | | |
| leave_requests | leave_requests | Migration | 070_hr_payroll.sql | Active | YES | | | |
| leave_types | leave_types | Migration | 070_hr_payroll.sql | Active | YES | | | |
| ledger_entries | ledger_entries | Migration | 054_financial_engine.sql | Active | YES | | | |
| loyalty_campaigns | loyalty_campaigns | Migration | 055_membership_loyalty.sql | Active | YES | | | |
| loyalty_points | loyalty_points | Migration | 055_membership_loyalty.sql | Active | YES | | | |
| marketing_campaigns | marketing_campaigns | Migration | 069_crm_marketing.sql | Active | YES | | | |
| marketplace_ledger_entries | marketplace_ledger_entries | Baseline | — | Active | YES | | | |
| match_participants | match_participants | Migration | 021_create_match_participants.sql | Active | YES | | | |
| match_sessions | match_sessions | Migration | 022_create_match_sessions.sql | Active | YES | | | |
| matches | matches | Migration | 017_create_matches.sql | Active | YES | | | |
| media_uploads | media_uploads | Baseline | — | Active | YES | | | |
| membership_benefits | membership_benefits | Migration | 020_membership_foundation.sql | Active | YES | | | |
| membership_history | membership_history | Migration | 020_membership_foundation.sql | Active | YES | | | |
| membership_plans | membership_plans | Migration | 020_membership_foundation.sql | Active | YES | | | Created by Migration 020; Migration 055 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| memberships | memberships | Migration | 055_membership_loyalty.sql | Active | YES | | | |
| messages | messages | Baseline | — | Active | YES | | | |
| migration_history | migration_history | Baseline | — | Active | YES | | | |
| notification_ab_results | notification_ab_results | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_ab_tests | notification_ab_tests | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_actions | notification_actions | Baseline | — | Active | YES | | | |
| notification_alerts | notification_alerts | Migration | 016_monitoring_alerts.sql | Active | YES | | | |
| notification_analytics | notification_analytics | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_audit_trail | notification_audit_trail | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_broadcasts | notification_broadcasts | Migration | 014_notification_broadcasts.sql | Active | YES | | | |
| notification_categories | notification_categories | Baseline | — | Active | YES | | | |
| notification_cleanup_policies | notification_cleanup_policies | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_dead_letter_queue | notification_dead_letter_queue | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_delivery | notification_delivery | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_digest_windows | notification_digest_windows | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_feature_flags | notification_feature_flags | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_providers | notification_providers | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_queue | notification_queue | Baseline | — | Active | YES | | | |
| notification_rate_limits | notification_rate_limits | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_replay_log | notification_replay_log | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_template_versions | notification_template_versions | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notification_templates | notification_templates | Migration | 013_notifications_enterprise.sql | Active | YES | | | |
| notification_types | notification_types | Migration | 017_notification_types.sql | Active | YES | | | |
| notification_webhooks | notification_webhooks | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| notifications | notifications | Baseline | — | Active | YES | | | |
| operating_hours | operating_hours | Baseline | — | Active | YES | | | |
| order_items | order_items | Baseline | — | Active | YES | | | |
| order_status_history | order_status_history | Baseline | — | Active | YES | | | |
| orders | orders | Baseline | — | Active | YES | | | |
| org_announcements | org_announcements | Migration | 065_org_announcements.sql | Active | YES | | | |
| organisation_attribute_values | organisation_attribute_values | Baseline | — | Active | YES | | | |
| organisation_subscriptions | organisation_subscriptions | Baseline | — | Active | YES | | | |
| organisation_type_attributes | organisation_type_attributes | Baseline | — | Active | YES | | | |
| organisation_types | organisation_types | Baseline | — | Active | YES | | | |
| organisation_upgrade_requests | organisation_upgrade_requests | Baseline | — | Active | YES | | | |
| organisations | organisations | Baseline | — | Active | YES | | | |
| outbox_cursors | outbox_cursors | Migration | 045_outbox_cursors.sql | Active | YES | | | |
| password_reset_tokens | password_reset_tokens | Baseline | — | Active | YES | | | |
| payment_gateway_config | payment_gateway_config | Baseline | — | Active | YES | | | |
| payment_methods | payment_methods | Baseline | — | Active | YES | | | |
| payment_transactions | payment_transactions | Baseline | — | Active | YES | | | |
| payroll_components | payroll_components | Migration | 070_hr_payroll.sql | Active | YES | | | |
| payroll_entries | payroll_entries | Migration | 070_hr_payroll.sql | Active | YES | | | |
| payroll_runs | payroll_runs | Migration | 070_hr_payroll.sql | Active | YES | | | |
| peak_hour_pricing | peak_hour_pricing | Baseline | — | Active | YES | | | |
| permission_modules | permission_modules | Baseline | — | Active | YES | | | |
| permissions | permissions | Baseline | — | Active | YES | | | |
| platform_accounts | platform_accounts | Baseline | — | Active | YES | | | |
| player_levels | player_levels | Baseline | — | Active | YES | | | |
| player_profiles | player_profiles | Baseline | — | Active | YES | | | |
| player_ratings | player_ratings | Baseline | — | Active | YES | | | |
| player_sport_interests | player_sport_interests | Baseline | — | Active | YES | | | |
| player_statistics | player_statistics | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| positions | positions | Migration | 070_hr_payroll.sql | Active | YES | | | |
| pricing_rules | pricing_rules | Migration | 053_pricing_engine.sql | Active | YES | | | |
| pricing_seasons | pricing_seasons | Migration | 053_pricing_engine.sql | Active | YES | | | |
| processed_commands | processed_commands | Migration | 042_processed_commands.sql | Active | YES | | | |
| processed_events | processed_events | Migration | 039_event_bus_processed_events.sql | Active | YES | | | |
| product_categories | product_categories | Baseline | — | Active | YES | | | |
| product_images | product_images | Baseline | — | Active | YES | | | |
| product_reviews | product_reviews | Baseline | — | Active | YES | | | |
| product_specifications | product_specifications | Baseline | — | Active | YES | | | |
| product_tags | product_tags | Baseline | — | Active | YES | | | |
| product_variants | product_variants | Baseline | — | Active | YES | | | |
| products | products | Baseline | — | Active | YES | | | |
| provinces | provinces | Baseline | — | Active | YES | | | |
| public_match_details | public_match_details | Migration | 018_create_public_match_details.sql | Active | YES | | | |
| published_events | published_events | Migration | 044_published_events.sql | Active | YES | | | |
| purchase_order_items | purchase_order_items | Migration | 067_marketplace_inventory.sql | Active | YES | | | |
| purchase_orders | purchase_orders | Migration | 067_marketplace_inventory.sql | Active | YES | | | |
| push_log | push_log | Migration | 073_mobile_platform.sql | Active | YES | | | |
| push_tokens | push_tokens | Migration | 073_mobile_platform.sql | Active | YES | | | |
| related_products | related_products | Baseline | — | Active | YES | | | |
| resource_attribute_values | resource_attribute_values | Baseline | — | Active | YES | | | |
| resource_maintenance | resource_maintenance | Baseline | — | Active | YES | | | |
| resource_peak_hours | resource_peak_hours | Baseline | — | Active | YES | | | |
| resource_type_attributes | resource_type_attributes | Baseline | — | Active | YES | | | |
| resource_types | resource_types | Baseline | — | Active | YES | | | |
| resource_unavailability | resource_unavailability | Baseline | — | Active | YES | | | |
| resources | resources | Baseline | — | Active | YES | | | |
| revert_logs | revert_logs | Baseline | — | Active | YES | | | |
| reward_catalog | reward_catalog | Migration | 055_membership_loyalty.sql | Active | YES | | | |
| reward_claims | reward_claims | Migration | 055_membership_loyalty.sql | Active | YES | | | |
| role_permissions | role_permissions | Baseline | — | Active | YES | | | |
| role_theme_overrides | role_theme_overrides | Baseline | — | Active | YES | | | |
| roles | roles | Baseline | — | Active | YES | | | |
| scheduled_jobs | scheduled_jobs | Baseline | — | Active | YES | | | |
| seasons | seasons | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| segment_members | segment_members | Migration | 069_crm_marketing.sql | Active | YES | | | |
| seller_profiles | seller_profiles | Baseline | — | Active | YES | | | |
| seller_shipping_rates | seller_shipping_rates | Baseline | — | Active | YES | | | |
| settlement_batches | settlement_batches | Migration | 054_financial_engine.sql | Active | YES | | | |
| settlement_items_v1 | settlement_items_v1 | Baseline | 052_drop_legacy_settlement_tables.sql | Dropped | NO | | | Dropped by Migration 052; replaced by V2 settlement model |
| settlement_orders | settlement_orders | Baseline | — | Active | YES | | | |
| settlement_transfers | settlement_transfers | Baseline | — | Active | YES | | | |
| settlements | settlements | Baseline | — | Active | YES | | | |
| settlements_v1 | settlements_v1 | Baseline | 052_drop_legacy_settlement_tables.sql | Dropped | NO | | | Dropped by Migration 052; replaced by V2 settlement model |
| sidebar_layout | sidebar_layout | Baseline | — | Active | YES | | | |
| sport_positions | sport_positions | Baseline | — | Active | YES | | | |
| sports | sports | Baseline | — | Active | YES | | | |
| staff_attendance | staff_attendance | Migration | 070_hr_payroll.sql | Active | YES | | | |
| stock_transfers | stock_transfers | Migration | 067_marketplace_inventory.sql | Active | YES | | | |
| subscription_features | subscription_features | Baseline | — | Active | YES | | | |
| subscription_plan_features | subscription_plan_features | Baseline | — | Active | YES | | | |
| subscription_plan_rates | subscription_plan_rates | Baseline | — | Active | YES | | | |
| subscription_plans | subscription_plans | Baseline | — | Active | YES | | | |
| suppliers | suppliers | Migration | 067_marketplace_inventory.sql | Active | YES | | | |
| support_ticket_messages | support_ticket_messages | Migration | 066_support_tickets.sql | Active | YES | | | |
| support_tickets | support_tickets | Migration | 066_support_tickets.sql | Active | YES | | | |
| system_settings | system_settings | Baseline | 019_system_settings.sql | Active | YES | | | Baseline table; Migration 019 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| tags | tags | Baseline | — | Active | YES | | | |
| tax_rates | tax_rates | Migration | 068_finance_accounting.sql | Active | YES | | | |
| team_statistics | team_statistics | Migration | 063_league_season_ranking.sql | Active | YES | | | |
| tournament_bracket_types | tournament_bracket_types | Baseline | — | Active | YES | | | |
| tournament_group_members | tournament_group_members | Migration | 062_tournament_competition.sql | Active | YES | | | |
| tournament_groups | tournament_groups | Migration | 062_tournament_competition.sql | Active | YES | | | |
| tournament_match_players | tournament_match_players | Migration | 062_tournament_competition.sql | Active | YES | | | |
| tournament_match_results | tournament_match_results | Migration | 062_tournament_competition.sql | Active | YES | | | |
| tournament_match_scores | tournament_match_scores | Baseline | — | Active | YES | | | |
| tournament_matches | tournament_matches | Baseline | 056_tournaments.sql | Active | YES | | | Baseline table; Migration 056 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| tournament_participants | tournament_participants | Migration | 056_tournaments.sql | Active | YES | | | |
| tournament_registrations | tournament_registrations | Baseline | — | Active | YES | | | |
| tournament_standings | tournament_standings | Migration | 062_tournament_competition.sql | Active | YES | | | |
| tournaments | tournaments | Baseline | 056_tournaments.sql | Active | YES | | | Baseline table; Migration 056 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| transaction_entries | transaction_entries | Baseline | — | Active | YES | | | |
| transactions | transactions | Baseline | — | Active | YES | | | |
| translation_keys | translation_keys | Baseline | — | Active | YES | | | |
| translations | translations | Baseline | — | Active | YES | | | |
| uploads | uploads | Baseline | — | Active | YES | | | |
| user_addresses | user_addresses | Baseline | — | Active | YES | | | |
| user_branches | user_branches | Migration | 060_create_user_organisations_user_branches.sql | Active | YES | | | |
| user_channel_preferences | user_channel_preferences | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| user_devices | user_devices | Baseline | 015_notification_enterprise_platform.sql | Active | YES | | | Baseline table; Migration 015 also has CREATE TABLE IF NOT EXISTS (idempotent) |
| user_follows | user_follows | Baseline | — | Active | YES | | | |
| user_friends | user_friends | Baseline | — | Active | YES | | | |
| user_memberships | user_memberships | Migration | 020_membership_foundation.sql | Active | YES | | | |
| user_notification_preferences | user_notification_preferences | Baseline | — | Active | YES | | | |
| user_organisations | user_organisations | Migration | 060_create_user_organisations_user_branches.sql | Active | YES | | | |
| user_quiet_hours | user_quiet_hours | Migration | 015_notification_enterprise_platform.sql | Active | YES | | | |
| user_role_scopes | user_role_scopes | Baseline | — | Active | YES | | | |
| user_roles | user_roles | Baseline | — | Active | YES | | | |
| user_sessions | user_sessions | Baseline | — | Active | YES | | | |
| user_wallets | user_wallets | Baseline | — | Active | YES | | | |
| users | users | Baseline | — | Active | YES | | | |
| waiting_list | waiting_list | Migration | 023_create_waiting_list.sql | Active | YES | | | |
| wallet_transactions | wallet_transactions | Baseline | — | Active | YES | | | |
| warehouses | warehouses | Migration | 067_marketplace_inventory.sql | Active | YES | | | |
| web_vitals_metrics | web_vitals_metrics | Migration | 016_monitoring_alerts.sql | Active | YES | | | |
| wishlist_items | wishlist_items | Baseline | — | Active | YES | | | |
| withdrawal_requests | withdrawal_requests | Baseline | — | Active | YES | | | |
| workflow_branch_instances | workflow_branch_instances | Migration | 048_workflow_branch_instances.sql | Active | YES | | | |
| workflow_definitions | workflow_definitions | Migration | 047_workflow_definitions.sql | Active | YES | | | |
| workflow_event_subscriptions | workflow_event_subscriptions | Migration | 046_workflow_event_subscriptions.sql | Active | YES | | | |
| workflow_events | workflow_events | Migration | 040_workflow_tables.sql | Active | YES | | | |
| workflow_instances | workflow_instances | Migration | 040_workflow_tables.sql | Active | YES | | | |
| workflow_steps | workflow_steps | Migration | 040_workflow_tables.sql | Active | YES | | | |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Baseline tables (original CREATE TABLE) | 163 |
| Migration-created tables | 116 |
| Total unique table names tracked | 279 |
| Active (exists in final schema) | 275 |
| Dropped | 2 (`settlement_items_v1`, `settlements_v1`) |
| Renamed | 1 (baseline `academy_enrollments`) |
| Legacy | 1 (`academy_enrollments_legacy`) |
| Duplicate IF NOT EXISTS references (origin already in baseline) | 5 (`app_settings`, `system_settings`, `tournaments`, `tournament_matches`, `user_devices`) |
| Duplicate IF NOT EXISTS references (origin already in earlier migration) | 1 (`membership_plans` in 020 → also in 055) |
