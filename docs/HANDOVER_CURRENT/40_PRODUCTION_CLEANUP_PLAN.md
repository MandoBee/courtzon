# 40 - PRODUCTION DATABASE CLEANUP PLAN (FINAL - v3)

**PRODUCTION TARGET:** `187.127.72.93:3307 / courtzon_v3`
**READ-ONLY:** YES (this document only; no deletions performed)
**CLEANUP EXECUTED:** NO
**FK ORDER VALIDATION:** PASS
**FINAL CLASSIFICATION:** KEEP = 123 | CLEAR = 136 | REVIEW = 71
**PRODUCTION CLEANUP STATUS:** AWAITING FINAL HUMAN APPROVAL

This v3 supersedes v2: it applies the eight (8) classification decisions verified in `41_CLEANUP_FINAL_ADJUSTMENTS.md` and RECALCULATES the entire plan against live Production data (audited 2026-10-04).

## 0. Approved classification deltas applied (from 41)

| Table | Rows | Decision verified | New class |
|---|---|---|---|
| user_sessions | 3,606 | auth runtime (0 active, all revoked) | CLEAR |
| processed_commands | 190 | dedup/idempotency | CLEAR |
| processed_events | 5 | dedup/idempotency | CLEAR |
| notification_rate_limits | 473 | runtime throttle buckets | CLEAR |
| workflow_definitions | 3,700 | accumulated workflow version snapshots | CLEAR |
| organisation_subscriptions | 19 | real billing state (1 active) | KEEP |
| user_wallets | 28 | financial account identity (all 0.00 balance) | KEEP |
| player_ratings | 2 | derived from match result :2 (being cleared) | CLEAR |
Preserved: player_rating_history=CLEAR, player_elo_ratings=CLEAR, migration_history=KEEP (201 rows, untouched).

## 1. Authoritative Production evidence (read-only, 2026-10-04)

| Item | Value |
|---|---|
| MySQL | 8.0.46 (instance 2515d404b031) |
| Tables | 330 |
| Migration rows | 201 (latest 194_membership_entitlements.sql) |
| users / organisations / branches / products | 28 / 17 / 8 / 93 |
| permissions / roles / modules | 971 / 42 / 50 |
| notification_templates / categories | 337 / 18 |
| chart_of_accounts / mapping lines / templates | 91 / 229 / 3 |
| payment_methods / payment_gateway_config | 6 / 3 |
| membership_plans / versions / subscription_plans | 0 / 0 / 7 |

## 2. FINAL CLASSIFICATION (all 330 tables)

| TABLE | ROWS | PK | FKs | RefBy | CLASS |
|---|---|---|---|---|---|
| academies | 0 | id | branch_id->branches.id; organisation_id->organisations.id; sport_id->sports.id | academy_curriculums(academy_id); academy_evaluations(academy_id); academy_sessions(academy_id) | REVIEW |
| academy_attendance | 0 | id | enrollment_id->academy_enrollments.id; group_session_id->academy_group_sessions.id | - | CLEAR |
| academy_categories | 0 | id | - | - | KEEP |
| academy_curriculums | 0 | id | academy_id->academies.id | academy_sessions(curriculum_id) | REVIEW |
| academy_enrollment_payments | 0 | id | payment_transaction_id->payment_transactions.id | - | CLEAR |
| academy_enrollments | 0 | id | payment_confirmed_by->users.id; group_id->academy_groups.id; player_id->users.id; program_id->academy_programs.id | academy_attendance(enrollment_id) | CLEAR |
| academy_evaluations | 0 | id | academy_id->academies.id; evaluator_id->users.id; player_id->users.id | - | CLEAR |
| academy_group_sessions | 0 | id | confirmed_by->users.id; pending_resolved_by->users.id; schedule_id->academy_schedules.id; coach_id->users.id | academy_attendance(group_session_id) | CLEAR |
| academy_groups | 0 | id | coach_locked_by->users.id; coach_id->users.id; program_id->academy_programs.id | academy_enrollments(group_id); academy_group_sessions(group_id); academy_schedules(group_id) | REVIEW |
| academy_programs | 0 | id | branch_id->branches.id; confirmed_by->users.id; organisation_id->organisations.id; sport_id->sports.id | academy_enrollments(program_id); academy_groups(program_id) | REVIEW |
| academy_schedules | 0 | id | branch_id->branches.id; preferred_court_id->resources.id; created_by->users.id; group_id->academy_groups.id | academy_group_sessions(schedule_id) | REVIEW |
| academy_session_attendance | 0 | id | player_id->users.id; session_id->academy_sessions.id | - | CLEAR |
| academy_sessions | 0 | id | academy_id->academies.id; coach_id->users.id; curriculum_id->academy_curriculums.id; resource_id->resources.id | academy_session_attendance(session_id) | CLEAR |
| account_template_lines | 26 | id | parent_line_id->account_template_lines.id; template_id->account_templates.id | account_template_lines(parent_line_id) | KEEP |
| account_templates | 3 | id | created_by->users.id; organisation_id->organisations.id | account_template_lines(template_id) | KEEP |
| accounting_event_mapping_lines | 229 | id | account_id->chart_of_accounts.id; organisation_id->organisations.id | - | KEEP |
| accounting_periods | 2 | id | closed_by->users.id; organisation_id->organisations.id | general_ledger(period_id); ledger_entries(period_id) | REVIEW |
| achievements | 0 | achievement_key | - | user_targeted_achievements(achievement_key) | REVIEW |
| activity_logs | 0 | id | - | - | CLEAR |
| ad_campaigns | 0 | id | created_by->users.id; organisation_id->organisations.id; placement_id->ad_placements.id | ad_clicks(campaign_id); ad_creatives(campaign_id); ad_impressions(campaign_id) | CLEAR |
| ad_clicks | 0 | id | campaign_id->ad_campaigns.id; impression_id->ad_impressions.id | - | CLEAR |
| ad_creatives | 0 | id | campaign_id->ad_campaigns.id | - | CLEAR |
| ad_impressions | 0 | id | campaign_id->ad_campaigns.id | ad_clicks(impression_id) | CLEAR |
| ad_placements | 0 | id | - | ad_campaigns(placement_id) | CLEAR |
| amenities | 20 | id | - | branch_amenities(amenity_id) | KEEP |
| announcements | 0 | id | organisation_id->organisations.id; user_id->users.id | - | REVIEW |
| api_keys | 0 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP |
| app_config | 0 | id | - | - | KEEP |
| app_settings | 15 | id | updated_by->users.id | - | KEEP |
| app_versions | 0 | id | - | - | REVIEW |
| application_settings_history | 1 | id | - | - | KEEP |
| audit_logs | 79 | id | - | - | REVIEW |
| bank_accounts | 0 | id | branch_id->branches.id | - | REVIEW |
| bank_branches | 2 | id | bank_id->banks.id | - | KEEP |
| banks | 11 | id | country_id->countries.id | bank_branches(bank_id) | KEEP |
| booking_cancellations | 0 | id | - | - | CLEAR |
| booking_invitations | 0 | id | - | - | CLEAR |
| booking_matchmaking_requests | 1 | id | booking_id->bookings.id; target_level_id->player_levels.id | - | CLEAR |
| booking_participants | 0 | id | - | - | CLEAR |
| booking_players | 0 | id | booking_id->bookings.id; player_id->users.id | - | CLEAR |
| booking_series | 0 | id | - | payment_allocations(series_id) | CLEAR |
| booking_settlements | 0 | id | booking_id->bookings.id; created_by->users.id; organisation_id->organisations.id | - | CLEAR |
| booking_slots | 3 | id | - | - | CLEAR |
| bookings | 5 | id | branch_id->branches.id; tax_rate_id->tax_rates.id | booking_matchmaking_requests(booking_id); booking_players(booking_id); booking_settlements(booking_id); coach_sessions(booking_id) | CLEAR |
| branch_amenities | 0 | branch_id,amenity_id | amenity_id->amenities.id; branch_id->branches.id | - | KEEP |
| branch_amenity_assignments | 5 | id | - | - | KEEP |
| branch_financial_details | 2 | id | branch_id->branches.id | withdrawal_requests(branch_financial_details_id) | KEEP |
| branch_holidays | 0 | id | branch_id->branches.id | - | KEEP |
| branch_player_access | 0 | id | branch_id->branches.id; player_id->users.id; reviewed_by->users.id | - | REVIEW |
| branch_staff | 0 | branch_id,user_id | branch_id->branches.id; user_id->users.id | - | KEEP |
| branches | 14 | id | currency_id->currencies.id; organisation_id->organisations.id | academies(branch_id); academy_programs(branch_id); academy_schedules(branch_id); bank_accounts(branch_id) | KEEP |
| brands | 76 | id | - | products(brand_id) | KEEP |
| cancellation_policies | 6 | id | branch_id->branches.id | - | KEEP |
| cart_items | 1 | id | product_id->products.id; user_id->users.id | - | CLEAR |
| chart_of_accounts | 91 | id | organisation_id->organisations.id; parent_id->chart_of_accounts.id | accounting_event_mapping_lines(account_id); chart_of_accounts(parent_id); general_ledger(account_id); ledger_entries(chart_account_id) | KEEP |
| cities | 333 | id | province_id->provinces.id | - | KEEP |
| client_error_reports | 0 | id | - | - | CLEAR |
| cms_blogs | 3 | id | author_id->users.id | - | REVIEW |
| cms_contact_submission_attachments | 0 | id | submission_id->cms_contact_submissions.id; upload_id->uploads.id | - | REVIEW |
| cms_contact_submissions | 0 | id | - | cms_contact_submission_attachments(submission_id) | REVIEW |
| cms_media | 0 | id | uploaded_by->users.id | - | REVIEW |
| cms_pages | 10 | id | - | cms_section_blocks(page_id); cms_sections(page_id) | REVIEW |
| cms_section_blocks | 78 | id | page_id->cms_pages.id | - | REVIEW |
| cms_sections | 0 | id | page_id->cms_pages.id | - | REVIEW |
| coach_availability | 7 | id | branch_id->branches.id; coach_id->coach_profiles.id | - | REVIEW |
| coach_availability_blackouts | 0 | id | coach_id->coach_profiles.id | - | REVIEW |
| coach_org_agreements | 2 | id | coach_id->coach_profiles.id; organisation_id->organisations.id | - | REVIEW |
| coach_profiles | 3 | id | user_id->users.id | coach_availability(coach_id); coach_availability_blackouts(coach_id); coach_org_agreements(coach_id); coach_reviews(coach_id) | KEEP |
| coach_reviews | 0 | id | coach_id->coach_profiles.id; player_id->users.id; session_id->coach_sessions.id | - | CLEAR |
| coach_service_locations | 0 | id | branch_id->branches.id; coach_id->coach_profiles.id | - | REVIEW |
| coach_session_events | 0 | id | session_id->coach_sessions.id | - | CLEAR |
| coach_sessions | 0 | id | booking_id->bookings.id; branch_id->branches.id; coach_id->coach_profiles.id; organisation_id->organisations.id | coach_reviews(session_id); coach_session_events(session_id) | CLEAR |
| coaches | 0 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP |
| communication_log | 0 | id | - | - | CLEAR |
| community_event_participants | 0 | id | event_id->community_events.id; user_id->users.id | - | CLEAR |
| community_events | 0 | id | branch_id->branches.id; creator_id->users.id; organisation_id->organisations.id | community_event_participants(event_id) | REVIEW |
| configuration_profile_settings | 0 | id | profile_id->configuration_profiles.id | - | KEEP |
| configuration_profiles | 0 | id | - | configuration_profile_settings(profile_id) | KEEP |
| conversation_participants | 2 | id | conversation_id->conversations.id; user_id->users.id | - | REVIEW |
| conversations | 1 | id | created_by->users.id | conversation_participants(conversation_id); group_invitations(conversation_id); messages(conversation_id) | REVIEW |
| countries | 8 | id | default_currency->currencies.code | banks(country_id); organisations(country_id); provinces(country_id); users(country_id) | KEEP |
| coupon_assignments | 0 | id | coupon_id->coupons.id | - | CLEAR |
| coupon_usage | 0 | id | coupon_id->coupons.id; user_id->users.id | - | CLEAR |
| coupons | 0 | id | - | coupon_assignments(coupon_id); coupon_usage(coupon_id) | KEEP |
| currencies | 7 | id | - | branches(currency_id); countries(default_currency); platform_accounts(currency_id); transaction_entries(currency_id) | KEEP |
| customer_segments | 0 | id | created_by->users.id | marketing_campaigns(segment_id); segment_members(segment_id) | REVIEW |
| dead_letter_entries | 0 | id | - | - | REVIEW |
| departments | 0 | id | organisation_id->organisations.id; parent_id->departments.id | departments(parent_id); employees(department_id); positions(department_id) | REVIEW |
| design_theme_reset_baseline | 1 | id | - | - | KEEP |
| design_token_versions | 3 | id | - | - | KEEP |
| design_tokens | 159 | id | - | - | KEEP |
| elo_ratings | 0 | user_id,sport_id | - | - | CLEAR |
| employees | 0 | id | department_id->departments.id; organisation_id->organisations.id; position_id->positions.id; reports_to->employees.id | employees(reports_to); employment_contracts(employee_id); leave_balances(employee_id); leave_requests(employee_id) | REVIEW |
| employment_contracts | 0 | id | employee_id->employees.id | - | REVIEW |
| feature_flags | 21 | id | - | - | KEEP |
| financial_entitlements | 0 | id | branch_id->branches.id; organisation_id->organisations.id; settlement_id->settlements.id | settlement_entitlements(entitlement_id) | CLEAR |
| financial_journal_entries | 0 | id | - | - | CLEAR |
| gateway_settlement_transactions | 7 | id | payment_transaction_id->payment_transactions.id; gateway_settlement_id->gateway_settlements.id | - | CLEAR |
| gateway_settlements | 2 | id | - | gateway_settlement_transactions(gateway_settlement_id); payment_transactions(gateway_settlement_id) | CLEAR |
| general_ledger | 40 | id | account_id->chart_of_accounts.id; created_by->users.id; ledger_entry_id->ledger_entries.id; organisation_id->organisations.id | - | CLEAR |
| group_invitations | 0 | id | conversation_id->conversations.id; invitee_id->users.id; inviter_id->users.id | - | CLEAR |
| holidays | 1 | id | - | - | REVIEW |
| inventory_logs | 0 | id | created_by->users.id; variant_id->product_variants.id | - | CLEAR |
| invitations | 22 | id | match_id->matches.id; user_id->users.id | - | CLEAR |
| invoice_items | 0 | id | invoice_id->invoices.id; tax_rate_id->tax_rates.id | - | CLEAR |
| invoices | 0 | id | created_by->users.id; organisation_id->organisations.id; user_id->users.id | invoice_items(invoice_id); membership_subscriptions(invoice_id) | CLEAR |
| join_requests | 1 | id | match_id->matches.id; responder_id->users.id; user_id->users.id | - | CLEAR |
| kpi_snapshots | 0 | id | - | - | CLEAR |
| languages | 2 | id | - | - | KEEP |
| leads | 0 | id | assigned_to->users.id; converted_user_id->users.id | - | CLEAR |
| league_divisions | 0 | id | league_id->leagues.id | league_matches(division_id); league_standings(division_id); league_teams(division_id) | CLEAR |
| league_matches | 0 | id | away_team_id->league_teams.id; court_id->resources.id; division_id->league_divisions.id; home_team_id->league_teams.id | league_results(match_id) | CLEAR |
| league_results | 0 | id | entered_by->users.id; match_id->league_matches.id; winner_team_id->league_teams.id | - | CLEAR |
| league_standings | 0 | id | division_id->league_divisions.id; team_id->league_teams.id | - | CLEAR |
| league_teams | 0 | id | division_id->league_divisions.id | league_matches(away_team_id); league_matches(home_team_id); league_results(winner_team_id); league_standings(team_id) | CLEAR |
| leagues | 0 | id | season_id->seasons.id | league_divisions(league_id) | REVIEW |
| leave_balances | 0 | id | employee_id->employees.id; leave_type_id->leave_types.id | - | REVIEW |
| leave_requests | 0 | id | approved_by->users.id; employee_id->employees.id; leave_type_id->leave_types.id | - | REVIEW |
| leave_types | 0 | id | organisation_id->organisations.id | leave_balances(leave_type_id); leave_requests(leave_type_id) | REVIEW |
| ledger_entries | 40 | id | chart_account_id->chart_of_accounts.id; organisation_id->organisations.id; period_id->accounting_periods.id | general_ledger(ledger_entry_id) | CLEAR |
| login_attempts | 0 | id | - | - | CLEAR |
| loyalty_campaigns | 0 | id | - | - | REVIEW |
| loyalty_points | 0 | user_id | - | - | CLEAR |
| marketing_campaigns | 0 | id | created_by->users.id; segment_id->customer_segments.id | - | REVIEW |
| marketplace_complaint_config | 1 | id | - | - | KEEP |
| marketplace_complaints | 0 | id | buyer_id->users.id; order_item_id->order_items.id; order_id->orders.id; product_id->products.id | - | CLEAR |
| marketplace_ledger_entries | 0 | id | branch_id->branches.id; order_id->orders.id; organisation_id->organisations.id | - | CLEAR |
| match_participants | 8 | id | match_id->matches.id; user_id->users.id | - | CLEAR |
| match_result_participants | 8 | id | match_id->matches.id; result_id->match_result_records.id; user_id->users.id | - | CLEAR |
| match_result_records | 4 | id | accepted_by->users.id; branch_id->branches.id; disputed_by->users.id; format_id->sport_formats.id | match_result_participants(result_id) | CLEAR |
| match_sessions | 4 | id | match_id->matches.id; winner_id->users.id | - | CLEAR |
| matches | 4 | id | booking_id->bookings.id; format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | invitations(match_id); join_requests(match_id); match_participants(match_id); match_result_participants(match_id) | CLEAR |
| membership_benefits | 0 | id | membership_plan_id->membership_plans.id | - | KEEP |
| membership_history | 0 | id | user_membership_id->user_memberships.id | - | CLEAR |
| membership_installments | 0 | id | payment_transaction_id->payment_transactions.id; subscription_id->membership_subscriptions.id | - | CLEAR |
| membership_plan_branches | 0 | id | branch_id->branches.id; plan_version_id->membership_plan_versions.id | - | KEEP |
| membership_plan_components | 0 | id | plan_version_id->membership_plan_versions.id | - | KEEP |
| membership_plan_installment_templates | 0 | id | plan_version_id->membership_plan_versions.id | - | KEEP |
| membership_plan_versions | 0 | id | created_by->users.id; membership_plan_id->membership_plans.id | membership_plan_branches(plan_version_id); membership_plan_components(plan_version_id); membership_plan_installment_templates(plan_version_id); membership_subscriptions(plan_version_id) | KEEP |
| membership_plans | 0 | id | - | membership_benefits(membership_plan_id); membership_plan_versions(membership_plan_id); membership_subscriptions(plan_id); user_memberships(membership_plan_id) | KEEP |
| membership_subscription_components | 0 | id | subscription_id->membership_subscriptions.id | - | CLEAR |
| membership_subscriptions | 0 | id | created_by->users.id; invoice_id->invoices.id; organisation_id->organisations.id; plan_id->membership_plans.id | membership_installments(subscription_id); membership_subscription_components(subscription_id); membership_subscriptions(renewal_of_subscription_id) | CLEAR |
| memberships | 0 | id | - | - | CLEAR |
| messages | 0 | id | conversation_id->conversations.id; sender_id->users.id | - | REVIEW |
| migration_history | 201 | id | - | - | KEEP |
| notification_ab_results | 0 | id | - | - | CLEAR |
| notification_ab_tests | 0 | id | - | - | KEEP |
| notification_actions | 24 | id | - | notifications(action_id) | KEEP |
| notification_analytics | 66 | id | - | - | CLEAR |
| notification_audit_trail | 176 | id | - | - | CLEAR |
| notification_broadcasts | 0 | id | - | - | CLEAR |
| notification_categories | 18 | id | - | notifications(category_id); user_notification_preferences(category_id) | KEEP |
| notification_cleanup_policies | 7 | id | - | - | KEEP |
| notification_dead_letter_queue | 0 | id | - | - | CLEAR |
| notification_delivery | 60 | id | - | - | CLEAR |
| notification_digest_windows | 0 | id | - | - | REVIEW |
| notification_feature_flags | 7 | id | - | - | KEEP |
| notification_global_settings | 15 | id | - | - | KEEP |
| notification_providers | 6 | id | - | - | KEEP |
| notification_queue | 0 | id | user_id->users.id | - | CLEAR |
| notification_rate_limits | 473 | id | - | - | CLEAR |
| notification_replay_log | 0 | id | - | - | CLEAR |
| notification_retry_policies | 7 | id | - | - | REVIEW |
| notification_rule_conditions | 5 | id | rule_id->notification_rules.id | - | KEEP |
| notification_rules | 5 | id | - | notification_rule_conditions(rule_id) | KEEP |
| notification_template_versions | 0 | id | - | - | KEEP |
| notification_templates | 337 | id | - | - | KEEP |
| notification_types | 12 | id | - | - | KEEP |
| notification_webhooks | 0 | id | - | - | KEEP |
| notifications | 60 | id | action_id->notification_actions.id; category_id->notification_categories.id; user_id->users.id | - | CLEAR |
| order_items | 0 | id | order_id->orders.id; seller_id->organisations.id; product_id->products.id | marketplace_complaints(order_item_id) | CLEAR |
| order_status_history | 0 | id | order_id->orders.id | - | CLEAR |
| orders | 0 | id | buyer_id->users.id | marketplace_complaints(order_id); marketplace_ledger_entries(order_id); order_items(order_id); order_status_history(order_id) | CLEAR |
| org_announcements | 0 | id | created_by->users.id; organisation_id->organisations.id | - | REVIEW |
| organisation_attribute_values | 0 | id | attribute_id->organisation_type_attributes.id; organisation_id->organisations.id | - | REVIEW |
| organisation_coa_customizations | 0 | id | account_id->chart_of_accounts.id; organisation_id->organisations.id | - | KEEP |
| organisation_membership_settings | 0 | id | organisation_id->organisations.id | - | KEEP |
| organisation_reviews | 0 | id | organisation_id->organisations.id; user_id->users.id | - | CLEAR |
| organisation_subscriptions | 19 | id | organisation_id->organisations.id; plan_id->subscription_plans.id | - | KEEP |
| organisation_type_attributes | 3 | id | org_type_id->organisation_types.id | organisation_attribute_values(attribute_id) | KEEP |
| organisation_types | 5 | id | - | organisation_type_attributes(org_type_id); organisation_upgrade_requests(requested_org_type_id); organisations(org_type_id) | KEEP |
| organisation_upgrade_requests | 17 | id | approved_by->users.id; cancelled_by->users.id; organisation_id->organisations.id; requested_org_type_id->organisation_types.id | - | REVIEW |
| organisation_verification_log | 0 | id | created_by->users.id; organisation_id->organisations.id | - | REVIEW |
| organisations | 17 | id | country_id->countries.id; owner_id->users.id; org_type_id->organisation_types.id | academies(organisation_id); academy_programs(organisation_id); account_templates(organisation_id); accounting_event_mapping_lines(organisation_id) | KEEP |
| outbox_cursors | 14 | subscriber_id | - | - | REVIEW |
| password_reset_tokens | 0 | id | user_id->users.id | - | CLEAR |
| payment_allocations | 0 | id | booking_id->bookings.id; series_id->booking_series.id; payment_transaction_id->payment_transactions.id | - | CLEAR |
| payment_gateway_config | 3 | id | payment_method_id->payment_methods.id; organisation_id->organisations.id | - | KEEP |
| payment_methods | 6 | id | - | payment_gateway_config(payment_method_id) | KEEP |
| payment_transactions | 10 | id | gateway_settlement_id->gateway_settlements.id | academy_enrollment_payments(payment_transaction_id); gateway_settlement_transactions(payment_transaction_id); membership_installments(payment_transaction_id); payment_allocations(payment_transaction_id) | CLEAR |
| payroll_components | 0 | id | organisation_id->organisations.id | - | REVIEW |
| payroll_entries | 0 | id | employee_id->employees.id; payroll_run_id->payroll_runs.id | - | REVIEW |
| payroll_runs | 0 | id | created_by->users.id; organisation_id->organisations.id; posted_by->users.id | payroll_entries(payroll_run_id) | REVIEW |
| peak_hour_pricing | 0 | id | resource_id->resources.id | - | KEEP |
| permission_modules | 50 | id | - | permissions(module_id) | KEEP |
| permissions | 971 | id | module_id->permission_modules.id | role_permissions(permission_id) | KEEP |
| platform_accounts | 4 | id | currency_id->currencies.id | - | KEEP |
| player_emergency_contacts | 0 | id | user_id->users.id | - | KEEP |
| player_levels | 5 | id | - | booking_matchmaking_requests(target_level_id); public_match_details(target_level_id) | KEEP |
| player_match_requests | 0 | id | booking_id->bookings.id; created_by->users.id | - | CLEAR |
| player_profiles | 28 | id | user_id->users.id | - | KEEP |
| player_rating_history | 3 | id | changed_by->users.id; sport_id->sports.id; user_id->users.id | - | CLEAR |
| player_ratings | 2 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | CLEAR |
| player_sport_interests | 28 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | KEEP |
| player_statistics | 0 | id | season_id->seasons.id | - | CLEAR |
| positions | 0 | id | department_id->departments.id; organisation_id->organisations.id | employees(position_id) | KEEP |
| pricing_rules | 0 | id | - | - | KEEP |
| pricing_seasons | 0 | id | - | - | KEEP |
| processed_commands | 190 | id | - | - | CLEAR |
| processed_events | 5 | id | - | - | CLEAR |
| product_categories | 118 | id | parent_id->product_categories.id | product_categories(parent_id); products(category_id) | KEEP |
| product_images | 0 | id | product_id->products.id; variant_id->product_variants.id | - | KEEP |
| product_reviews | 0 | id | product_id->products.id; user_id->users.id | - | CLEAR |
| product_specifications | 59 | id | product_id->products.id | - | KEEP |
| product_tags | 90 | product_id,tag_id | product_id->products.id; tag_id->tags.id | - | KEEP |
| product_variants | 40 | id | product_id->products.id | inventory_logs(variant_id); product_images(variant_id); purchase_order_items(variant_id); stock_transfers(variant_id) | KEEP |
| products | 93 | id | brand_id->brands.id; category_id->product_categories.id; seller_id->organisations.id; sport_id->sports.id | cart_items(product_id); marketplace_complaints(product_id); order_items(product_id); product_images(product_id) | KEEP |
| professional_profiles | 3 | id | user_id->users.id | professional_services(professional_profile_id) | KEEP |
| professional_services | 2 | id | professional_profile_id->professional_profiles.id | - | KEEP |
| provinces | 120 | id | country_id->countries.id | cities(province_id) | KEEP |
| public_match_details | 4 | match_id | creator_id->users.id; target_level_id->player_levels.id; match_id->matches.id | - | CLEAR |
| published_events | 726 | id | - | - | REVIEW |
| purchase_order_items | 0 | id | purchase_order_id->purchase_orders.id; variant_id->product_variants.id | - | CLEAR |
| purchase_orders | 0 | id | created_by->users.id; organisation_id->organisations.id; supplier_id->suppliers.id; warehouse_id->warehouses.id | purchase_order_items(purchase_order_id) | CLEAR |
| push_log | 0 | id | user_id->users.id | - | CLEAR |
| push_tokens | 0 | id | user_id->users.id | - | CLEAR |
| rating_evidence | 4 | id | sport_id->sports.id; user_id->users.id | - | CLEAR |
| referee_availability | 0 | id | referee_id->referees.id | - | REVIEW |
| referee_availability_blackouts | 0 | id | referee_id->referees.id | - | REVIEW |
| referees | 0 | id | user_id->users.id | referee_availability(referee_id); referee_availability_blackouts(referee_id) | KEEP |
| related_products | 0 | product_id,related_product_id,relation_type | product_id->products.id; related_product_id->products.id | - | KEEP |
| resource_attribute_values | 13 | id | attribute_id->resource_type_attributes.id; resource_id->resources.id | - | REVIEW |
| resource_maintenance | 0 | id | resource_id->resources.id | - | REVIEW |
| resource_peak_hours | 35 | id | resource_id->resources.id | - | KEEP |
| resource_time_slots | 0 | id | resource_id->resources.id | - | KEEP |
| resource_type_attributes | 10 | id | resource_type_id->resource_types.id | resource_attribute_values(attribute_id) | KEEP |
| resource_types | 10 | id | - | resource_type_attributes(resource_type_id); resources(resource_type_id) | KEEP |
| resources | 5 | id | branch_id->branches.id; sport_id->sports.id; resource_type_id->resource_types.id | academy_group_sessions(court_id); academy_schedules(preferred_court_id); academy_sessions(resource_id); coach_sessions(resource_id) | KEEP |
| reward_catalog | 0 | id | - | - | KEEP |
| reward_claims | 0 | id | - | - | CLEAR |
| role_permissions | 6918 | id | permission_id->permissions.id; role_id->roles.id | - | KEEP |
| role_theme_overrides | 0 | role_id,token_key | - | - | KEEP |
| roles | 42 | id | organisation_id->organisations.id | role_permissions(role_id); user_roles(role_id) | KEEP |
| seasons | 0 | id | - | leagues(season_id); player_statistics(season_id); team_statistics(season_id) | REVIEW |
| segment_members | 0 | id | segment_id->customer_segments.id; user_id->users.id | - | REVIEW |
| segments | 0 | id | - | - | REVIEW |
| seller_profiles | 0 | id | branch_id->branches.id; organisation_id->organisations.id; user_id->users.id | - | KEEP |
| seller_shipping_rates | 5 | id | - | - | KEEP |
| settlement_entitlements | 0 | id | entitlement_id->financial_entitlements.id; settlement_id->settlements.id | - | CLEAR |
| settlement_orders | 0 | id | order_id->orders.id; settlement_id->settlements.id | - | CLEAR |
| settlement_transfers | 0 | id | settlement_id->settlements.id | - | CLEAR |
| settlements | 0 | id | branch_id->branches.id; organisation_id->organisations.id | financial_entitlements(settlement_id); settlement_entitlements(settlement_id); settlement_orders(settlement_id); settlement_transfers(settlement_id) | CLEAR |
| sidebar_layout | 11 | id | user_id->users.id | - | KEEP |
| sport_formats | 3 | id | created_by->users.id; sport_id->sports.id | match_result_records(format_id); matches(format_id); sport_rule_sets(format_id); tournament_competitions(match_format_id) | KEEP |
| sport_positions | 0 | id | sport_id->sports.id | - | KEEP |
| sport_rule_sets | 3 | id | created_by->users.id; format_id->sport_formats.id | match_result_records(rule_set_id); matches(rule_set_id); tournament_competitions(rule_set_id); tournament_stages(rule_set_id) | KEEP |
| sports | 16 | id | - | academies(sport_id); academy_programs(sport_id); match_result_records(sport_id); matches(sport_id) | KEEP |
| staff_attendance | 0 | id | employee_id->employees.id | - | REVIEW |
| stock_transfers | 0 | id | created_by->users.id; from_warehouse_id->warehouses.id; to_warehouse_id->warehouses.id; variant_id->product_variants.id | - | CLEAR |
| subscription_features | 9 | id | - | subscription_plan_features(feature_id) | KEEP |
| subscription_plan_features | 54 | id | plan_id->subscription_plans.id; feature_id->subscription_features.id | - | KEEP |
| subscription_plan_rates | 23 | id | plan_id->subscription_plans.id | - | KEEP |
| subscription_plans | 7 | id | - | organisation_subscriptions(plan_id); organisation_upgrade_requests(requested_plan_id); subscription_plan_features(plan_id); subscription_plan_rates(plan_id) | KEEP |
| suppliers | 0 | id | organisation_id->organisations.id | purchase_orders(supplier_id) | REVIEW |
| support_ticket_messages | 0 | id | ticket_id->support_tickets.id; user_id->users.id | - | REVIEW |
| support_tickets | 0 | id | assigned_to->users.id; organisation_id->organisations.id; user_id->users.id | support_ticket_messages(ticket_id) | REVIEW |
| system_settings | 42 | id | - | - | KEEP |
| tags | 25 | id | - | product_tags(tag_id) | KEEP |
| tax_rates | 0 | id | organisation_id->organisations.id | bookings(tax_rate_id); invoice_items(tax_rate_id) | KEEP |
| team_statistics | 0 | id | season_id->seasons.id; team_id->league_teams.id | - | CLEAR |
| tournament_age_categories | 7 | id | - | - | KEEP |
| tournament_bracket_types | 4 | id | - | tournament_competitions(bracket_type_id); tournaments(bracket_type_id) | KEEP |
| tournament_competitions | 3 | id | bracket_type_id->tournament_bracket_types.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | tournament_draws(competition_id); tournament_groups(competition_id); tournament_matches(competition_id); tournament_participants(competition_id) | CLEAR |
| tournament_draw_entries | 0 | id | draw_id->tournament_draws.id; moved_by->users.id; participant_id->tournament_participants.id | - | CLEAR |
| tournament_draws | 0 | id | competition_id->tournament_competitions.id; generated_by->users.id; tournament_id->tournaments.id | tournament_draw_entries(draw_id) | CLEAR |
| tournament_group_members | 0 | id | group_id->tournament_groups.id; registration_id->tournament_registrations.id | - | CLEAR |
| tournament_groups | 0 | id | competition_id->tournament_competitions.id; tournament_id->tournaments.id | tournament_group_members(group_id); tournament_standings(group_id) | CLEAR |
| tournament_match_results | 0 | id | entered_by->users.id; match_id->tournament_matches.id; winner_id->users.id | - | CLEAR |
| tournament_match_scores | 0 | id | match_id->tournament_matches.id | - | CLEAR |
| tournament_matches | 0 | id | player1_id->users.id; player2_id->users.id; resource_id->resources.id; tournament_id->tournaments.id | tournament_match_results(match_id); tournament_match_scores(match_id) | CLEAR |
| tournament_participant_members | 0 | id | participant_id->tournament_participants.id; replaced_by_member_id->tournament_participant_members.id; tournament_id->tournaments.id; user_id->users.id | tournament_participant_members(replaced_by_member_id) | CLEAR |
| tournament_participants | 2 | id | competition_id->tournament_competitions.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | tournament_draw_entries(participant_id); tournament_matches(loser_participant_id); tournament_matches(participant1_id); tournament_matches(participant2_id) | CLEAR |
| tournament_placements | 0 | id | competition_id->tournament_competitions.id; participant_id->tournament_participants.id; tournament_id->tournaments.id; user_id->users.id | - | CLEAR |
| tournament_prize_awards | 0 | id | competition_id->tournament_competitions.id; prize_id->tournament_prizes.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | - | CLEAR |
| tournament_prizes | 1 | id | competition_id->tournament_competitions.id; tournament_id->tournaments.id | tournament_prize_awards(prize_id) | CLEAR |
| tournament_registration_refund_requests | 0 | id | registration_id->tournament_registrations.id; requested_by->users.id; reviewed_by->users.id; tournament_id->tournaments.id | - | CLEAR |
| tournament_registrations | 2 | id | competition_id->tournament_competitions.id; player_id->users.id; tournament_id->tournaments.id | tournament_group_members(registration_id); tournament_participants(registration_id); tournament_prize_awards(registration_id); tournament_registration_refund_requests(registration_id) | CLEAR |
| tournament_replacement_requests | 0 | id | outgoing_member_user_id->users.id; participant_id->tournament_participants.id; replacement_user_id->users.id; requested_by->users.id | - | CLEAR |
| tournament_seeds | 0 | id | assigned_by->users.id; competition_id->tournament_competitions.id; participant_id->tournament_participants.id; tournament_id->tournaments.id | - | CLEAR |
| tournament_sponsors | 0 | id | tournament_id->tournaments.id | - | CLEAR |
| tournament_stages | 0 | id | competition_id->tournament_competitions.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; tournament_id->tournaments.id | tournament_matches(stage_id) | CLEAR |
| tournament_standings | 0 | id | group_id->tournament_groups.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | - | CLEAR |
| tournament_team_invitations | 0 | id | invitee_user_id->users.id; inviter_user_id->users.id; participant_id->tournament_participants.id; tournament_id->tournaments.id | - | CLEAR |
| tournaments | 3 | id | bracket_type_id->tournament_bracket_types.id; branch_id->branches.id; creator_id->users.id; match_format_id->sport_formats.id | matches(tournament_id); tournament_competitions(tournament_id); tournament_draws(tournament_id); tournament_groups(tournament_id) | CLEAR |
| transaction_entries | 0 | id | branch_id->branches.id; currency_id->currencies.id; organisation_id->organisations.id; transaction_id->transactions.id | - | CLEAR |
| transactions | 11 | id | currency_id->currencies.id | transaction_entries(transaction_id) | CLEAR |
| translation_keys | 2363 | id | - | - | KEEP |
| translations | 610 | id | - | - | KEEP |
| uploads | 36 | id | - | cms_contact_submission_attachments(upload_id) | REVIEW |
| user_addresses | 5 | id | user_id->users.id | - | KEEP |
| user_branches | 1 | id | branch_id->branches.id; user_id->users.id | - | KEEP |
| user_channel_preferences | 0 | id | - | - | KEEP |
| user_devices | 0 | id | user_id->users.id | user_sessions(device_id) | REVIEW |
| user_follows | 0 | id | follower_id->users.id; following_id->users.id | - | REVIEW |
| user_friends | 0 | id | addressee_id->users.id; requester_id->users.id | - | REVIEW |
| user_memberships | 0 | id | membership_plan_id->membership_plans.id | membership_history(user_membership_id) | CLEAR |
| user_notification_preferences | 0 | id | category_id->notification_categories.id; user_id->users.id | - | KEEP |
| user_organisations | 2 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP |
| user_quiet_hours | 0 | id | - | - | KEEP |
| user_role_scopes | 21 | id | user_role_id->user_roles.id | - | KEEP |
| user_roles | 47 | id | assigned_by->users.id; role_id->roles.id; user_id->users.id | user_role_scopes(user_role_id) | KEEP |
| user_sessions | 3606 | id | device_id->user_devices.id; user_id->users.id | - | CLEAR |
| user_sports | 0 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | KEEP |
| user_targeted_achievements | 0 | id | achievement_key->achievements.achievement_key; user_id->users.id | - | REVIEW |
| user_wallets | 28 | id | - | - | KEEP |
| users | 28 | id | country_id->countries.id | academy_enrollments(payment_confirmed_by); academy_enrollments(player_id); academy_evaluations(evaluator_id); academy_evaluations(player_id) | KEEP |
| waiting_list | 0 | id | match_id->matches.id; user_id->users.id | - | CLEAR |
| wallet_transactions | 0 | id | - | - | CLEAR |
| warehouses | 0 | id | organisation_id->organisations.id | purchase_orders(warehouse_id); stock_transfers(from_warehouse_id); stock_transfers(to_warehouse_id) | KEEP |
| web_vitals_metrics | 0 | id | - | - | CLEAR |
| wishlist_items | 0 | id | product_id->products.id; user_id->users.id | - | CLEAR |
| withdrawal_requests | 0 | id | assigned_to->users.id; branch_financial_details_id->branch_financial_details.id; executed_by->users.id; user_id->users.id | - | CLEAR |
| workflow_branch_instances | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW |
| workflow_definitions | 3700 | id | - | - | CLEAR |
| workflow_event_subscriptions | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW |
| workflow_events | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW |
| workflow_instances | 0 | id | - | workflow_branch_instances(workflow_instance_id); workflow_event_subscriptions(workflow_instance_id); workflow_events(workflow_instance_id); workflow_steps(workflow_instance_id) | REVIEW |
| workflow_steps | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW |
| year_close_cycles | 0 | id | year_closings_id->year_closings.id | - | CLEAR |
| year_closings | 0 | id | retained_earnings_account_id->chart_of_accounts.id; created_by->users.id; organisation_id->organisations.id | year_close_cycles(year_closings_id) | CLEAR |

**FINAL TOTALS: KEEP=123 | CLEAR=136 | REVIEW=71 (of 330)**
**Non-empty CLEAR tables (real deletion workload): 35 tables, 8531 total rows**

## 3. SPECIAL RULES

1. `migration_history` = KEEP, unchanged (201 rows).
2. `SET FOREIGN_KEY_CHECKS=0` is NOT used. FK enforcement stays ON; all deletes follow the topological order below.
3. Configuration/master data (section 5 KEEP list, incl. organisation_subscriptions and user_wallets) is never touched.

## 4. FK deletion order (children first, FK checks ON) - regenerated

Generated by Kahn over the Production FK graph restricted to CLEAR tables (self-loops handled by two-phase delete, see validation).
| # | Table | CLEAR children awaited |
|---|---|---|
| 1 | academy_attendance |  |
| 2 | academy_enrollment_payments |  |
| 3 | academy_enrollments | academy_attendance |
| 4 | academy_evaluations |  |
| 5 | academy_group_sessions | academy_attendance |
| 6 | academy_session_attendance |  |
| 7 | academy_sessions | academy_session_attendance |
| 8 | activity_logs |  |
| 9 | ad_clicks |  |
| 10 | ad_creatives |  |
| 11 | ad_impressions | ad_clicks |
| 12 | booking_cancellations |  |
| 13 | booking_invitations |  |
| 14 | booking_matchmaking_requests |  |
| 15 | booking_participants |  |
| 16 | booking_players |  |
| 17 | booking_settlements |  |
| 18 | booking_slots |  |
| 19 | cart_items |  |
| 20 | client_error_reports |  |
| 21 | coach_reviews |  |
| 22 | coach_session_events |  |
| 23 | coach_sessions | coach_reviews, coach_session_events |
| 24 | communication_log |  |
| 25 | community_event_participants |  |
| 26 | coupon_assignments |  |
| 27 | coupon_usage |  |
| 28 | elo_ratings |  |
| 29 | financial_journal_entries |  |
| 30 | gateway_settlement_transactions |  |
| 31 | general_ledger |  |
| 32 | group_invitations |  |
| 33 | inventory_logs |  |
| 34 | invitations |  |
| 35 | invoice_items |  |
| 36 | join_requests |  |
| 37 | kpi_snapshots |  |
| 38 | leads |  |
| 39 | league_results |  |
| 40 | league_standings |  |
| 41 | ledger_entries | general_ledger |
| 42 | login_attempts |  |
| 43 | loyalty_points |  |
| 44 | marketplace_complaints |  |
| 45 | marketplace_ledger_entries |  |
| 46 | match_participants |  |
| 47 | match_result_participants |  |
| 48 | match_result_records | match_result_participants |
| 49 | match_sessions |  |
| 50 | membership_history |  |
| 51 | membership_installments |  |
| 52 | membership_subscription_components |  |
| 53 | membership_subscriptions | membership_installments, membership_subscription_components |
| 54 | memberships |  |
| 55 | notification_ab_results |  |
| 56 | notification_analytics |  |
| 57 | notification_audit_trail |  |
| 58 | notification_broadcasts |  |
| 59 | notification_dead_letter_queue |  |
| 60 | notification_delivery |  |
| 61 | notification_queue |  |
| 62 | notification_rate_limits |  |
| 63 | notification_replay_log |  |
| 64 | notifications |  |
| 65 | order_items | marketplace_complaints |
| 66 | order_status_history |  |
| 67 | organisation_reviews |  |
| 68 | password_reset_tokens |  |
| 69 | payment_allocations |  |
| 70 | payment_transactions | academy_enrollment_payments, gateway_settlement_transactions, membership_installments, payment_allocations |
| 71 | player_match_requests |  |
| 72 | player_rating_history |  |
| 73 | player_ratings |  |
| 74 | player_statistics |  |
| 75 | processed_commands |  |
| 76 | processed_events |  |
| 77 | product_reviews |  |
| 78 | public_match_details |  |
| 79 | purchase_order_items |  |
| 80 | purchase_orders | purchase_order_items |
| 81 | push_log |  |
| 82 | push_tokens |  |
| 83 | rating_evidence |  |
| 84 | reward_claims |  |
| 85 | settlement_entitlements |  |
| 86 | settlement_orders |  |
| 87 | settlement_transfers |  |
| 88 | stock_transfers |  |
| 89 | team_statistics |  |
| 90 | tournament_draw_entries |  |
| 91 | tournament_draws | tournament_draw_entries |
| 92 | tournament_group_members |  |
| 93 | tournament_match_results |  |
| 94 | tournament_match_scores |  |
| 95 | tournament_matches | tournament_match_results, tournament_match_scores |
| 96 | tournament_participant_members |  |
| 97 | tournament_placements |  |
| 98 | tournament_prize_awards |  |
| 99 | tournament_prizes | tournament_prize_awards |
| 100 | tournament_registration_refund_requests |  |
| 101 | tournament_replacement_requests |  |
| 102 | tournament_seeds |  |
| 103 | tournament_sponsors |  |
| 104 | tournament_stages | tournament_matches |
| 105 | tournament_standings |  |
| 106 | tournament_team_invitations |  |
| 107 | transaction_entries |  |
| 108 | transactions | transaction_entries |
| 109 | user_memberships | membership_history |
| 110 | user_sessions |  |
| 111 | waiting_list |  |
| 112 | wallet_transactions |  |
| 113 | web_vitals_metrics |  |
| 114 | wishlist_items |  |
| 115 | withdrawal_requests |  |
| 116 | workflow_definitions |  |
| 117 | year_close_cycles |  |
| 118 | year_closings | year_close_cycles |
| 119 | ad_campaigns | ad_clicks, ad_creatives, ad_impressions |
| 120 | ad_placements | ad_campaigns |
| 121 | booking_series | payment_allocations |
| 122 | financial_entitlements | settlement_entitlements |
| 123 | gateway_settlements | gateway_settlement_transactions, payment_transactions |
| 124 | invoices | invoice_items, membership_subscriptions |
| 125 | league_matches | league_results |
| 126 | league_teams | league_matches, league_matches, league_results, league_standings, team_statistics |
| 127 | matches | invitations, join_requests, match_participants, match_result_participants, match_result_records, match_sessions, public_match_details, tournament_matches, waiting_list |
| 128 | orders | marketplace_complaints, marketplace_ledger_entries, order_items, order_status_history, settlement_orders |
| 129 | settlements | financial_entitlements, settlement_entitlements, settlement_orders, settlement_transfers |
| 130 | tournament_groups | tournament_group_members, tournament_standings |
| 131 | tournament_participants | tournament_draw_entries, tournament_matches, tournament_matches, tournament_matches, tournament_matches, tournament_participant_members, tournament_placements, tournament_replacement_requests, tournament_seeds, tournament_team_invitations |
| 132 | tournament_registrations | tournament_group_members, tournament_participants, tournament_prize_awards, tournament_registration_refund_requests, tournament_standings |
| 133 | bookings | booking_matchmaking_requests, booking_players, booking_settlements, coach_sessions, matches, payment_allocations, player_match_requests |
| 134 | league_divisions | league_matches, league_standings, league_teams |
| 135 | tournament_competitions | tournament_draws, tournament_groups, tournament_matches, tournament_participants, tournament_placements, tournament_prize_awards, tournament_prizes, tournament_registrations, tournament_seeds, tournament_stages |
| 136 | tournaments | matches, tournament_competitions, tournament_draws, tournament_groups, tournament_matches, tournament_participant_members, tournament_participants, tournament_placements, tournament_prize_awards, tournament_prizes, tournament_registration_refund_requests, tournament_registrations, tournament_replacement_requests, tournament_seeds, tournament_sponsors, tournament_stages, tournament_standings, tournament_team_invitations |

## 5. ORDER VALIDATION (independent)

| Check | Result |
|---|---|
| Total CLEAR tables | 136 |
| CLEAR tables in order (exactly once) | 136 |
| Missing CLEAR tables | 0 |
| Duplicate CLEAR tables in order | 0 |
| Parent-before-child violations | 0 |
| Cross-table FK cycles | 0 |
| Self-referencing CLEAR tables | membership_subscriptions, tournament_participant_members |

Self-loop safe strategy (FK checks ON): `membership_subscriptions.renewal_of_subscription_id` and `tournament_participant_members.replaced_by_member_id` are nullable (ON DELETE SET NULL). Two-phase delete: (1) `UPDATE t SET self_col = NULL WHERE self_col IS NOT NULL;` (2) `DELETE FROM t;`. If a NOT NULL self-column ever appears, apply iterative leaf-pruning `DELETE FROM t WHERE id NOT IN (SELECT DISTINCT parent_ref ...)` until empty.
**FK ORDER VALIDATION: PASS** (each CLEAR exactly once; none missing; no parent-before-child violations; no cycles)

## 6. Accounting cleanup graph (derived from Production FKs)

payment_allocations -> payment_transactions
gateway_settlement_transactions -> gateway_settlements ; -> payment_transactions
invoice_items -> invoices
membership_installments -> payment_transactions ; -> membership_subscriptions
order_items -> orders
settlement_entitlements -> settlements ; -> financial_entitlements
settlement_orders -> settlements ; -> orders
settlement_transfers -> settlements
transaction_entries -> transactions
general_ledger -> ledger_entries
ledger_entries -> chart_of_accounts (KEEP) ; -> accounting_periods (REVIEW) ; -> organisations (KEEP)
financial_entitlements -> settlements (SET NULL)
wallet_transactions -> user_wallets (KEEP)
year_close_cycles / year_closings (no cross FK) ; financial_journal_entries (self-contained)

Clearing order (children first): payment_allocations -> gateway_settlement_transactions -> invoice_items -> membership_installments -> order_items -> settlement_entitlements/settlement_orders -> transaction_entries -> general_ledger -> ledger_entries -> payment_transactions -> gateway_settlements -> invoices -> transactions -> settlements/settlement_transfers -> financial_entitlements -> wallet_transactions (loose; wallet kept) -> processed_events/processed_commands (idempotency reset) -> year_close* -> financial_journal_entries.

## 7. FINAL CLEAR LIST - every non-empty table actually cleared (explicit)

| TABLE | ROWS | REASON | DEPENDENCIES | RISK |
|---|---|---|---|---|
| booking_matchmaking_requests | 1 | transactional / test / runtime-activity reset (approved CLEAR) | booking_id->bookings.id; target_level_id->player_levels.id | operational reset only |
| booking_slots | 3 | transactional / test / runtime-activity reset (approved CLEAR) | - | operational reset only |
| bookings | 5 | court bookings (ops/test) | branch_id->branches.id; tax_rate_id->tax_rates.id | operational reset only |
| cart_items | 1 | transactional / test / runtime-activity reset (approved CLEAR) | product_id->products.id; user_id->users.id | operational reset only |
| gateway_settlement_transactions | 7 | transactional / test / runtime-activity reset (approved CLEAR) | payment_transaction_id->payment_transactions.id; gateway_settlement_id->gateway_settlements.id | operational reset only |
| gateway_settlements | 2 | gateway clearing records | - | FINANCIAL/OPERATIONAL STATE - backup mandatory |
| general_ledger | 40 | accounting projections of ledger activity | account_id->chart_of_accounts.id; created_by->users.id; ledger_entry_id->ledger_entries.id; organisation_id->organisations.id | FINANCIAL/OPERATIONAL STATE - backup mandatory |
| invitations | 22 | transactional / test / runtime-activity reset (approved CLEAR) | match_id->matches.id; user_id->users.id | operational reset only |
| join_requests | 1 | transactional / test / runtime-activity reset (approved CLEAR) | match_id->matches.id; responder_id->users.id; user_id->users.id | operational reset only |
| ledger_entries | 40 | accounting postings generated by booking/marketplace/etc. activity | chart_account_id->chart_of_accounts.id; organisation_id->organisations.id; period_id->accounting_periods.id | FINANCIAL/OPERATIONAL STATE - backup mandatory |
| match_participants | 8 | transactional / test / runtime-activity reset (approved CLEAR) | match_id->matches.id; user_id->users.id | operational reset only |
| match_result_participants | 8 | transactional / test / runtime-activity reset (approved CLEAR) | match_id->matches.id; result_id->match_result_records.id; user_id->users.id | operational reset only |
| match_result_records | 4 | transactional / test / runtime-activity reset (approved CLEAR) | accepted_by->users.id; branch_id->branches.id; disputed_by->users.id; format_id->sport_formats.id | operational reset only |
| match_sessions | 4 | transactional / test / runtime-activity reset (approved CLEAR) | match_id->matches.id; winner_id->users.id | operational reset only |
| matches | 4 | transactional / test / runtime-activity reset (approved CLEAR) | booking_id->bookings.id; format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | operational reset only |
| notification_analytics | 66 | transactional / test / runtime-activity reset (approved CLEAR) | - | operational reset only |
| notification_audit_trail | 176 | transactional / test / runtime-activity reset (approved CLEAR) | - | operational reset only |
| notification_delivery | 60 | transactional / test / runtime-activity reset (approved CLEAR) | - | operational reset only |
| notification_rate_limits | 473 | notification throttle buckets (per user/category/event runtime counters) | - | operational reset only |
| notifications | 60 | transactional / test / runtime-activity reset (approved CLEAR) | action_id->notification_actions.id; category_id->notification_categories.id; user_id->users.id | operational reset only |
| payment_transactions | 10 | payment transactions (sandbox/ops generated) | gateway_settlement_id->gateway_settlements.id | FINANCIAL/OPERATIONAL STATE - backup mandatory |
| player_rating_history | 3 | match-result derived rating history | changed_by->users.id; sport_id->sports.id; user_id->users.id | operational reset only |
| player_ratings | 2 | match-result derived ratings (cleared with matches/results) | sport_id->sports.id; user_id->users.id | operational reset only |
| processed_commands | 190 | command dedup/idempotency records (past commands) | - | operational reset only |
| processed_events | 5 | event dedup/idempotency records (past events) | - | operational reset only |
| public_match_details | 4 | transactional / test / runtime-activity reset (approved CLEAR) | creator_id->users.id; target_level_id->player_levels.id; match_id->matches.id | operational reset only |
| rating_evidence | 4 | transactional / test / runtime-activity reset (approved CLEAR) | sport_id->sports.id; user_id->users.id | operational reset only |
| tournament_competitions | 3 | transactional / test / runtime-activity reset (approved CLEAR) | bracket_type_id->tournament_bracket_types.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | operational reset only |
| tournament_participants | 2 | transactional / test / runtime-activity reset (approved CLEAR) | competition_id->tournament_competitions.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | operational reset only |
| tournament_prizes | 1 | transactional / test / runtime-activity reset (approved CLEAR) | competition_id->tournament_competitions.id; tournament_id->tournaments.id | operational reset only |
| tournament_registrations | 2 | transactional / test / runtime-activity reset (approved CLEAR) | competition_id->tournament_competitions.id; player_id->users.id; tournament_id->tournaments.id | operational reset only |
| tournaments | 3 | transactional / test / runtime-activity reset (approved CLEAR) | bracket_type_id->tournament_bracket_types.id; branch_id->branches.id; creator_id->users.id; match_format_id->sport_formats.id | operational reset only |
| transactions | 11 | transactional / test / runtime-activity reset (approved CLEAR) | currency_id->currencies.id | operational reset only |
| user_sessions | 3606 | auth sessions - runtime state (0 active; all revoked) | device_id->user_devices.id; user_id->users.id | FINANCIAL/OPERATIONAL STATE - backup mandatory |
| workflow_definitions | 3700 | accumulated workflow version snapshots (re-registered from code at boot) | - | FINANCIAL/OPERATIONAL STATE - backup mandatory |

Total explicit non-empty CLEAR tables above = 35 (8531 rows). Empty CLEAR tables are ALREADY at 0 (no-op) and are excluded from the deletion workload by plan design.

## 8. FINAL KEEP LIST - explicitly protected (never touched)

<details><summary>KEEP: 123 tables (click to expand)</summary>

academy_categories, account_template_lines, account_templates, accounting_event_mapping_lines, amenities, api_keys, app_config, app_settings, application_settings_history, bank_branches, banks, branch_amenities, branch_amenity_assignments, branch_financial_details, branch_holidays, branch_staff, branches, brands, cancellation_policies, chart_of_accounts, cities, coach_profiles, coaches, configuration_profile_settings, configuration_profiles, countries, coupons, currencies, design_theme_reset_baseline, design_token_versions, design_tokens, feature_flags, languages, marketplace_complaint_config, membership_benefits, membership_plan_branches, membership_plan_components, membership_plan_installment_templates, membership_plan_versions, membership_plans, migration_history, notification_ab_tests, notification_actions, notification_categories, notification_cleanup_policies, notification_feature_flags, notification_global_settings, notification_providers, notification_rule_conditions, notification_rules, notification_template_versions, notification_templates, notification_types, notification_webhooks, organisation_coa_customizations, organisation_membership_settings, organisation_subscriptions, organisation_type_attributes, organisation_types, organisations, payment_gateway_config, payment_methods, peak_hour_pricing, permission_modules, permissions, platform_accounts, player_emergency_contacts, player_levels, player_profiles, player_sport_interests, positions, pricing_rules, pricing_seasons, product_categories, product_images, product_specifications, product_tags, product_variants, products, professional_profiles, professional_services, provinces, referees, related_products, resource_peak_hours, resource_time_slots, resource_type_attributes, resource_types, resources, reward_catalog, role_permissions, role_theme_overrides, roles, seller_profiles, seller_shipping_rates, sidebar_layout, sport_formats, sport_positions, sport_rule_sets, sports, subscription_features, subscription_plan_features, subscription_plan_rates, subscription_plans, system_settings, tags, tax_rates, tournament_age_categories, tournament_bracket_types, translation_keys, translations, user_addresses, user_branches, user_channel_preferences, user_notification_preferences, user_organisations, user_quiet_hours, user_role_scopes, user_roles, user_sports, user_wallets, users, warehouses

</details>

Protected groups (requirements): users (28), roles (42), permissions (971) + modules, user_roles/user_role_scopes/user_organisations/user_branches, organisations (17), branches (8), resources (courts), sellers & seller profiles, player/professional/coach/referee profiles, ALL reference/master data (countries..sports..payment methods..cancellation policies..tax rates), payment gateway configuration, notification configuration (templates/categories/rules/providers/actions...), accounting configuration (chart_of_accounts 91, account_templates/lines, accounting_event_mapping_lines, platform_accounts, organisation_coa_customizations), product/catalog config (products 93 + variants/images/specs/tags), membership plan & subscription plan configuration, prices & pricing rules/seasons, organization membership settings, organisation_subscriptions (19 - real billing), user_wallets (28 - financial account identity), user preferences, feature flags/app settings/system settings, design tokens/sidebar, api_keys, translations, `migration_history`, reward_catalog, warehouses, coupons, marketplace complaint config.

## 9. FINANCIAL SAFETY - CONFIG vs TRANSACTIONAL distinction

| Keep (configuration/master) | Clear (transactional/generated financial) |
|---|---|
| chart_of_accounts, account_templates(+lines), accounting_event_mapping_lines, platform_accounts, accounting_periods (REVIEW), tax_rates, payment_methods, payment_gateway_config, organisation_subscriptions (KEEP), user_wallets (KEEP), membership/subscription plan config | payment_transactions, payment_allocations, gateway_settlements(transactions), invoices/items, wallet_transactions, ledger_entries, general_ledger, financial_journal_entries, transactions/entries, financial_entitlements, settlements(+entitlements/orders/transfers), year_close*, marketplace_ledger_entries |

Rule: nothing is decided by name alone - each row above is traced to code/schema and to the Financial Safety classification in plan sections 6-7.

## 10. FINAL EXECUTION SEQUENCE (NOT executed)

A. Confirm final human approval of this plan.
B. Confirm production target (`187.127.72.93:3307 / courtzon_v3`) and expectedMigration=194.
C. Create full backup (section 11).
D. Verify backup completed (file size/timestamp/checksum).
E. Freeze application writes (maintenance mode / read-only write gate).
F. Stop/pause relevant workers and cron jobs (list in plan 40 v2 section 11; incl. all BullMQ repeat jobs + outbox poller).
G. Verify no active writes (queues drained; `show processlist` idle; no new rows in sample CLEAR tables).
H. Execute transactional cleanup with FK checks ENABLED, in the order of section 4. Self-loop tables via two-phase delete.
I. Validate database (section 12).
J. Validate accounting integrity (section 12).
K. Validate application health (/health, /health/version).
L. Validate Redis / Socket.IO / workers.
M. Restart services (resume workers, exit maintenance).
N. Perform final health checks + report.

## 11. MANDATORY PRE-CLEANUP BACKUP (procedure only - NOT performed)

- Command (production): `mysqldump --single-transaction --routines --triggers --hex-blob -h 127.0.0.1 -P 3306 -u root -p courtzon_v3 > courtzon_v3_precleanup_YYYYMMDD_HHMMSS.sql` executed ON the production host (or via the origin MySQL container with `--host=...`), with `--no-tablespaces` if needed on restricted accounts.
- Expected output: a single .sql file; exit code 0; size recorded; timestamp recorded.
- Verification: `grep -c "CREATE TABLE" file` matches 330; tail contains `Dump completed`; checksum (sha256) recorded.
- Restore-test: restore into a SEPARATE environment (local Docker `courtzon_v3_temp`) and run `CHECK TABLE` + spot counts vs production snapshot.
- Storage: off-host object storage (Hostinger Backup / S3-compatible), retained > 30 days, not on the same volume as production.
No backup is created by this task.

## 12. POST-CLEANUP VALIDATION (read-only checks)

- Counts: every CLEAR table = 0; KEEP counts equal the pre-cleanup snapshot in this document (users 28, orgs 17, branches 8, permissions 971, roles 42, CoA 91, org_subs 19, wallets 28, migration_history 201).
- REVIEW counts unchanged from snapshot.
- Orphans: for each FK, `SELECT COUNT(*) FROM child c LEFT JOIN parent p ON ... WHERE p.id IS NULL` = 0.
- Accounting: ledger_entries=0, general_ledger=0, entitlements=0, settlements=0, wallet rows untouched & balances 0.
- Payments/booking/tournament/marketplace/notification/membership activity = 0.
- migration_history unchanged (201; latest 194).
- Health: GET /health, /health/version (expectedMigration 194), frontend 200, /health/socket ok, Redis PING, workers idle then resuming.

## 13. FINAL APPROVAL MATRIX

| TABLE | ROWS | ACTION | REASON | DEPENDENCIES | RISK | HUMAN APPROVAL |
|---|---|---|---|---|---|---|
| academies | 0 | REVIEW | decision required | branch_id->branches.id; organisation_id->organisations.id; sport_id->sports.id | may hold legit state | YES |
| academy_attendance | 0 | CLEAR | CLEAR - already empty (no-op) | enrollment_id->academy_enrollments.id; group_session_id->academy_group_sessions.id | none | No (no-op) |
| academy_categories | 0 | KEEP | required configuration/identity | - | none | No |
| academy_curriculums | 0 | REVIEW | decision required | academy_id->academies.id | may hold legit state | YES |
| academy_enrollment_payments | 0 | CLEAR | CLEAR - already empty (no-op) | payment_transaction_id->payment_transactions.id | none | No (no-op) |
| academy_enrollments | 0 | CLEAR | CLEAR - already empty (no-op) | payment_confirmed_by->users.id; group_id->academy_groups.id; player_id->users.id | none | No (no-op) |
| academy_evaluations | 0 | CLEAR | CLEAR - already empty (no-op) | academy_id->academies.id; evaluator_id->users.id; player_id->users.id | none | No (no-op) |
| academy_group_sessions | 0 | CLEAR | CLEAR - already empty (no-op) | confirmed_by->users.id; pending_resolved_by->users.id; schedule_id->academy_schedules.id | none | No (no-op) |
| academy_groups | 0 | REVIEW | decision required | coach_locked_by->users.id; coach_id->users.id; program_id->academy_programs.id | may hold legit state | YES |
| academy_programs | 0 | REVIEW | decision required | branch_id->branches.id; confirmed_by->users.id; organisation_id->organisations.id | may hold legit state | YES |
| academy_schedules | 0 | REVIEW | decision required | branch_id->branches.id; preferred_court_id->resources.id; created_by->users.id | may hold legit state | YES |
| academy_session_attendance | 0 | CLEAR | CLEAR - already empty (no-op) | player_id->users.id; session_id->academy_sessions.id | none | No (no-op) |
| academy_sessions | 0 | CLEAR | CLEAR - already empty (no-op) | academy_id->academies.id; coach_id->users.id; curriculum_id->academy_curriculums.id | none | No (no-op) |
| account_template_lines | 26 | KEEP | required configuration/identity | parent_line_id->account_template_lines.id; template_id->account_templates.id | none | No |
| account_templates | 3 | KEEP | required configuration/identity | created_by->users.id; organisation_id->organisations.id | none | No |
| accounting_event_mapping_lines | 229 | KEEP | required configuration/identity | account_id->chart_of_accounts.id; organisation_id->organisations.id | none | No |
| accounting_periods | 2 | REVIEW | decision required | closed_by->users.id; organisation_id->organisations.id | may hold legit state | YES |
| achievements | 0 | REVIEW | decision required | - | may hold legit state | YES |
| activity_logs | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| ad_campaigns | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; organisation_id->organisations.id; placement_id->ad_placements.id | none | No (no-op) |
| ad_clicks | 0 | CLEAR | CLEAR - already empty (no-op) | campaign_id->ad_campaigns.id; impression_id->ad_impressions.id | none | No (no-op) |
| ad_creatives | 0 | CLEAR | CLEAR - already empty (no-op) | campaign_id->ad_campaigns.id | none | No (no-op) |
| ad_impressions | 0 | CLEAR | CLEAR - already empty (no-op) | campaign_id->ad_campaigns.id | none | No (no-op) |
| ad_placements | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| amenities | 20 | KEEP | required configuration/identity | - | none | No |
| announcements | 0 | REVIEW | decision required | organisation_id->organisations.id; user_id->users.id | may hold legit state | YES |
| api_keys | 0 | KEEP | required configuration/identity | organisation_id->organisations.id; user_id->users.id | none | No |
| app_config | 0 | KEEP | required configuration/identity | - | none | No |
| app_settings | 15 | KEEP | required configuration/identity | updated_by->users.id | none | No |
| app_versions | 0 | REVIEW | decision required | - | may hold legit state | YES |
| application_settings_history | 1 | KEEP | required configuration/identity | - | none | No |
| audit_logs | 79 | REVIEW | decision required | - | may hold legit state | YES |
| bank_accounts | 0 | REVIEW | decision required | branch_id->branches.id | may hold legit state | YES |
| bank_branches | 2 | KEEP | required configuration/identity | bank_id->banks.id | none | No |
| banks | 11 | KEEP | required configuration/identity | country_id->countries.id | none | No |
| booking_cancellations | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| booking_invitations | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| booking_matchmaking_requests | 1 | CLEAR | reset activity | booking_id->bookings.id; target_level_id->player_levels.id | ops/financial reset - backup mandatory | YES |
| booking_participants | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| booking_players | 0 | CLEAR | CLEAR - already empty (no-op) | booking_id->bookings.id; player_id->users.id | none | No (no-op) |
| booking_series | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| booking_settlements | 0 | CLEAR | CLEAR - already empty (no-op) | booking_id->bookings.id; created_by->users.id; organisation_id->organisations.id | none | No (no-op) |
| booking_slots | 3 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| bookings | 5 | CLEAR | reset activity | branch_id->branches.id; tax_rate_id->tax_rates.id | ops/financial reset - backup mandatory | YES |
| branch_amenities | 0 | KEEP | required configuration/identity | amenity_id->amenities.id; branch_id->branches.id | none | No |
| branch_amenity_assignments | 5 | KEEP | required configuration/identity | - | none | No |
| branch_financial_details | 2 | KEEP | required configuration/identity | branch_id->branches.id | none | No |
| branch_holidays | 0 | KEEP | required configuration/identity | branch_id->branches.id | none | No |
| branch_player_access | 0 | REVIEW | decision required | branch_id->branches.id; player_id->users.id; reviewed_by->users.id | may hold legit state | YES |
| branch_staff | 0 | KEEP | required configuration/identity | branch_id->branches.id; user_id->users.id | none | No |
| branches | 14 | KEEP | required configuration/identity | currency_id->currencies.id; organisation_id->organisations.id | none | No |
| brands | 76 | KEEP | required configuration/identity | - | none | No |
| cancellation_policies | 6 | KEEP | required configuration/identity | branch_id->branches.id | none | No |
| cart_items | 1 | CLEAR | reset activity | product_id->products.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| chart_of_accounts | 91 | KEEP | required configuration/identity | organisation_id->organisations.id; parent_id->chart_of_accounts.id | none | No |
| cities | 333 | KEEP | required configuration/identity | province_id->provinces.id | none | No |
| client_error_reports | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| cms_blogs | 3 | REVIEW | decision required | author_id->users.id | may hold legit state | YES |
| cms_contact_submission_attachments | 0 | REVIEW | decision required | submission_id->cms_contact_submissions.id; upload_id->uploads.id | may hold legit state | YES |
| cms_contact_submissions | 0 | REVIEW | decision required | - | may hold legit state | YES |
| cms_media | 0 | REVIEW | decision required | uploaded_by->users.id | may hold legit state | YES |
| cms_pages | 10 | REVIEW | decision required | - | may hold legit state | YES |
| cms_section_blocks | 78 | REVIEW | decision required | page_id->cms_pages.id | may hold legit state | YES |
| cms_sections | 0 | REVIEW | decision required | page_id->cms_pages.id | may hold legit state | YES |
| coach_availability | 7 | REVIEW | decision required | branch_id->branches.id; coach_id->coach_profiles.id | may hold legit state | YES |
| coach_availability_blackouts | 0 | REVIEW | decision required | coach_id->coach_profiles.id | may hold legit state | YES |
| coach_org_agreements | 2 | REVIEW | decision required | coach_id->coach_profiles.id; organisation_id->organisations.id | may hold legit state | YES |
| coach_profiles | 3 | KEEP | required configuration/identity | user_id->users.id | none | No |
| coach_reviews | 0 | CLEAR | CLEAR - already empty (no-op) | coach_id->coach_profiles.id; player_id->users.id; session_id->coach_sessions.id | none | No (no-op) |
| coach_service_locations | 0 | REVIEW | decision required | branch_id->branches.id; coach_id->coach_profiles.id | may hold legit state | YES |
| coach_session_events | 0 | CLEAR | CLEAR - already empty (no-op) | session_id->coach_sessions.id | none | No (no-op) |
| coach_sessions | 0 | CLEAR | CLEAR - already empty (no-op) | booking_id->bookings.id; branch_id->branches.id; coach_id->coach_profiles.id | none | No (no-op) |
| coaches | 0 | KEEP | required configuration/identity | organisation_id->organisations.id; user_id->users.id | none | No |
| communication_log | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| community_event_participants | 0 | CLEAR | CLEAR - already empty (no-op) | event_id->community_events.id; user_id->users.id | none | No (no-op) |
| community_events | 0 | REVIEW | decision required | branch_id->branches.id; creator_id->users.id; organisation_id->organisations.id | may hold legit state | YES |
| configuration_profile_settings | 0 | KEEP | required configuration/identity | profile_id->configuration_profiles.id | none | No |
| configuration_profiles | 0 | KEEP | required configuration/identity | - | none | No |
| conversation_participants | 2 | REVIEW | decision required | conversation_id->conversations.id; user_id->users.id | may hold legit state | YES |
| conversations | 1 | REVIEW | decision required | created_by->users.id | may hold legit state | YES |
| countries | 8 | KEEP | required configuration/identity | default_currency->currencies.code | none | No |
| coupon_assignments | 0 | CLEAR | CLEAR - already empty (no-op) | coupon_id->coupons.id | none | No (no-op) |
| coupon_usage | 0 | CLEAR | CLEAR - already empty (no-op) | coupon_id->coupons.id; user_id->users.id | none | No (no-op) |
| coupons | 0 | KEEP | required configuration/identity | - | none | No |
| currencies | 7 | KEEP | required configuration/identity | - | none | No |
| customer_segments | 0 | REVIEW | decision required | created_by->users.id | may hold legit state | YES |
| dead_letter_entries | 0 | REVIEW | decision required | - | may hold legit state | YES |
| departments | 0 | REVIEW | decision required | organisation_id->organisations.id; parent_id->departments.id | may hold legit state | YES |
| design_theme_reset_baseline | 1 | KEEP | required configuration/identity | - | none | No |
| design_token_versions | 3 | KEEP | required configuration/identity | - | none | No |
| design_tokens | 159 | KEEP | required configuration/identity | - | none | No |
| elo_ratings | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| employees | 0 | REVIEW | decision required | department_id->departments.id; organisation_id->organisations.id; position_id->positions.id | may hold legit state | YES |
| employment_contracts | 0 | REVIEW | decision required | employee_id->employees.id | may hold legit state | YES |
| feature_flags | 21 | KEEP | required configuration/identity | - | none | No |
| financial_entitlements | 0 | CLEAR | CLEAR - already empty (no-op) | branch_id->branches.id; organisation_id->organisations.id; settlement_id->settlements.id | none | No (no-op) |
| financial_journal_entries | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| gateway_settlement_transactions | 7 | CLEAR | reset activity | payment_transaction_id->payment_transactions.id; gateway_settlement_id->gateway_settlements.id | ops/financial reset - backup mandatory | YES |
| gateway_settlements | 2 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| general_ledger | 40 | CLEAR | reset activity | account_id->chart_of_accounts.id; created_by->users.id; ledger_entry_id->ledger_entries.id | ops/financial reset - backup mandatory | YES |
| group_invitations | 0 | CLEAR | CLEAR - already empty (no-op) | conversation_id->conversations.id; invitee_id->users.id; inviter_id->users.id | none | No (no-op) |
| holidays | 1 | REVIEW | decision required | - | may hold legit state | YES |
| inventory_logs | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; variant_id->product_variants.id | none | No (no-op) |
| invitations | 22 | CLEAR | reset activity | match_id->matches.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| invoice_items | 0 | CLEAR | CLEAR - already empty (no-op) | invoice_id->invoices.id; tax_rate_id->tax_rates.id | none | No (no-op) |
| invoices | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; organisation_id->organisations.id; user_id->users.id | none | No (no-op) |
| join_requests | 1 | CLEAR | reset activity | match_id->matches.id; responder_id->users.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| kpi_snapshots | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| languages | 2 | KEEP | required configuration/identity | - | none | No |
| leads | 0 | CLEAR | CLEAR - already empty (no-op) | assigned_to->users.id; converted_user_id->users.id | none | No (no-op) |
| league_divisions | 0 | CLEAR | CLEAR - already empty (no-op) | league_id->leagues.id | none | No (no-op) |
| league_matches | 0 | CLEAR | CLEAR - already empty (no-op) | away_team_id->league_teams.id; court_id->resources.id; division_id->league_divisions.id | none | No (no-op) |
| league_results | 0 | CLEAR | CLEAR - already empty (no-op) | entered_by->users.id; match_id->league_matches.id; winner_team_id->league_teams.id | none | No (no-op) |
| league_standings | 0 | CLEAR | CLEAR - already empty (no-op) | division_id->league_divisions.id; team_id->league_teams.id | none | No (no-op) |
| league_teams | 0 | CLEAR | CLEAR - already empty (no-op) | division_id->league_divisions.id | none | No (no-op) |
| leagues | 0 | REVIEW | decision required | season_id->seasons.id | may hold legit state | YES |
| leave_balances | 0 | REVIEW | decision required | employee_id->employees.id; leave_type_id->leave_types.id | may hold legit state | YES |
| leave_requests | 0 | REVIEW | decision required | approved_by->users.id; employee_id->employees.id; leave_type_id->leave_types.id | may hold legit state | YES |
| leave_types | 0 | REVIEW | decision required | organisation_id->organisations.id | may hold legit state | YES |
| ledger_entries | 40 | CLEAR | reset activity | chart_account_id->chart_of_accounts.id; organisation_id->organisations.id; period_id->accounting_periods.id | ops/financial reset - backup mandatory | YES |
| login_attempts | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| loyalty_campaigns | 0 | REVIEW | decision required | - | may hold legit state | YES |
| loyalty_points | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| marketing_campaigns | 0 | REVIEW | decision required | created_by->users.id; segment_id->customer_segments.id | may hold legit state | YES |
| marketplace_complaint_config | 1 | KEEP | required configuration/identity | - | none | No |
| marketplace_complaints | 0 | CLEAR | CLEAR - already empty (no-op) | buyer_id->users.id; order_item_id->order_items.id; order_id->orders.id | none | No (no-op) |
| marketplace_ledger_entries | 0 | CLEAR | CLEAR - already empty (no-op) | branch_id->branches.id; order_id->orders.id; organisation_id->organisations.id | none | No (no-op) |
| match_participants | 8 | CLEAR | reset activity | match_id->matches.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| match_result_participants | 8 | CLEAR | reset activity | match_id->matches.id; result_id->match_result_records.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| match_result_records | 4 | CLEAR | reset activity | accepted_by->users.id; branch_id->branches.id; disputed_by->users.id | ops/financial reset - backup mandatory | YES |
| match_sessions | 4 | CLEAR | reset activity | match_id->matches.id; winner_id->users.id | ops/financial reset - backup mandatory | YES |
| matches | 4 | CLEAR | reset activity | booking_id->bookings.id; format_id->sport_formats.id; rule_set_id->sport_rule_sets.id | ops/financial reset - backup mandatory | YES |
| membership_benefits | 0 | KEEP | required configuration/identity | membership_plan_id->membership_plans.id | none | No |
| membership_history | 0 | CLEAR | CLEAR - already empty (no-op) | user_membership_id->user_memberships.id | none | No (no-op) |
| membership_installments | 0 | CLEAR | CLEAR - already empty (no-op) | payment_transaction_id->payment_transactions.id; subscription_id->membership_subscriptions.id | none | No (no-op) |
| membership_plan_branches | 0 | KEEP | required configuration/identity | branch_id->branches.id; plan_version_id->membership_plan_versions.id | none | No |
| membership_plan_components | 0 | KEEP | required configuration/identity | plan_version_id->membership_plan_versions.id | none | No |
| membership_plan_installment_templates | 0 | KEEP | required configuration/identity | plan_version_id->membership_plan_versions.id | none | No |
| membership_plan_versions | 0 | KEEP | required configuration/identity | created_by->users.id; membership_plan_id->membership_plans.id | none | No |
| membership_plans | 0 | KEEP | required configuration/identity | - | none | No |
| membership_subscription_components | 0 | CLEAR | CLEAR - already empty (no-op) | subscription_id->membership_subscriptions.id | none | No (no-op) |
| membership_subscriptions | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; invoice_id->invoices.id; organisation_id->organisations.id | none | No (no-op) |
| memberships | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| messages | 0 | REVIEW | decision required | conversation_id->conversations.id; sender_id->users.id | may hold legit state | YES |
| migration_history | 201 | KEEP | required configuration/identity | - | none | No |
| notification_ab_results | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| notification_ab_tests | 0 | KEEP | required configuration/identity | - | none | No |
| notification_actions | 24 | KEEP | required configuration/identity | - | none | No |
| notification_analytics | 66 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| notification_audit_trail | 176 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| notification_broadcasts | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| notification_categories | 18 | KEEP | required configuration/identity | - | none | No |
| notification_cleanup_policies | 7 | KEEP | required configuration/identity | - | none | No |
| notification_dead_letter_queue | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| notification_delivery | 60 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| notification_digest_windows | 0 | REVIEW | decision required | - | may hold legit state | YES |
| notification_feature_flags | 7 | KEEP | required configuration/identity | - | none | No |
| notification_global_settings | 15 | KEEP | required configuration/identity | - | none | No |
| notification_providers | 6 | KEEP | required configuration/identity | - | none | No |
| notification_queue | 0 | CLEAR | CLEAR - already empty (no-op) | user_id->users.id | none | No (no-op) |
| notification_rate_limits | 473 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| notification_replay_log | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| notification_retry_policies | 7 | REVIEW | decision required | - | may hold legit state | YES |
| notification_rule_conditions | 5 | KEEP | required configuration/identity | rule_id->notification_rules.id | none | No |
| notification_rules | 5 | KEEP | required configuration/identity | - | none | No |
| notification_template_versions | 0 | KEEP | required configuration/identity | - | none | No |
| notification_templates | 337 | KEEP | required configuration/identity | - | none | No |
| notification_types | 12 | KEEP | required configuration/identity | - | none | No |
| notification_webhooks | 0 | KEEP | required configuration/identity | - | none | No |
| notifications | 60 | CLEAR | reset activity | action_id->notification_actions.id; category_id->notification_categories.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| order_items | 0 | CLEAR | CLEAR - already empty (no-op) | order_id->orders.id; seller_id->organisations.id; product_id->products.id | none | No (no-op) |
| order_status_history | 0 | CLEAR | CLEAR - already empty (no-op) | order_id->orders.id | none | No (no-op) |
| orders | 0 | CLEAR | CLEAR - already empty (no-op) | buyer_id->users.id | none | No (no-op) |
| org_announcements | 0 | REVIEW | decision required | created_by->users.id; organisation_id->organisations.id | may hold legit state | YES |
| organisation_attribute_values | 0 | REVIEW | decision required | attribute_id->organisation_type_attributes.id; organisation_id->organisations.id | may hold legit state | YES |
| organisation_coa_customizations | 0 | KEEP | required configuration/identity | account_id->chart_of_accounts.id; organisation_id->organisations.id | none | No |
| organisation_membership_settings | 0 | KEEP | required configuration/identity | organisation_id->organisations.id | none | No |
| organisation_reviews | 0 | CLEAR | CLEAR - already empty (no-op) | organisation_id->organisations.id; user_id->users.id | none | No (no-op) |
| organisation_subscriptions | 19 | KEEP | required configuration/identity | organisation_id->organisations.id; plan_id->subscription_plans.id | none | No |
| organisation_type_attributes | 3 | KEEP | required configuration/identity | org_type_id->organisation_types.id | none | No |
| organisation_types | 5 | KEEP | required configuration/identity | - | none | No |
| organisation_upgrade_requests | 17 | REVIEW | decision required | approved_by->users.id; cancelled_by->users.id; organisation_id->organisations.id | may hold legit state | YES |
| organisation_verification_log | 0 | REVIEW | decision required | created_by->users.id; organisation_id->organisations.id | may hold legit state | YES |
| organisations | 17 | KEEP | required configuration/identity | country_id->countries.id; owner_id->users.id; org_type_id->organisation_types.id | none | No |
| outbox_cursors | 14 | REVIEW | decision required | - | may hold legit state | YES |
| password_reset_tokens | 0 | CLEAR | CLEAR - already empty (no-op) | user_id->users.id | none | No (no-op) |
| payment_allocations | 0 | CLEAR | CLEAR - already empty (no-op) | booking_id->bookings.id; series_id->booking_series.id; payment_transaction_id->payment_transactions.id | none | No (no-op) |
| payment_gateway_config | 3 | KEEP | required configuration/identity | payment_method_id->payment_methods.id; organisation_id->organisations.id | none | No |
| payment_methods | 6 | KEEP | required configuration/identity | - | none | No |
| payment_transactions | 10 | CLEAR | reset activity | gateway_settlement_id->gateway_settlements.id | ops/financial reset - backup mandatory | YES |
| payroll_components | 0 | REVIEW | decision required | organisation_id->organisations.id | may hold legit state | YES |
| payroll_entries | 0 | REVIEW | decision required | employee_id->employees.id; payroll_run_id->payroll_runs.id | may hold legit state | YES |
| payroll_runs | 0 | REVIEW | decision required | created_by->users.id; organisation_id->organisations.id; posted_by->users.id | may hold legit state | YES |
| peak_hour_pricing | 0 | KEEP | required configuration/identity | resource_id->resources.id | none | No |
| permission_modules | 50 | KEEP | required configuration/identity | - | none | No |
| permissions | 971 | KEEP | required configuration/identity | module_id->permission_modules.id | none | No |
| platform_accounts | 4 | KEEP | required configuration/identity | currency_id->currencies.id | none | No |
| player_emergency_contacts | 0 | KEEP | required configuration/identity | user_id->users.id | none | No |
| player_levels | 5 | KEEP | required configuration/identity | - | none | No |
| player_match_requests | 0 | CLEAR | CLEAR - already empty (no-op) | booking_id->bookings.id; created_by->users.id | none | No (no-op) |
| player_profiles | 28 | KEEP | required configuration/identity | user_id->users.id | none | No |
| player_rating_history | 3 | CLEAR | reset activity | changed_by->users.id; sport_id->sports.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| player_ratings | 2 | CLEAR | reset activity | sport_id->sports.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| player_sport_interests | 28 | KEEP | required configuration/identity | sport_id->sports.id; user_id->users.id | none | No |
| player_statistics | 0 | CLEAR | CLEAR - already empty (no-op) | season_id->seasons.id | none | No (no-op) |
| positions | 0 | KEEP | required configuration/identity | department_id->departments.id; organisation_id->organisations.id | none | No |
| pricing_rules | 0 | KEEP | required configuration/identity | - | none | No |
| pricing_seasons | 0 | KEEP | required configuration/identity | - | none | No |
| processed_commands | 190 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| processed_events | 5 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| product_categories | 118 | KEEP | required configuration/identity | parent_id->product_categories.id | none | No |
| product_images | 0 | KEEP | required configuration/identity | product_id->products.id; variant_id->product_variants.id | none | No |
| product_reviews | 0 | CLEAR | CLEAR - already empty (no-op) | product_id->products.id; user_id->users.id | none | No (no-op) |
| product_specifications | 59 | KEEP | required configuration/identity | product_id->products.id | none | No |
| product_tags | 90 | KEEP | required configuration/identity | product_id->products.id; tag_id->tags.id | none | No |
| product_variants | 40 | KEEP | required configuration/identity | product_id->products.id | none | No |
| products | 93 | KEEP | required configuration/identity | brand_id->brands.id; category_id->product_categories.id; seller_id->organisations.id | none | No |
| professional_profiles | 3 | KEEP | required configuration/identity | user_id->users.id | none | No |
| professional_services | 2 | KEEP | required configuration/identity | professional_profile_id->professional_profiles.id | none | No |
| provinces | 120 | KEEP | required configuration/identity | country_id->countries.id | none | No |
| public_match_details | 4 | CLEAR | reset activity | creator_id->users.id; target_level_id->player_levels.id; match_id->matches.id | ops/financial reset - backup mandatory | YES |
| published_events | 726 | REVIEW | decision required | - | may hold legit state | YES |
| purchase_order_items | 0 | CLEAR | CLEAR - already empty (no-op) | purchase_order_id->purchase_orders.id; variant_id->product_variants.id | none | No (no-op) |
| purchase_orders | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; organisation_id->organisations.id; supplier_id->suppliers.id | none | No (no-op) |
| push_log | 0 | CLEAR | CLEAR - already empty (no-op) | user_id->users.id | none | No (no-op) |
| push_tokens | 0 | CLEAR | CLEAR - already empty (no-op) | user_id->users.id | none | No (no-op) |
| rating_evidence | 4 | CLEAR | reset activity | sport_id->sports.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| referee_availability | 0 | REVIEW | decision required | referee_id->referees.id | may hold legit state | YES |
| referee_availability_blackouts | 0 | REVIEW | decision required | referee_id->referees.id | may hold legit state | YES |
| referees | 0 | KEEP | required configuration/identity | user_id->users.id | none | No |
| related_products | 0 | KEEP | required configuration/identity | product_id->products.id; related_product_id->products.id | none | No |
| resource_attribute_values | 13 | REVIEW | decision required | attribute_id->resource_type_attributes.id; resource_id->resources.id | may hold legit state | YES |
| resource_maintenance | 0 | REVIEW | decision required | resource_id->resources.id | may hold legit state | YES |
| resource_peak_hours | 35 | KEEP | required configuration/identity | resource_id->resources.id | none | No |
| resource_time_slots | 0 | KEEP | required configuration/identity | resource_id->resources.id | none | No |
| resource_type_attributes | 10 | KEEP | required configuration/identity | resource_type_id->resource_types.id | none | No |
| resource_types | 10 | KEEP | required configuration/identity | - | none | No |
| resources | 5 | KEEP | required configuration/identity | branch_id->branches.id; sport_id->sports.id; resource_type_id->resource_types.id | none | No |
| reward_catalog | 0 | KEEP | required configuration/identity | - | none | No |
| reward_claims | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| role_permissions | 6918 | KEEP | required configuration/identity | permission_id->permissions.id; role_id->roles.id | none | No |
| role_theme_overrides | 0 | KEEP | required configuration/identity | - | none | No |
| roles | 42 | KEEP | required configuration/identity | organisation_id->organisations.id | none | No |
| seasons | 0 | REVIEW | decision required | - | may hold legit state | YES |
| segment_members | 0 | REVIEW | decision required | segment_id->customer_segments.id; user_id->users.id | may hold legit state | YES |
| segments | 0 | REVIEW | decision required | - | may hold legit state | YES |
| seller_profiles | 0 | KEEP | required configuration/identity | branch_id->branches.id; organisation_id->organisations.id; user_id->users.id | none | No |
| seller_shipping_rates | 5 | KEEP | required configuration/identity | - | none | No |
| settlement_entitlements | 0 | CLEAR | CLEAR - already empty (no-op) | entitlement_id->financial_entitlements.id; settlement_id->settlements.id | none | No (no-op) |
| settlement_orders | 0 | CLEAR | CLEAR - already empty (no-op) | order_id->orders.id; settlement_id->settlements.id | none | No (no-op) |
| settlement_transfers | 0 | CLEAR | CLEAR - already empty (no-op) | settlement_id->settlements.id | none | No (no-op) |
| settlements | 0 | CLEAR | CLEAR - already empty (no-op) | branch_id->branches.id; organisation_id->organisations.id | none | No (no-op) |
| sidebar_layout | 11 | KEEP | required configuration/identity | user_id->users.id | none | No |
| sport_formats | 3 | KEEP | required configuration/identity | created_by->users.id; sport_id->sports.id | none | No |
| sport_positions | 0 | KEEP | required configuration/identity | sport_id->sports.id | none | No |
| sport_rule_sets | 3 | KEEP | required configuration/identity | created_by->users.id; format_id->sport_formats.id | none | No |
| sports | 16 | KEEP | required configuration/identity | - | none | No |
| staff_attendance | 0 | REVIEW | decision required | employee_id->employees.id | may hold legit state | YES |
| stock_transfers | 0 | CLEAR | CLEAR - already empty (no-op) | created_by->users.id; from_warehouse_id->warehouses.id; to_warehouse_id->warehouses.id | none | No (no-op) |
| subscription_features | 9 | KEEP | required configuration/identity | - | none | No |
| subscription_plan_features | 54 | KEEP | required configuration/identity | plan_id->subscription_plans.id; feature_id->subscription_features.id | none | No |
| subscription_plan_rates | 23 | KEEP | required configuration/identity | plan_id->subscription_plans.id | none | No |
| subscription_plans | 7 | KEEP | required configuration/identity | - | none | No |
| suppliers | 0 | REVIEW | decision required | organisation_id->organisations.id | may hold legit state | YES |
| support_ticket_messages | 0 | REVIEW | decision required | ticket_id->support_tickets.id; user_id->users.id | may hold legit state | YES |
| support_tickets | 0 | REVIEW | decision required | assigned_to->users.id; organisation_id->organisations.id; user_id->users.id | may hold legit state | YES |
| system_settings | 42 | KEEP | required configuration/identity | - | none | No |
| tags | 25 | KEEP | required configuration/identity | - | none | No |
| tax_rates | 0 | KEEP | required configuration/identity | organisation_id->organisations.id | none | No |
| team_statistics | 0 | CLEAR | CLEAR - already empty (no-op) | season_id->seasons.id; team_id->league_teams.id | none | No (no-op) |
| tournament_age_categories | 7 | KEEP | required configuration/identity | - | none | No |
| tournament_bracket_types | 4 | KEEP | required configuration/identity | - | none | No |
| tournament_competitions | 3 | CLEAR | reset activity | bracket_type_id->tournament_bracket_types.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id | ops/financial reset - backup mandatory | YES |
| tournament_draw_entries | 0 | CLEAR | CLEAR - already empty (no-op) | draw_id->tournament_draws.id; moved_by->users.id; participant_id->tournament_participants.id | none | No (no-op) |
| tournament_draws | 0 | CLEAR | CLEAR - already empty (no-op) | competition_id->tournament_competitions.id; generated_by->users.id; tournament_id->tournaments.id | none | No (no-op) |
| tournament_group_members | 0 | CLEAR | CLEAR - already empty (no-op) | group_id->tournament_groups.id; registration_id->tournament_registrations.id | none | No (no-op) |
| tournament_groups | 0 | CLEAR | CLEAR - already empty (no-op) | competition_id->tournament_competitions.id; tournament_id->tournaments.id | none | No (no-op) |
| tournament_match_results | 0 | CLEAR | CLEAR - already empty (no-op) | entered_by->users.id; match_id->tournament_matches.id; winner_id->users.id | none | No (no-op) |
| tournament_match_scores | 0 | CLEAR | CLEAR - already empty (no-op) | match_id->tournament_matches.id | none | No (no-op) |
| tournament_matches | 0 | CLEAR | CLEAR - already empty (no-op) | player1_id->users.id; player2_id->users.id; resource_id->resources.id | none | No (no-op) |
| tournament_participant_members | 0 | CLEAR | CLEAR - already empty (no-op) | participant_id->tournament_participants.id; replaced_by_member_id->tournament_participant_members.id; tournament_id->tournaments.id | none | No (no-op) |
| tournament_participants | 2 | CLEAR | reset activity | competition_id->tournament_competitions.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | ops/financial reset - backup mandatory | YES |
| tournament_placements | 0 | CLEAR | CLEAR - already empty (no-op) | competition_id->tournament_competitions.id; participant_id->tournament_participants.id; tournament_id->tournaments.id | none | No (no-op) |
| tournament_prize_awards | 0 | CLEAR | CLEAR - already empty (no-op) | competition_id->tournament_competitions.id; prize_id->tournament_prizes.id; registration_id->tournament_registrations.id | none | No (no-op) |
| tournament_prizes | 1 | CLEAR | reset activity | competition_id->tournament_competitions.id; tournament_id->tournaments.id | ops/financial reset - backup mandatory | YES |
| tournament_registration_refund_requests | 0 | CLEAR | CLEAR - already empty (no-op) | registration_id->tournament_registrations.id; requested_by->users.id; reviewed_by->users.id | none | No (no-op) |
| tournament_registrations | 2 | CLEAR | reset activity | competition_id->tournament_competitions.id; player_id->users.id; tournament_id->tournaments.id | ops/financial reset - backup mandatory | YES |
| tournament_replacement_requests | 0 | CLEAR | CLEAR - already empty (no-op) | outgoing_member_user_id->users.id; participant_id->tournament_participants.id; replacement_user_id->users.id | none | No (no-op) |
| tournament_seeds | 0 | CLEAR | CLEAR - already empty (no-op) | assigned_by->users.id; competition_id->tournament_competitions.id; participant_id->tournament_participants.id | none | No (no-op) |
| tournament_sponsors | 0 | CLEAR | CLEAR - already empty (no-op) | tournament_id->tournaments.id | none | No (no-op) |
| tournament_stages | 0 | CLEAR | CLEAR - already empty (no-op) | competition_id->tournament_competitions.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id | none | No (no-op) |
| tournament_standings | 0 | CLEAR | CLEAR - already empty (no-op) | group_id->tournament_groups.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | none | No (no-op) |
| tournament_team_invitations | 0 | CLEAR | CLEAR - already empty (no-op) | invitee_user_id->users.id; inviter_user_id->users.id; participant_id->tournament_participants.id | none | No (no-op) |
| tournaments | 3 | CLEAR | reset activity | bracket_type_id->tournament_bracket_types.id; branch_id->branches.id; creator_id->users.id | ops/financial reset - backup mandatory | YES |
| transaction_entries | 0 | CLEAR | CLEAR - already empty (no-op) | branch_id->branches.id; currency_id->currencies.id; organisation_id->organisations.id | none | No (no-op) |
| transactions | 11 | CLEAR | reset activity | currency_id->currencies.id | ops/financial reset - backup mandatory | YES |
| translation_keys | 2363 | KEEP | required configuration/identity | - | none | No |
| translations | 610 | KEEP | required configuration/identity | - | none | No |
| uploads | 36 | REVIEW | decision required | - | may hold legit state | YES |
| user_addresses | 5 | KEEP | required configuration/identity | user_id->users.id | none | No |
| user_branches | 1 | KEEP | required configuration/identity | branch_id->branches.id; user_id->users.id | none | No |
| user_channel_preferences | 0 | KEEP | required configuration/identity | - | none | No |
| user_devices | 0 | REVIEW | decision required | user_id->users.id | may hold legit state | YES |
| user_follows | 0 | REVIEW | decision required | follower_id->users.id; following_id->users.id | may hold legit state | YES |
| user_friends | 0 | REVIEW | decision required | addressee_id->users.id; requester_id->users.id | may hold legit state | YES |
| user_memberships | 0 | CLEAR | CLEAR - already empty (no-op) | membership_plan_id->membership_plans.id | none | No (no-op) |
| user_notification_preferences | 0 | KEEP | required configuration/identity | category_id->notification_categories.id; user_id->users.id | none | No |
| user_organisations | 2 | KEEP | required configuration/identity | organisation_id->organisations.id; user_id->users.id | none | No |
| user_quiet_hours | 0 | KEEP | required configuration/identity | - | none | No |
| user_role_scopes | 21 | KEEP | required configuration/identity | user_role_id->user_roles.id | none | No |
| user_roles | 47 | KEEP | required configuration/identity | assigned_by->users.id; role_id->roles.id; user_id->users.id | none | No |
| user_sessions | 3606 | CLEAR | reset activity | device_id->user_devices.id; user_id->users.id | ops/financial reset - backup mandatory | YES |
| user_sports | 0 | KEEP | required configuration/identity | sport_id->sports.id; user_id->users.id | none | No |
| user_targeted_achievements | 0 | REVIEW | decision required | achievement_key->achievements.achievement_key; user_id->users.id | may hold legit state | YES |
| user_wallets | 28 | KEEP | required configuration/identity | - | none | No |
| users | 28 | KEEP | required configuration/identity | country_id->countries.id | none | No |
| waiting_list | 0 | CLEAR | CLEAR - already empty (no-op) | match_id->matches.id; user_id->users.id | none | No (no-op) |
| wallet_transactions | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| warehouses | 0 | KEEP | required configuration/identity | organisation_id->organisations.id | none | No |
| web_vitals_metrics | 0 | CLEAR | CLEAR - already empty (no-op) | - | none | No (no-op) |
| wishlist_items | 0 | CLEAR | CLEAR - already empty (no-op) | product_id->products.id; user_id->users.id | none | No (no-op) |
| withdrawal_requests | 0 | CLEAR | CLEAR - already empty (no-op) | assigned_to->users.id; branch_financial_details_id->branch_financial_details.id; executed_by->users.id | none | No (no-op) |
| workflow_branch_instances | 0 | REVIEW | decision required | workflow_instance_id->workflow_instances.id | may hold legit state | YES |
| workflow_definitions | 3700 | CLEAR | reset activity | - | ops/financial reset - backup mandatory | YES |
| workflow_event_subscriptions | 0 | REVIEW | decision required | workflow_instance_id->workflow_instances.id | may hold legit state | YES |
| workflow_events | 0 | REVIEW | decision required | workflow_instance_id->workflow_instances.id | may hold legit state | YES |
| workflow_instances | 0 | REVIEW | decision required | - | may hold legit state | YES |
| workflow_steps | 0 | REVIEW | decision required | workflow_instance_id->workflow_instances.id | may hold legit state | YES |
| year_close_cycles | 0 | CLEAR | CLEAR - already empty (no-op) | year_closings_id->year_closings.id | none | No (no-op) |
| year_closings | 0 | CLEAR | CLEAR - already empty (no-op) | retained_earnings_account_id->chart_of_accounts.id; created_by->users.id; organisation_id->organisations.id | none | No (no-op) |

## 14. APPROVAL GATE

PRODUCTION TARGET:
187.127.72.93:3307 / courtzon_v3

READ-ONLY:
YES

CLEANUP EXECUTED:
NO

FK ORDER VALIDATION:
PASS

FINAL CLASSIFICATION:
KEEP = 123
CLEAR = 136
REVIEW = 71

PRODUCTION CLEANUP STATUS:
AWAITING FINAL HUMAN APPROVAL

This plan is NOT marked ready for execution. It is the single authoritative proposal to be reviewed. No deletion has been performed.
