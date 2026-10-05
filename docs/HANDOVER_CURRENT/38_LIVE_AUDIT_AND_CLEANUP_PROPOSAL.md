# 38 - LIVE AUDIT & DATABASE CLEANUP PROPOSAL

**Audit timestamp:** 2026-10-04 (UTC)  -  Read-only. Nothing deleted or modified.

## Live environment header (verified this session)

| Item | Value |
|---|---|
| Live frontend URL | http://localhost:5173 (nginx container) |
| Live backend/API URL | http://localhost:3000 |
| Live Git commit | `aa9e3d1895e849691f145d409c12b997435536b2` (branch `master`) |
| Live commit timestamp | 2026-10-04 19:32:31 +0300 (feat(membership) P3) |
| Backend version | 1.0.0 (node v22.22.3, storageProvider local, gitCommit `unknown`) |
| expectedMigration (runtime) | `194_membership_entitlements` |
| Frontend | SPA served by nginx :5173 (healthy) |
| Docker | 6 containers up: backend, frontend, mysql, redis, prometheus, grafana |
| Database server | MySQL 8.0.46 (container courtzon-mysql, hostname 6622d8c632c9, port 3307) |
| Database name | `courtzon_v3` (330 tables) + stale `courtzon_v3_baseline` (317, synthetic) |
| Migration history | 202 rows (all up); latest `194_membership_entitlements.sql` |
| Redis | 7.4.9 standalone :6379 |
| Socket.IO | /health/socket -> ok (connected 0, rooms 0) |
| Workers/cron | 30 handlers in-process; repeat jobs observed (payment-cron, cancel_expired_bookings, expire_academy_holds, digests) |
| Host port 3306 | open - separate local MySQL (XAMPP), likely `courtzon_v2`; NOT part of this stack; NOT touched |

### Local vs Live comparison

| Item | Local repo | Live deployment | Same? |
|---|---|---|---|
| Git commit | aa9e3d18 (master, HEAD) | aa9e3d18 (images built 2026-10-04 after this commit) | SAME |
| DB schema version | migrations to 194 on docker courtzon_v3 | migrations to 194 on docker courtzon_v3 | SAME |
| Docker images | courtzon-backend/frontend:latest (2026-10-04) | same images running | SAME |
| Baseline file | 328 CREATE TABLE (missing payment_allocations - known drift) | live DB 330 tables (has payment_allocations) | DIFFERENT (known) |
| Host 3306 DB | courtzon_v2 (XAMPP) exists per AGENTS.md - not inspected | not part of stack | n/a |

Differences are expected and do not block testing. The baseline-file gap does not affect the running DB; it affects fresh installs only (see existing 00-04 handover docs).

## LIVE DATABASE INVENTORY (330 tables) - TABLE | ROWS | PK | FKs(col->ref) | REFERENCED BY | KEEP/CLEAR/REVIEW | TYPE | REASON

| TABLE | ROWS | PK | FKs | RefBy | CLASS | KEEP/CLEAR/REVIEW | REASON |
|---|---|---|---|---|---|---|---|
| academies | 0 | id | branch_id->branches.id; organisation_id->organisations.id; sport_id->sports.id | academy_curriculums(academy_id); academy_evaluations(academy_id); academy_sessions(academy_id) | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| academy_attendance | 0 | id | enrollment_id->academy_enrollments.id; group_session_id->academy_group_sessions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_categories | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| academy_curriculums | 0 | id | academy_id->academies.id | academy_sessions(curriculum_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| academy_enrollment_payments | 0 | id | payment_transaction_id->payment_transactions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_enrollments | 0 | id | payment_confirmed_by->users.id; group_id->academy_groups.id; player_id->users.id; program_id->academy_programs.id | academy_attendance(enrollment_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_evaluations | 0 | id | academy_id->academies.id; evaluator_id->users.id; player_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_group_sessions | 0 | id | confirmed_by->users.id; pending_resolved_by->users.id; schedule_id->academy_schedules.id; coach_id->users.id | academy_attendance(group_session_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_groups | 0 | id | coach_locked_by->users.id; coach_id->users.id; program_id->academy_programs.id | academy_enrollments(group_id); academy_group_sessions(group_id); academy_schedules(group_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| academy_programs | 0 | id | branch_id->branches.id; confirmed_by->users.id; organisation_id->organisations.id; sport_id->sports.id | academy_enrollments(program_id); academy_groups(program_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| academy_schedules | 0 | id | branch_id->branches.id; preferred_court_id->resources.id; created_by->users.id; group_id->academy_groups.id | academy_group_sessions(schedule_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| academy_session_attendance | 0 | id | player_id->users.id; session_id->academy_sessions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| academy_sessions | 0 | id | academy_id->academies.id; coach_id->users.id; curriculum_id->academy_curriculums.id; resource_id->resources.id | academy_session_attendance(session_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| account_template_lines | 26 | id | parent_line_id->account_template_lines.id; template_id->account_templates.id | account_template_lines(parent_line_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| account_templates | 3 | id | created_by->users.id; organisation_id->organisations.id | account_template_lines(template_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| accounting_event_mapping_lines | 512 | id | account_id->chart_of_accounts.id; organisation_id->organisations.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| accounting_periods | 11 | id | closed_by->users.id; organisation_id->organisations.id | general_ledger(period_id); ledger_entries(period_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| achievements | 0 | achievement_key | - | user_targeted_achievements(achievement_key) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| activity_logs | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| ad_campaigns | 0 | id | created_by->users.id; organisation_id->organisations.id; placement_id->ad_placements.id | ad_clicks(campaign_id); ad_creatives(campaign_id); ad_impressions(campaign_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| ad_clicks | 0 | id | campaign_id->ad_campaigns.id; impression_id->ad_impressions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| ad_creatives | 0 | id | campaign_id->ad_campaigns.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| ad_impressions | 0 | id | campaign_id->ad_campaigns.id | ad_clicks(impression_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| ad_placements | 0 | id | - | ad_campaigns(placement_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| amenities | 20 | id | - | branch_amenities(amenity_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| announcements | 0 | id | organisation_id->organisations.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| api_keys | 0 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| app_config | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| app_settings | 12 | id | updated_by->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| app_versions | 0 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| application_settings_history | 524 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| audit_logs | 14563 | id | - | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| bank_accounts | 0 | id | branch_id->branches.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| bank_branches | 1 | id | bank_id->banks.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| banks | 11 | id | country_id->countries.id | bank_branches(bank_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| booking_cancellations | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_invitations | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_matchmaking_requests | 0 | id | booking_id->bookings.id; target_level_id->player_levels.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_participants | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_players | 0 | id | booking_id->bookings.id; player_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_series | 0 | id | - | payment_allocations(series_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_settlements | 0 | id | booking_id->bookings.id; created_by->users.id; organisation_id->organisations.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| booking_slots | 4 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| bookings | 25 | id | branch_id->branches.id; tax_rate_id->tax_rates.id | booking_matchmaking_requests(booking_id); booking_players(booking_id); booking_settlements(booking_id); coach_sessions(booking_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| branch_amenities | 0 | branch_id,amenity_id | amenity_id->amenities.id; branch_id->branches.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| branch_amenity_assignments | 5 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| branch_financial_details | 1 | id | branch_id->branches.id | withdrawal_requests(branch_financial_details_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| branch_holidays | 0 | id | branch_id->branches.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| branch_player_access | 0 | id | branch_id->branches.id; player_id->users.id; reviewed_by->users.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| branch_staff | 0 | branch_id,user_id | branch_id->branches.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| branches | 60 | id | currency_id->currencies.id; organisation_id->organisations.id | academies(branch_id); academy_programs(branch_id); academy_schedules(branch_id); bank_accounts(branch_id) | KEEP | foundation | KEEP | foundational: required to operate after clean test run |
| brands | 12 | id | - | products(brand_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| cancellation_policies | 7 | id | branch_id->branches.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| cart_items | 0 | id | product_id->products.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| chart_of_accounts | 141 | id | organisation_id->organisations.id; parent_id->chart_of_accounts.id | accounting_event_mapping_lines(account_id); chart_of_accounts(parent_id); general_ledger(account_id); ledger_entries(chart_account_id) | KEEP | acct-config | KEEP | foundational: required to operate after clean test run |
| cities | 333 | id | province_id->provinces.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| client_error_reports | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| cms_blogs | 3 | id | author_id->users.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_contact_submission_attachments | 0 | id | submission_id->cms_contact_submissions.id; upload_id->uploads.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_contact_submissions | 0 | id | - | cms_contact_submission_attachments(submission_id) | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_media | 0 | id | uploaded_by->users.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_pages | 10 | id | - | cms_section_blocks(page_id); cms_sections(page_id) | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_section_blocks | 114 | id | page_id->cms_pages.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| cms_sections | 0 | id | page_id->cms_pages.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| coach_availability | 0 | id | branch_id->branches.id; coach_id->coach_profiles.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| coach_availability_blackouts | 0 | id | coach_id->coach_profiles.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| coach_org_agreements | 0 | id | coach_id->coach_profiles.id; organisation_id->organisations.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| coach_profiles | 0 | id | user_id->users.id | coach_availability(coach_id); coach_availability_blackouts(coach_id); coach_org_agreements(coach_id); coach_reviews(coach_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| coach_reviews | 0 | id | coach_id->coach_profiles.id; player_id->users.id; session_id->coach_sessions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| coach_service_locations | 0 | id | branch_id->branches.id; coach_id->coach_profiles.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| coach_session_events | 0 | id | session_id->coach_sessions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| coach_sessions | 0 | id | booking_id->bookings.id; branch_id->branches.id; coach_id->coach_profiles.id; organisation_id->organisations.id | coach_reviews(session_id); coach_session_events(session_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| coaches | 0 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| communication_log | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| community_event_participants | 0 | id | event_id->community_events.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| community_events | 0 | id | branch_id->branches.id; creator_id->users.id; organisation_id->organisations.id | community_event_participants(event_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| configuration_profile_settings | 0 | id | profile_id->configuration_profiles.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| configuration_profiles | 0 | id | - | configuration_profile_settings(profile_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| conversation_participants | 0 | id | conversation_id->conversations.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| conversations | 0 | id | created_by->users.id | conversation_participants(conversation_id); group_invitations(conversation_id); messages(conversation_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| countries | 8 | id | default_currency->currencies.code | banks(country_id); organisations(country_id); provinces(country_id); users(country_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| coupon_assignments | 0 | id | coupon_id->coupons.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| coupon_usage | 0 | id | coupon_id->coupons.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| coupons | 0 | id | - | coupon_assignments(coupon_id); coupon_usage(coupon_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| currencies | 7 | id | - | branches(currency_id); countries(default_currency); platform_accounts(currency_id); transaction_entries(currency_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| customer_segments | 0 | id | created_by->users.id | marketing_campaigns(segment_id); segment_members(segment_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| dead_letter_entries | 0 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| departments | 0 | id | organisation_id->organisations.id; parent_id->departments.id | departments(parent_id); employees(department_id); positions(department_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| design_theme_reset_baseline | 1 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| design_token_versions | 3 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| design_tokens | 159 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| elo_ratings | 0 | user_id,sport_id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| employees | 0 | id | department_id->departments.id; organisation_id->organisations.id; position_id->positions.id; reports_to->employees.id | employees(reports_to); employment_contracts(employee_id); leave_balances(employee_id); leave_requests(employee_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| employment_contracts | 0 | id | employee_id->employees.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| feature_flags | 23 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| financial_entitlements | 33 | id | branch_id->branches.id; organisation_id->organisations.id; settlement_id->settlements.id | settlement_entitlements(entitlement_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| financial_journal_entries | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| gateway_settlement_transactions | 0 | id | payment_transaction_id->payment_transactions.id; gateway_settlement_id->gateway_settlements.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| gateway_settlements | 0 | id | - | gateway_settlement_transactions(gateway_settlement_id); payment_transactions(gateway_settlement_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| general_ledger | 45890 | id | account_id->chart_of_accounts.id; created_by->users.id; ledger_entry_id->ledger_entries.id; organisation_id->organisations.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| group_invitations | 0 | id | conversation_id->conversations.id; invitee_id->users.id; inviter_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| holidays | 1 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| inventory_logs | 0 | id | created_by->users.id; variant_id->product_variants.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| invitations | 0 | id | match_id->matches.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| invoice_items | 0 | id | invoice_id->invoices.id; tax_rate_id->tax_rates.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| invoices | 0 | id | created_by->users.id; organisation_id->organisations.id; user_id->users.id | invoice_items(invoice_id); membership_subscriptions(invoice_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| join_requests | 0 | id | match_id->matches.id; responder_id->users.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| kpi_snapshots | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| languages | 2 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| leads | 0 | id | assigned_to->users.id; converted_user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| league_divisions | 0 | id | league_id->leagues.id | league_matches(division_id); league_standings(division_id); league_teams(division_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| league_matches | 0 | id | away_team_id->league_teams.id; court_id->resources.id; division_id->league_divisions.id; home_team_id->league_teams.id | league_results(match_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| league_results | 0 | id | entered_by->users.id; match_id->league_matches.id; winner_team_id->league_teams.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| league_standings | 0 | id | division_id->league_divisions.id; team_id->league_teams.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| league_teams | 0 | id | division_id->league_divisions.id | league_matches(away_team_id); league_matches(home_team_id); league_results(winner_team_id); league_standings(team_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| leagues | 0 | id | season_id->seasons.id | league_divisions(league_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| leave_balances | 0 | id | employee_id->employees.id; leave_type_id->leave_types.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| leave_requests | 0 | id | approved_by->users.id; employee_id->employees.id; leave_type_id->leave_types.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| leave_types | 0 | id | organisation_id->organisations.id | leave_balances(leave_type_id); leave_requests(leave_type_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| ledger_entries | 34816 | id | chart_account_id->chart_of_accounts.id; organisation_id->organisations.id; period_id->accounting_periods.id | general_ledger(ledger_entry_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| login_attempts | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| loyalty_campaigns | 0 | id | - | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| loyalty_points | 0 | user_id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| marketing_campaigns | 0 | id | created_by->users.id; segment_id->customer_segments.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| marketplace_complaint_config | 1 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| marketplace_complaints | 0 | id | buyer_id->users.id; order_item_id->order_items.id; order_id->orders.id; product_id->products.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| marketplace_ledger_entries | 0 | id | branch_id->branches.id; order_id->orders.id; organisation_id->organisations.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| match_participants | 96 | id | match_id->matches.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| match_result_participants | 0 | id | match_id->matches.id; result_id->match_result_records.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| match_result_records | 0 | id | accepted_by->users.id; branch_id->branches.id; disputed_by->users.id; format_id->sport_formats.id | match_result_participants(result_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| match_sessions | 0 | id | match_id->matches.id; winner_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| matches | 48 | id | booking_id->bookings.id; format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | invitations(match_id); join_requests(match_id); match_participants(match_id); match_result_participants(match_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| membership_benefits | 0 | id | membership_plan_id->membership_plans.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_history | 0 | id | user_membership_id->user_memberships.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| membership_installments | 0 | id | payment_transaction_id->payment_transactions.id; subscription_id->membership_subscriptions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| membership_plan_branches | 0 | id | branch_id->branches.id; plan_version_id->membership_plan_versions.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_plan_components | 0 | id | plan_version_id->membership_plan_versions.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_plan_installment_templates | 0 | id | plan_version_id->membership_plan_versions.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_plan_versions | 0 | id | created_by->users.id; membership_plan_id->membership_plans.id | membership_plan_branches(plan_version_id); membership_plan_components(plan_version_id); membership_plan_installment_templates(plan_version_id); membership_subscriptions(plan_version_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_plans | 5 | id | - | membership_benefits(membership_plan_id); membership_plan_versions(membership_plan_id); membership_subscriptions(plan_id); user_memberships(membership_plan_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| membership_subscription_components | 0 | id | subscription_id->membership_subscriptions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| membership_subscriptions | 0 | id | created_by->users.id; invoice_id->invoices.id; organisation_id->organisations.id; plan_id->membership_plans.id | membership_installments(subscription_id); membership_subscription_components(subscription_id); membership_subscriptions(renewal_of_subscription_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| memberships | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| messages | 0 | id | conversation_id->conversations.id; sender_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| migration_history | 202 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| notification_ab_results | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_ab_tests | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_actions | 0 | id | - | notifications(action_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_analytics | 3373 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_audit_trail | 10111 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_broadcasts | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_categories | 18 | id | - | notifications(category_id); user_notification_preferences(category_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_cleanup_policies | 7 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_dead_letter_queue | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_delivery | 3370 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_digest_windows | 0 | id | - | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| notification_feature_flags | 7 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_global_settings | 15 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_providers | 6 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_queue | 0 | id | user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_rate_limits | 1042 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_replay_log | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| notification_retry_policies | 3 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| notification_rule_conditions | 5 | id | rule_id->notification_rules.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_rules | 5 | id | - | notification_rule_conditions(rule_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_template_versions | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_templates | 337 | id | - | - | KEEP | notif-config | KEEP | foundational: required to operate after clean test run |
| notification_types | 12 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notification_webhooks | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| notifications | 2571 | id | action_id->notification_actions.id; category_id->notification_categories.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| order_items | 0 | id | order_id->orders.id; seller_id->organisations.id; product_id->products.id | marketplace_complaints(order_item_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| order_status_history | 0 | id | order_id->orders.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| orders | 0 | id | buyer_id->users.id | marketplace_complaints(order_id); marketplace_ledger_entries(order_id); order_items(order_id); order_status_history(order_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| org_announcements | 0 | id | created_by->users.id; organisation_id->organisations.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| organisation_attribute_values | 0 | id | attribute_id->organisation_type_attributes.id; organisation_id->organisations.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| organisation_coa_customizations | 0 | id | account_id->chart_of_accounts.id; organisation_id->organisations.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| organisation_membership_settings | 0 | id | organisation_id->organisations.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| organisation_reviews | 0 | id | organisation_id->organisations.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| organisation_subscriptions | 67 | id | organisation_id->organisations.id; plan_id->subscription_plans.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| organisation_type_attributes | 3 | id | org_type_id->organisation_types.id | organisation_attribute_values(attribute_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| organisation_types | 5 | id | - | organisation_type_attributes(org_type_id); organisation_upgrade_requests(requested_org_type_id); organisations(org_type_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| organisation_upgrade_requests | 67 | id | approved_by->users.id; cancelled_by->users.id; organisation_id->organisations.id; requested_org_type_id->organisation_types.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| organisation_verification_log | 0 | id | created_by->users.id; organisation_id->organisations.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| organisations | 66 | id | country_id->countries.id; owner_id->users.id; org_type_id->organisation_types.id | academies(organisation_id); academy_programs(organisation_id); account_templates(organisation_id); accounting_event_mapping_lines(organisation_id) | KEEP | foundation | KEEP | foundational: required to operate after clean test run |
| outbox_cursors | 14 | subscriber_id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| password_reset_tokens | 0 | id | user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| payment_allocations | 0 | id | booking_id->bookings.id; series_id->booking_series.id; payment_transaction_id->payment_transactions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| payment_gateway_config | 3 | id | payment_method_id->payment_methods.id; organisation_id->organisations.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| payment_methods | 6 | id | - | payment_gateway_config(payment_method_id) | KEEP | config | KEEP | foundational: required to operate after clean test run |
| payment_transactions | 1086 | id | gateway_settlement_id->gateway_settlements.id | academy_enrollment_payments(payment_transaction_id); gateway_settlement_transactions(payment_transaction_id); membership_installments(payment_transaction_id); payment_allocations(payment_transaction_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| payroll_components | 0 | id | organisation_id->organisations.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| payroll_entries | 0 | id | employee_id->employees.id; payroll_run_id->payroll_runs.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| payroll_runs | 0 | id | created_by->users.id; organisation_id->organisations.id; posted_by->users.id | payroll_entries(payroll_run_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| peak_hour_pricing | 0 | id | resource_id->resources.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| permission_modules | 50 | id | - | permissions(module_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| permissions | 965 | id | module_id->permission_modules.id | role_permissions(permission_id) | KEEP | rbac | KEEP | foundational: required to operate after clean test run |
| platform_accounts | 4 | id | currency_id->currencies.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| player_emergency_contacts | 0 | id | user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| player_levels | 5 | id | - | booking_matchmaking_requests(target_level_id); public_match_details(target_level_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| player_match_requests | 0 | id | booking_id->bookings.id; created_by->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| player_profiles | 64 | id | user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| player_rating_history | 0 | id | changed_by->users.id; sport_id->sports.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| player_ratings | 0 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| player_sport_interests | 2 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| player_statistics | 0 | id | season_id->seasons.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| positions | 0 | id | department_id->departments.id; organisation_id->organisations.id | employees(position_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| pricing_rules | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| pricing_seasons | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| processed_commands | 15548 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| processed_events | 544 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| product_categories | 43 | id | parent_id->product_categories.id | product_categories(parent_id); products(category_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| product_images | 120 | id | product_id->products.id; variant_id->product_variants.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| product_reviews | 0 | id | product_id->products.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| product_specifications | 59 | id | product_id->products.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| product_tags | 93 | product_id,tag_id | product_id->products.id; tag_id->tags.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| product_variants | 44 | id | product_id->products.id | inventory_logs(variant_id); product_images(variant_id); purchase_order_items(variant_id); stock_transfers(variant_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| products | 58 | id | brand_id->brands.id; category_id->product_categories.id; seller_id->organisations.id; sport_id->sports.id | cart_items(product_id); marketplace_complaints(product_id); order_items(product_id); product_images(product_id) | KEEP | catalog | KEEP | foundational: required to operate after clean test run |
| professional_profiles | 0 | id | user_id->users.id | professional_services(professional_profile_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| professional_services | 0 | id | professional_profile_id->professional_profiles.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| provinces | 120 | id | country_id->countries.id | cities(province_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| public_match_details | 0 | match_id | creator_id->users.id; target_level_id->player_levels.id; match_id->matches.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| published_events | 2893 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| purchase_order_items | 0 | id | purchase_order_id->purchase_orders.id; variant_id->product_variants.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| purchase_orders | 0 | id | created_by->users.id; organisation_id->organisations.id; supplier_id->suppliers.id; warehouse_id->warehouses.id | purchase_order_items(purchase_order_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| push_log | 0 | id | user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| push_tokens | 0 | id | user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| rating_evidence | 0 | id | sport_id->sports.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| referee_availability | 0 | id | referee_id->referees.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| referee_availability_blackouts | 0 | id | referee_id->referees.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| referees | 0 | id | user_id->users.id | referee_availability(referee_id); referee_availability_blackouts(referee_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| related_products | 2 | product_id,related_product_id,relation_type | product_id->products.id; related_product_id->products.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| resource_attribute_values | 13 | id | attribute_id->resource_type_attributes.id; resource_id->resources.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| resource_maintenance | 0 | id | resource_id->resources.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| resource_peak_hours | 0 | id | resource_id->resources.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| resource_time_slots | 0 | id | resource_id->resources.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| resource_type_attributes | 10 | id | resource_type_id->resource_types.id | resource_attribute_values(attribute_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| resource_types | 10 | id | - | resource_type_attributes(resource_type_id); resources(resource_type_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| resources | 12 | id | branch_id->branches.id; sport_id->sports.id; resource_type_id->resource_types.id | academy_group_sessions(court_id); academy_schedules(preferred_court_id); academy_sessions(resource_id); coach_sessions(resource_id) | KEEP | foundation | KEEP | foundational: required to operate after clean test run |
| reward_catalog | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| reward_claims | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| role_permissions | 13042 | id | permission_id->permissions.id; role_id->roles.id | - | KEEP | rbac | KEEP | foundational: required to operate after clean test run |
| role_theme_overrides | 0 | role_id,token_key | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| roles | 92 | id | organisation_id->organisations.id | role_permissions(role_id); user_roles(role_id) | KEEP | rbac | KEEP | foundational: required to operate after clean test run |
| seasons | 0 | id | - | leagues(season_id); player_statistics(season_id); team_statistics(season_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| segment_members | 0 | id | segment_id->customer_segments.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| segments | 0 | id | - | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| seller_profiles | 0 | id | branch_id->branches.id; organisation_id->organisations.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| seller_shipping_rates | 3 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| settlement_entitlements | 0 | id | entitlement_id->financial_entitlements.id; settlement_id->settlements.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| settlement_orders | 0 | id | order_id->orders.id; settlement_id->settlements.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| settlement_transfers | 0 | id | settlement_id->settlements.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| settlements | 0 | id | branch_id->branches.id; organisation_id->organisations.id | financial_entitlements(settlement_id); settlement_entitlements(settlement_id); settlement_orders(settlement_id); settlement_transfers(settlement_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| sidebar_layout | 11 | id | user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| sport_formats | 43 | id | created_by->users.id; sport_id->sports.id | match_result_records(format_id); matches(format_id); sport_rule_sets(format_id); tournament_competitions(match_format_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| sport_positions | 0 | id | sport_id->sports.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| sport_rule_sets | 5 | id | created_by->users.id; format_id->sport_formats.id | match_result_records(rule_set_id); matches(rule_set_id); tournament_competitions(rule_set_id); tournament_stages(rule_set_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| sports | 57 | id | - | academies(sport_id); academy_programs(sport_id); match_result_records(sport_id); matches(sport_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| staff_attendance | 0 | id | employee_id->employees.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| stock_transfers | 0 | id | created_by->users.id; from_warehouse_id->warehouses.id; to_warehouse_id->warehouses.id; variant_id->product_variants.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| subscription_features | 9 | id | - | subscription_plan_features(feature_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| subscription_plan_features | 54 | id | plan_id->subscription_plans.id; feature_id->subscription_features.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| subscription_plan_rates | 28 | id | plan_id->subscription_plans.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| subscription_plans | 11 | id | - | organisation_subscriptions(plan_id); organisation_upgrade_requests(requested_plan_id); subscription_plan_features(plan_id); subscription_plan_rates(plan_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| suppliers | 0 | id | organisation_id->organisations.id | purchase_orders(supplier_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| support_ticket_messages | 0 | id | ticket_id->support_tickets.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| support_tickets | 0 | id | assigned_to->users.id; organisation_id->organisations.id; user_id->users.id | support_ticket_messages(ticket_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| system_settings | 49 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| tags | 30 | id | - | product_tags(tag_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| tax_rates | 0 | id | organisation_id->organisations.id | bookings(tax_rate_id); invoice_items(tax_rate_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| team_statistics | 0 | id | season_id->seasons.id; team_id->league_teams.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_age_categories | 7 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| tournament_bracket_types | 4 | id | - | tournament_competitions(bracket_type_id); tournaments(bracket_type_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| tournament_competitions | 281 | id | bracket_type_id->tournament_bracket_types.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; sport_id->sports.id | tournament_draws(competition_id); tournament_groups(competition_id); tournament_matches(competition_id); tournament_participants(competition_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_draw_entries | 0 | id | draw_id->tournament_draws.id; moved_by->users.id; participant_id->tournament_participants.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_draws | 0 | id | competition_id->tournament_competitions.id; generated_by->users.id; tournament_id->tournaments.id | tournament_draw_entries(draw_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_group_members | 0 | id | group_id->tournament_groups.id; registration_id->tournament_registrations.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_groups | 0 | id | competition_id->tournament_competitions.id; tournament_id->tournaments.id | tournament_group_members(group_id); tournament_standings(group_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_match_results | 0 | id | entered_by->users.id; match_id->tournament_matches.id; winner_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_match_scores | 0 | id | match_id->tournament_matches.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_matches | 1 | id | player1_id->users.id; player2_id->users.id; resource_id->resources.id; tournament_id->tournaments.id | tournament_match_results(match_id); tournament_match_scores(match_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_participant_members | 0 | id | participant_id->tournament_participants.id; replaced_by_member_id->tournament_participant_members.id; tournament_id->tournaments.id; user_id->users.id | tournament_participant_members(replaced_by_member_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_participants | 0 | id | competition_id->tournament_competitions.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | tournament_draw_entries(participant_id); tournament_matches(loser_participant_id); tournament_matches(participant1_id); tournament_matches(participant2_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_placements | 0 | id | competition_id->tournament_competitions.id; participant_id->tournament_participants.id; tournament_id->tournaments.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_prize_awards | 0 | id | competition_id->tournament_competitions.id; prize_id->tournament_prizes.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_prizes | 0 | id | competition_id->tournament_competitions.id; tournament_id->tournaments.id | tournament_prize_awards(prize_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_registration_refund_requests | 0 | id | registration_id->tournament_registrations.id; requested_by->users.id; reviewed_by->users.id; tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_registrations | 1 | id | competition_id->tournament_competitions.id; player_id->users.id; tournament_id->tournaments.id | tournament_group_members(registration_id); tournament_participants(registration_id); tournament_prize_awards(registration_id); tournament_registration_refund_requests(registration_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_replacement_requests | 0 | id | outgoing_member_user_id->users.id; participant_id->tournament_participants.id; replacement_user_id->users.id; requested_by->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_seeds | 0 | id | assigned_by->users.id; competition_id->tournament_competitions.id; participant_id->tournament_participants.id; tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_sponsors | 0 | id | tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_stages | 0 | id | competition_id->tournament_competitions.id; match_format_id->sport_formats.id; rule_set_id->sport_rule_sets.id; tournament_id->tournaments.id | tournament_matches(stage_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_standings | 0 | id | group_id->tournament_groups.id; registration_id->tournament_registrations.id; tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournament_team_invitations | 0 | id | invitee_user_id->users.id; inviter_user_id->users.id; participant_id->tournament_participants.id; tournament_id->tournaments.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| tournaments | 3 | id | bracket_type_id->tournament_bracket_types.id; branch_id->branches.id; creator_id->users.id; match_format_id->sport_formats.id | matches(tournament_id); tournament_competitions(tournament_id); tournament_draws(tournament_id); tournament_groups(tournament_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| transaction_entries | 1646 | id | branch_id->branches.id; currency_id->currencies.id; organisation_id->organisations.id; transaction_id->transactions.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| transactions | 860 | id | currency_id->currencies.id | transaction_entries(transaction_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| translation_keys | 2364 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| translations | 726 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| uploads | 135 | id | - | cms_contact_submission_attachments(upload_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_addresses | 1 | id | user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_branches | 0 | id | branch_id->branches.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_channel_preferences | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_devices | 0 | id | user_id->users.id | user_sessions(device_id) | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_follows | 0 | id | follower_id->users.id; following_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_friends | 0 | id | addressee_id->users.id; requester_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_memberships | 0 | id | membership_plan_id->membership_plans.id | membership_history(user_membership_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| user_notification_preferences | 0 | id | category_id->notification_categories.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_organisations | 2 | id | organisation_id->organisations.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_quiet_hours | 0 | id | - | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_role_scopes | 66 | id | user_role_id->user_roles.id | - | KEEP | rbac | KEEP | foundational: required to operate after clean test run |
| user_roles | 116 | id | assigned_by->users.id; role_id->roles.id; user_id->users.id | user_role_scopes(user_role_id) | KEEP | rbac | KEEP | foundational: required to operate after clean test run |
| user_sessions | 374 | id | device_id->user_devices.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_sports | 0 | user_id,sport_id | sport_id->sports.id; user_id->users.id | - | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| user_targeted_achievements | 0 | id | achievement_key->achievements.achievement_key; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| user_wallets | 254 | id | - | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| users | 74 | id | country_id->countries.id | academy_enrollments(payment_confirmed_by); academy_enrollments(player_id); academy_evaluations(evaluator_id); academy_evaluations(player_id) | KEEP | identity | KEEP | foundational: required to operate after clean test run |
| waiting_list | 0 | id | match_id->matches.id; user_id->users.id | - | REVIEW | review | REVIEW | ambiguous - human decision required before any change |
| wallet_transactions | 409 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| warehouses | 0 | id | organisation_id->organisations.id | purchase_orders(warehouse_id); stock_transfers(from_warehouse_id); stock_transfers(to_warehouse_id) | KEEP | config/master | KEEP | foundational: required to operate after clean test run |
| web_vitals_metrics | 0 | id | - | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| wishlist_items | 0 | id | product_id->products.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| withdrawal_requests | 0 | id | assigned_to->users.id; branch_financial_details_id->branch_financial_details.id; executed_by->users.id; user_id->users.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| workflow_branch_instances | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| workflow_definitions | 3650 | id | - | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| workflow_event_subscriptions | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| workflow_events | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| workflow_instances | 0 | id | - | workflow_branch_instances(workflow_instance_id); workflow_event_subscriptions(workflow_instance_id); workflow_events(workflow_instance_id); workflow_steps(workflow_instance_id) | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| workflow_steps | 0 | id | workflow_instance_id->workflow_instances.id | - | REVIEW | unclassified | REVIEW | NOT CLASSIFIED - human decision required |
| year_close_cycles | 0 | id | year_closings_id->year_closings.id | - | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |
| year_closings | 0 | id | retained_earnings_account_id->chart_of_accounts.id; created_by->users.id; organisation_id->organisations.id | year_close_cycles(year_closings_id) | CLEAR | transactional | CLEAR | operational/test activity - safe to clear for controlled testing (FK-ordered) |

**Classification totals: KEEP=121 | CLEAR=129 | REVIEW=80 (of 330)**

## Cleanup dependency order (CLEAR tables only - children before parents)

Topological order over the FK graph restricted to CLEAR tables:

| # | Table (delete first) |
|---|---|
| 1 | academy_enrollments |
| 2 | academy_evaluations |
| 3 | academy_group_sessions |
| 4 | academy_sessions |
| 5 | activity_logs |
| 6 | ad_placements |
| 7 | booking_cancellations |
| 8 | booking_invitations |
| 9 | booking_participants |
| 10 | booking_series |
| 11 | booking_slots |
| 12 | bookings |
| 13 | cart_items |
| 14 | client_error_reports |
| 15 | coach_sessions |
| 16 | communication_log |
| 17 | community_event_participants |
| 18 | coupon_assignments |
| 19 | coupon_usage |
| 20 | elo_ratings |
| 21 | financial_journal_entries |
| 22 | gateway_settlements |
| 23 | group_invitations |
| 24 | inventory_logs |
| 25 | invoices |
| 26 | kpi_snapshots |
| 27 | leads |
| 28 | league_divisions |
| 29 | league_teams |
| 30 | ledger_entries |
| 31 | login_attempts |
| 32 | loyalty_points |
| 33 | memberships |
| 34 | notification_ab_results |
| 35 | notification_analytics |
| 36 | notification_audit_trail |
| 37 | notification_broadcasts |
| 38 | notification_dead_letter_queue |
| 39 | notification_delivery |
| 40 | notification_queue |
| 41 | notification_replay_log |
| 42 | notifications |
| 43 | orders |
| 44 | organisation_reviews |
| 45 | password_reset_tokens |
| 46 | payment_transactions |
| 47 | player_match_requests |
| 48 | player_rating_history |
| 49 | player_statistics |
| 50 | product_reviews |
| 51 | purchase_orders |
| 52 | push_log |
| 53 | push_tokens |
| 54 | rating_evidence |
| 55 | reward_claims |
| 56 | settlements |
| 57 | stock_transfers |
| 58 | team_statistics |
| 59 | tournaments |
| 60 | transactions |
| 61 | user_memberships |
| 62 | wallet_transactions |
| 63 | web_vitals_metrics |
| 64 | wishlist_items |
| 65 | withdrawal_requests |
| 66 | year_closings |
| 67 | academy_attendance |
| 68 | academy_enrollment_payments |
| 69 | academy_session_attendance |
| 70 | ad_campaigns |
| 71 | ad_creatives |
| 72 | ad_impressions |
| 73 | booking_matchmaking_requests |
| 74 | booking_players |
| 75 | booking_settlements |
| 76 | coach_reviews |
| 77 | coach_session_events |
| 78 | financial_entitlements |
| 79 | gateway_settlement_transactions |
| 80 | general_ledger |
| 81 | invoice_items |
| 82 | league_matches |
| 83 | league_results |
| 84 | league_standings |
| 85 | marketplace_ledger_entries |
| 86 | matches |
| 87 | membership_history |
| 88 | order_items |
| 89 | order_status_history |
| 90 | payment_allocations |
| 91 | public_match_details |
| 92 | purchase_order_items |
| 93 | settlement_entitlements |
| 94 | settlement_orders |
| 95 | settlement_transfers |
| 96 | tournament_competitions |
| 97 | tournament_draws |
| 98 | tournament_groups |
| 99 | tournament_prizes |
| 100 | tournament_registrations |
| 101 | tournament_sponsors |
| 102 | tournament_stages |
| 103 | tournament_standings |
| 104 | transaction_entries |
| 105 | year_close_cycles |
| 106 | ad_clicks |
| 107 | invitations |
| 108 | join_requests |
| 109 | marketplace_complaints |
| 110 | match_participants |
| 111 | match_result_records |
| 112 | match_sessions |
| 113 | tournament_group_members |
| 114 | tournament_participants |
| 115 | tournament_placements |
| 116 | tournament_prize_awards |
| 117 | tournament_registration_refund_requests |
| 118 | tournament_replacement_requests |
| 119 | tournament_seeds |
| 120 | tournament_team_invitations |
| 121 | match_result_participants |
| 122 | tournament_draw_entries |
| 123 | tournament_matches |
| 124 | tournament_match_results |
| 125 | tournament_match_scores |

Following this order avoids orphan rows and FK violations among CLEAR tables. FKs to KEEP tables are protected by schema (RESTRICT/SET NULL) - nothing outside the CLEAR set is touched. Tables not in the order above remain REVIEW and must not be deleted.


## 7. Foreign key / dependency analysis for CLEAR tables

- Deletion order is children-first (topological over the FK graph within the CLEAR set; see order table above).
- All FKs are schema-defined (514 constraint rows audited); every CLEAR string references either another CLEAR table (handled in order) or a KEEP table protected by RESTRICT/SET NULL/CASCADE semantics.
- SAFE DELETE METHOD: run as a single transaction per phase with `SET FOREIGN_KEY_CHECKS=0` only as a controlled last resort; prefer explicit child-before-parent deletes.
- Orphan risks: none among CLEAR set if order respected; notification_delivery/audit/analytics reference notifications by loose FK - delete notifications first then its children.

## 8. Financial data cleanup (dependency chain)

Order (children first):
1. payment_allocations (references payment_transactions)
2. gateway_settlement_transactions, transaction_entries (reference transactions/be related)
3. invoice_items (reference invoices)
4. wallet_transactions (references user_wallets - REVIEW)
5. invoices, payment_transactions, gateway_settlements
6. ledger_entries, general_ledger, financial_journal_entries (no FK to payments; idempotency uniques)
7. transaction_entries, transactions
8. financial_entitlements, settlement_entitlements, settlement_orders, settlement_transfers, settlements
9. year_close_cycles, year_closings

Rationale: all above rows are derived from bookings/orders/memberships activity that is cleared first; KEEP side (chart_of_accounts, platform_accounts, accounting periods REVIEW) remains untouched so accounting config survives.

## 9. Business data cleanup

- TOURNAMENTS & MATCHES -> CLEAR (tournaments, tournam* 20+ tables, matches*, results, elo/ratings)
- BOOKINGS -> CLEAR (bookings + slots + cancellations + players/participants + settlements + series)
- MARKETPLACE -> CLEAR (orders/items/history/cart/wishlist/complaints/inventory_logs/stock_transfers/ledger pairs) but catalog KEEP (products/variants/images/etc.)
- MEMBERSHIPS (activity) -> CLEAR (memberships, user_memberships, history, subscriptions*, installments); plan/version/component CONFIG -> KEEP
- ACADEMY/COACHING activity -> CLEAR (enrollments, attendance, evaluations, group_sessions, coach_sessions/events/reviews); programs/schedules/availability -> REVIEW
- NOTIFICATIONS/ELEMENTS -> CLEAR (notifications + delivery/audit/analytics/queue/broadcasts/DLQ/push_log); templates/categories/rules/providers -> KEEP
- REVIEW-flagged (explicitly require sign-off): user_sessions, user_devices, uploads, audit_logs, accounting_periods, organisation_subscriptions, seasons, leagues, academy_programs/schedules/groups, coach_org_agreements/availability, conversations/messages, support/crm/hr/bi content, user_wallets

## 10. DO NOT DELETE

- Reference/master config: countries, provinces, cities, currencies, languages, amenities, sports*, player_levels, positions, tournament_bracket_types, tournament_age_categories, resource_types(+attrs), organisation_types(+attrs), banks/bank_branches, cancellation_policies, payment_methods, brands/tags/product_categories, tax_rates
- Platform config: app_settings, system_settings, app_config, feature_flags, payment_gateway_config, notification config family, sidebar_layout, design tokens, configuration_profiles, api_keys, translations/keys, reward_catalog
- RBAC: permissions, permission_modules, roles, role_permissions, user_roles, user_role_scopes
- Accounting config: chart_of_accounts, account_templates(+lines), accounting_event_mapping_lines, platform_accounts, organisation_coa_customizations
- Foundational entities: users, organisations, branches, resources (+ time slots/peak/pricing config), branch_* config, user_addresses/user_sports/preferences, seller_profiles (+ shipping rates), player/professional/coach profiles (base rows), membership plan config, subscription plan config, warehouses, products/variants/images, coupons (config)

Why: without these the platform cannot boot, cannot log in, cannot book, cannot price, cannot collect, cannot post, and cannot operate the CoA.

## 11. Cleanup execution plan (PROPOSED - NOT executed)

PHASE A - Stop write workers (optional): pause/disable cron schedulers (queue-level manual control) or run during maintenance flag so sweeps do not recreate data.
PHASE B - Clear dependent transactional data (bookings, series, orders, tournament/matches, academy/coach activity, memberships activity) in child-first order.
PHASE C - Clear financial activity (payments, allocations, invoices, settlements, entitlements, ledger/general_ledger/journal, transactions) in order of section 8.
PHASE D - Clear business activity (notifications*, reviews, ratings, logs, wallets tx, cart/wishlist/inventory/stocks/coupon usage, marketing/ad/CRM activity).
PHASE E - Validate DB integrity (orphans = 0, FK checks pass, `CHECK TABLE`).
PHASE F - Validate accounting integrity (ledger balances 0 postings; chart_of_accounts intact; entitlements/settlements 0).
PHASE G - Validate application health (backend /health, /health/version, frontend 200, Socket.IO ok, workers idle, Redis reachable).
PHASE H - Prepare TEST_* environment (see section 6) and run controlled smoke tests.

NOT EXECUTED in this task. Requires explicit approval of the KEEP/CLEAR/REVIEW plan first.

## 12. Post-cleanup validation plan

- Table counts: every CLEAR table must be 0; KEEP counts unchanged (baseline snapshot).
- FKs: `SET FOREIGN_KEY_CHECKS=1` + referential integrity query = 0 orphans.
- Accounting: sum ledger_entries = 0, general_ledger = 0, entitlements = 0, settlements = 0, chart_of_accounts unchanged.
- Notifications: notifications/delivery/audit_trail = 0; templates intact.
- Identity: users/roles/permissions/orgs/branches intact (counts match pre-cleanup snapshot).
- Migration: `migration_history` unchanged (202 rows, latest 194).
- Runtime: backend `/health` ok, `/health/version` unchanged, frontend 200, Socket.IO ok, workers idle, Redis reachable, containers healthy.

## 13. Risk report

| Risk | Tables | Impact | Why | Mitigation | Human approval? |
|---|---|---|---|---|---|
| FK violation/orphan if order wrong | all CLEAR | orphan rows / broken relations | dense 514-FK graph | run child-first in one transaction; check order list | YES |
| Money ledger wiped permanently | ledger_entries/general_ledger/payments | no financial history | clear is irreversible | full backup before cleanup + export snapshot | YES (MANDATORY) |
| Soft-delete vs hard-delete semantics | users/orgs/products | hidden rows still present | some tables soft-delete | verify WHERE clauses & keep soft-delete rows except test artifacts | YES |
| Test users embedded in kept data | users/organisations | mixed real/test data | test users exist (e.g. Live E2E Cash Owner) | REVIEW: prune identifiable test users only with full plan | YES |
| ws-backends recreate activity | cron workers | re-create bookings/payments | repeatable jobs still running | stop schedulers in PHASE A | YES |
| XAMPP `courtzon_v2` side-load | separate host DB | confusion | two DBs exist | never connect to 3306 from cleanup script | YES (guard) |

## 14. Final approval table

| TABLE | ROWS | ACTION | REASON (short) | APPROVAL REQUIRED |
|---|---|---|---|---|
| academies | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| academy_attendance | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_categories | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| academy_curriculums | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| academy_enrollment_payments | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_enrollments | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_evaluations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_group_sessions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_groups | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| academy_programs | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| academy_schedules | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| academy_session_attendance | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| academy_sessions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| account_template_lines | 26 | KEEP | KEEP per classification rules (sections 3-10) | No |
| account_templates | 3 | KEEP | KEEP per classification rules (sections 3-10) | No |
| accounting_event_mapping_lines | 512 | KEEP | KEEP per classification rules (sections 3-10) | No |
| accounting_periods | 11 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| achievements | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| activity_logs | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| ad_campaigns | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| ad_clicks | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| ad_creatives | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| ad_impressions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| ad_placements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| amenities | 20 | KEEP | KEEP per classification rules (sections 3-10) | No |
| announcements | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| api_keys | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| app_config | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| app_settings | 12 | KEEP | KEEP per classification rules (sections 3-10) | No |
| app_versions | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| application_settings_history | 524 | KEEP | KEEP per classification rules (sections 3-10) | No |
| audit_logs | 14563 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| bank_accounts | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| bank_branches | 1 | KEEP | KEEP per classification rules (sections 3-10) | No |
| banks | 11 | KEEP | KEEP per classification rules (sections 3-10) | No |
| booking_cancellations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_invitations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_matchmaking_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_participants | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_players | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_series | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_settlements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| booking_slots | 4 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| bookings | 25 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| branch_amenities | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| branch_amenity_assignments | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| branch_financial_details | 1 | KEEP | KEEP per classification rules (sections 3-10) | No |
| branch_holidays | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| branch_player_access | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| branch_staff | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| branches | 60 | KEEP | KEEP per classification rules (sections 3-10) | No |
| brands | 12 | KEEP | KEEP per classification rules (sections 3-10) | No |
| cancellation_policies | 7 | KEEP | KEEP per classification rules (sections 3-10) | No |
| cart_items | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| chart_of_accounts | 141 | KEEP | KEEP per classification rules (sections 3-10) | No |
| cities | 333 | KEEP | KEEP per classification rules (sections 3-10) | No |
| client_error_reports | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| cms_blogs | 3 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_contact_submission_attachments | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_contact_submissions | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_media | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_pages | 10 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_section_blocks | 114 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| cms_sections | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| coach_availability | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| coach_availability_blackouts | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| coach_org_agreements | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| coach_profiles | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| coach_reviews | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| coach_service_locations | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| coach_session_events | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| coach_sessions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| coaches | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| communication_log | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| community_event_participants | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| community_events | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| configuration_profile_settings | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| configuration_profiles | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| conversation_participants | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| conversations | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| countries | 8 | KEEP | KEEP per classification rules (sections 3-10) | No |
| coupon_assignments | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| coupon_usage | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| coupons | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| currencies | 7 | KEEP | KEEP per classification rules (sections 3-10) | No |
| customer_segments | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| dead_letter_entries | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| departments | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| design_theme_reset_baseline | 1 | KEEP | KEEP per classification rules (sections 3-10) | No |
| design_token_versions | 3 | KEEP | KEEP per classification rules (sections 3-10) | No |
| design_tokens | 159 | KEEP | KEEP per classification rules (sections 3-10) | No |
| elo_ratings | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| employees | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| employment_contracts | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| feature_flags | 23 | KEEP | KEEP per classification rules (sections 3-10) | No |
| financial_entitlements | 33 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| financial_journal_entries | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| gateway_settlement_transactions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| gateway_settlements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| general_ledger | 45890 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| group_invitations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| holidays | 1 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| inventory_logs | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| invitations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| invoice_items | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| invoices | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| join_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| kpi_snapshots | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| languages | 2 | KEEP | KEEP per classification rules (sections 3-10) | No |
| leads | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| league_divisions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| league_matches | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| league_results | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| league_standings | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| league_teams | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| leagues | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| leave_balances | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| leave_requests | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| leave_types | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| ledger_entries | 34816 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| login_attempts | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| loyalty_campaigns | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| loyalty_points | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| marketing_campaigns | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| marketplace_complaint_config | 1 | KEEP | KEEP per classification rules (sections 3-10) | No |
| marketplace_complaints | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| marketplace_ledger_entries | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| match_participants | 96 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| match_result_participants | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| match_result_records | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| match_sessions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| matches | 48 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| membership_benefits | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_history | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| membership_installments | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| membership_plan_branches | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_plan_components | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_plan_installment_templates | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_plan_versions | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_plans | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| membership_subscription_components | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| membership_subscriptions | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| memberships | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| messages | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| migration_history | 202 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| notification_ab_results | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_ab_tests | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_actions | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_analytics | 3373 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_audit_trail | 10111 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_broadcasts | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_categories | 18 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_cleanup_policies | 7 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_dead_letter_queue | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_delivery | 3370 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_digest_windows | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| notification_feature_flags | 7 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_global_settings | 15 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_providers | 6 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_queue | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_rate_limits | 1042 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_replay_log | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| notification_retry_policies | 3 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| notification_rule_conditions | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_rules | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_template_versions | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_templates | 337 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_types | 12 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notification_webhooks | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| notifications | 2571 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| order_items | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| order_status_history | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| orders | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| org_announcements | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| organisation_attribute_values | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| organisation_coa_customizations | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| organisation_membership_settings | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| organisation_reviews | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| organisation_subscriptions | 67 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| organisation_type_attributes | 3 | KEEP | KEEP per classification rules (sections 3-10) | No |
| organisation_types | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| organisation_upgrade_requests | 67 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| organisation_verification_log | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| organisations | 66 | KEEP | KEEP per classification rules (sections 3-10) | No |
| outbox_cursors | 14 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| password_reset_tokens | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| payment_allocations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| payment_gateway_config | 3 | KEEP | KEEP per classification rules (sections 3-10) | No |
| payment_methods | 6 | KEEP | KEEP per classification rules (sections 3-10) | No |
| payment_transactions | 1086 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| payroll_components | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| payroll_entries | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| payroll_runs | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| peak_hour_pricing | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| permission_modules | 50 | KEEP | KEEP per classification rules (sections 3-10) | No |
| permissions | 965 | KEEP | KEEP per classification rules (sections 3-10) | No |
| platform_accounts | 4 | KEEP | KEEP per classification rules (sections 3-10) | No |
| player_emergency_contacts | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| player_levels | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| player_match_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| player_profiles | 64 | KEEP | KEEP per classification rules (sections 3-10) | No |
| player_rating_history | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| player_ratings | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| player_sport_interests | 2 | KEEP | KEEP per classification rules (sections 3-10) | No |
| player_statistics | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| positions | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| pricing_rules | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| pricing_seasons | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| processed_commands | 15548 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| processed_events | 544 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| product_categories | 43 | KEEP | KEEP per classification rules (sections 3-10) | No |
| product_images | 120 | KEEP | KEEP per classification rules (sections 3-10) | No |
| product_reviews | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| product_specifications | 59 | KEEP | KEEP per classification rules (sections 3-10) | No |
| product_tags | 93 | KEEP | KEEP per classification rules (sections 3-10) | No |
| product_variants | 44 | KEEP | KEEP per classification rules (sections 3-10) | No |
| products | 58 | KEEP | KEEP per classification rules (sections 3-10) | No |
| professional_profiles | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| professional_services | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| provinces | 120 | KEEP | KEEP per classification rules (sections 3-10) | No |
| public_match_details | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| published_events | 2893 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| purchase_order_items | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| purchase_orders | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| push_log | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| push_tokens | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| rating_evidence | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| referee_availability | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| referee_availability_blackouts | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| referees | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| related_products | 2 | KEEP | KEEP per classification rules (sections 3-10) | No |
| resource_attribute_values | 13 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| resource_maintenance | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| resource_peak_hours | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| resource_time_slots | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| resource_type_attributes | 10 | KEEP | KEEP per classification rules (sections 3-10) | No |
| resource_types | 10 | KEEP | KEEP per classification rules (sections 3-10) | No |
| resources | 12 | KEEP | KEEP per classification rules (sections 3-10) | No |
| reward_catalog | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| reward_claims | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| role_permissions | 13042 | KEEP | KEEP per classification rules (sections 3-10) | No |
| role_theme_overrides | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| roles | 92 | KEEP | KEEP per classification rules (sections 3-10) | No |
| seasons | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| segment_members | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| segments | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| seller_profiles | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| seller_shipping_rates | 3 | KEEP | KEEP per classification rules (sections 3-10) | No |
| settlement_entitlements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| settlement_orders | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| settlement_transfers | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| settlements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| sidebar_layout | 11 | KEEP | KEEP per classification rules (sections 3-10) | No |
| sport_formats | 43 | KEEP | KEEP per classification rules (sections 3-10) | No |
| sport_positions | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| sport_rule_sets | 5 | KEEP | KEEP per classification rules (sections 3-10) | No |
| sports | 57 | KEEP | KEEP per classification rules (sections 3-10) | No |
| staff_attendance | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| stock_transfers | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| subscription_features | 9 | KEEP | KEEP per classification rules (sections 3-10) | No |
| subscription_plan_features | 54 | KEEP | KEEP per classification rules (sections 3-10) | No |
| subscription_plan_rates | 28 | KEEP | KEEP per classification rules (sections 3-10) | No |
| subscription_plans | 11 | KEEP | KEEP per classification rules (sections 3-10) | No |
| suppliers | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| support_ticket_messages | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| support_tickets | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| system_settings | 49 | KEEP | KEEP per classification rules (sections 3-10) | No |
| tags | 30 | KEEP | KEEP per classification rules (sections 3-10) | No |
| tax_rates | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| team_statistics | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_age_categories | 7 | KEEP | KEEP per classification rules (sections 3-10) | No |
| tournament_bracket_types | 4 | KEEP | KEEP per classification rules (sections 3-10) | No |
| tournament_competitions | 281 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_draw_entries | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_draws | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_group_members | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_groups | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_match_results | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_match_scores | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_matches | 1 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_participant_members | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_participants | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_placements | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_prize_awards | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_prizes | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_registration_refund_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_registrations | 1 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_replacement_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_seeds | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_sponsors | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_stages | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_standings | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournament_team_invitations | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| tournaments | 3 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| transaction_entries | 1646 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| transactions | 860 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| translation_keys | 2364 | KEEP | KEEP per classification rules (sections 3-10) | No |
| translations | 726 | KEEP | KEEP per classification rules (sections 3-10) | No |
| uploads | 135 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_addresses | 1 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_branches | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_channel_preferences | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_devices | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_follows | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_friends | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_memberships | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| user_notification_preferences | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_organisations | 2 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_quiet_hours | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_role_scopes | 66 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_roles | 116 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_sessions | 374 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_sports | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| user_targeted_achievements | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| user_wallets | 254 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| users | 74 | KEEP | KEEP per classification rules (sections 3-10) | No |
| waiting_list | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| wallet_transactions | 409 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| warehouses | 0 | KEEP | KEEP per classification rules (sections 3-10) | No |
| web_vitals_metrics | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| wishlist_items | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| withdrawal_requests | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| workflow_branch_instances | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| workflow_definitions | 3650 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| workflow_event_subscriptions | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| workflow_events | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| workflow_instances | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| workflow_steps | 0 | REVIEW | REVIEW per classification rules (sections 3-10) | YES - requires decision |
| year_close_cycles | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |
| year_closings | 0 | CLEAR | CLEAR per classification rules (sections 3-10) | YES - finance/transactional |

## 15. Final status

LIVE AUDIT STATUS: PASS
- Live environment verified (frontend, backend, commit, DB version 8.0.46, migration 194, Redis, Socket.IO, workers, Docker 6/6).
DATABASE CLEANUP STATUS: NOT EXECUTED
- No deletion, truncation, update or insert performed on any table. Read-only audit only.

(Approval required before any phase of section 11 is executed.)
## 6. Test users / test data plan (PROPOSED - NOT created)
Proposed identities (naming convention TEST_*) to be created ONLY after approval and cleanup:

TEST_SUPERADMIN   - platform super admin (sanity/admin flows)
TEST_ORG          - dedicated organisation (TEST_CLUB brand)
TEST_CLUB         - club/branch entity used by all booking tests
TEST_ADMIN        - org-admin of TEST_CLUB (org settings, plans, memberships)
TEST_MANAGER      - branch-mgr (branch-scoped bookings)
TEST_RECEPTIONIST - receptionist (cash confirmations, check-in)
TEST_ACCOUNTANT   - accountant (stats, reports)
TEST_COACH        - coach profile + sessions
TEST_PLAYER       - player (booking, payments, wallet, membership purchase)
TEST_PLAYER2      - second player (matchmaking, conflicts, two-window realtime)
TEST_SELLER       - seller (products, orders, complaints)
TEST_REFEREE      - referee (matches)

Each identity is scoped to TEST_ORG so manual UAT never touches the kept production-like data.
The identities map 1:1 to the test matrix rows in docs/HANDOVER_CURRENT/24_COMPLETE_TEST_MATRIX.md.
NOT created now - requires the same approval gate as the cleanup.
