# 44 — PRODUCTION WRITE FREEZE — EXECUTED

**Executed:** 2026-10-05 00:00–00:10 UTC (approx) · **Target:** `187.127.72.93:3307 / courtzon_v3`
**Scope:** write-freeze ONLY (temporary operational controls). Cleanup NOT executed. No application data modified.

---

## 1. Target confirmation

| Item | Value |
|---|---|
| Host / Port | 187.127.72.93:3307 (public) |
| Database | courtzon_v3 |
| MySQL version | 8.0.46 |
| DB instance | container hostname `2515d404b031` (= prod `mysql-k10fyzmeoemrg9agnrr90zfk-163630454202`) |
| migration_history | 201 rows; latest `194_membership_entitlements.sql` |
| Oracle control | Production is Coolify-managed on host `srv1776860` (SSH via deployment key) |

## 2. Backend container state (the primary application writer)

| Item | Before | After |
|---|---|---|
| Container | `backend-k10fyzmeoemrg9agnrr90zfk-163630480486` (Coolify; = production "courtzon-backend") | same |
| Status | running (started 2026-10-04T16:38:58Z) | **exited** (stopped 2026-10-04T21:00:30Z) |
| Restart policy | unless-stopped (respects explicit stop) | remains stopped |
| Effect | API + 30 BullMQ workers + cron repeatables + outbox poller + durable entitlement/accounting subscribers + Socket.IO + webhook listener all in-process | **all application writers stopped** |

Verified by `docker inspect` over SSH (read-only check of state).

## 3. MySQL scheduled events — autonomous DB writers

| Event | Before | After | Recovery |
|---|---|---|---|
| `ev_cleanup_expired_sessions` (RECURRING 1 DAY) | ENABLED | **DISABLED** (temporary) | `ALTER EVENT ... ENABLE` |
| `ev_process_notification_queue` (RECURRING 1 MINUTE) | ENABLED | **DISABLED** (temporary) | `ALTER EVENT ... ENABLE` |

Original state recorded and fully recoverable; definitions untouched (only scheduling disabled).

## 4. Event scheduler state

| Item | Before | After |
|---|---|---|
| `@@event_scheduler` | ON | **ON** (unchanged) — minimal-change approach; with both events DISABLED there are zero autonomous scheduled DML writers |

## 5. Worker state

- All application-side workers/cron run inside the stopped backend container -> **stopped**.
- MySQL autonomous writers -> **disabled** (section 3).
- `p_uat_cleanup` stored procedure -> **NOT invoked** (legacy manual tool; excluded by design).
- Triggers (19): confirmed none hook DELETE -> inert for the planned hard-delete cleanup; application INSERT/UPDATE trigger paths cannot run while backend is stopped.

## 6. Queue state (Redis — prod `redis-k10fyzmeoemrg9agnrr90zfk-163630467697`)

| Item | Before | After |
|---|---|---|
| DBSIZE | 462 | 446 (transient key expiry only; not production data) |
| `bull:*:wait` lists | empty | empty (no waiting jobs; no workers to consume/resume) |

## 7. Active transaction state (read-only)

| Check | Value |
|---|---|
| `information_schema.processlist` | only `event_scheduler` daemon + monitor client (all application pooled connections gone) |
| `information_schema.innodb_trx` | **0** |
| `innodb_lock_waits` | 0 (performance_schema source; information_schema view absent in this 8.0.46 build) |
| ACTIVE WRITE TRANSACTIONS | **0** |

## 8. Five-minute quiescence evidence

- Monitoring window 00:01:08 – 00:06:18 UTC: 6 snapshots taken 60s apart over 26 target tables
  (bookings, matches, match_participants, tournaments, tournament_registrations/participants/matches/standings,
  payment_transactions, orders, order_items, notifications, notification_delivery, ledger_entries, general_ledger,
  user_sessions, processed_commands, processed_events, notification_rate_limits, workflow_definitions,
  player_ratings, player_rating_history, elo_ratings, wallet_transactions, financial_entitlements)
  plus innodb_trx count and both event statuses.
- Confirmed identical row values across the window (final proof: exact A==B match of all 29 monitored values 60 s apart at 00:06:47 vs 00:07:49).
- Backend re-verified `exited`, events re-verified DISABLED during the window.

## 9. Final database fingerprint (immediately before any cleanup)

- Full 330-table count snapshot captured (see appendix at the end of this file) — **identical to the pre-freeze baseline** recorded in `42_PRODUCTION_BACKUP_VERIFICATION.md` (users 28, organisations 17, organisation_subscriptions 19, user_wallets 28, bookings 5, matches 4, tournaments 3, payment_transactions 10, gateway_settlements 2, ledger_entries 40, general_ledger 40, transactions 11, notifications 60, workflow_definitions 3,700, user_sessions 3,606, processed_commands 190, processed_events 5, notification_rate_limits 473, player_ratings 2, player_rating_history 3, elo_ratings 0, migration_history 201).
- migration_history: 201 (unchanged). Active transactions: 0. MySQL events: both DISABLED. Backend container: exited.

## 10. Restoration procedure (documented — NOT executed)

1. Restore MySQL event states: `ALTER EVENT courtzon_v3.ev_cleanup_expired_sessions ENABLE; ALTER EVENT courtzon_v3.ev_process_notification_queue ENABLE;` (`event_scheduler` was never changed; remains ON).
2. Start the backend container: `docker start backend-k10fyzmeoemrg9agnrr90zfk-163630480486` (SSH on origin host).
3. Verify workers restart: backend logs (`membership_*`, `payment-cron`, digest scheduling lines; expected scheduled-repeat registration).
4. Verify queues resume: `bull:*` wait lists remain low; no backlog.
5. Verify app health: `GET /health`, `/health/version` (expectedMigration 194), `/health/redis`.
6. Verify Socket.IO: `/health/socket` ok.
7. Verify scheduled jobs registered (BullMQ repeatables) and 5-minute observation of CLEAR tables for expected post-resume behavior.

## 11. Warnings / errors

- The `frontend-k10fyzmeoemrg9agnrr90zfk-163630496581` container remains up; user requests to the API will now fail (5xx) until resume — expected during a write-freeze; no data impact.
- Redis DBSIZE decreased 462 -> 446 (ephemeral keys only).
- `information_schema.innodb_lock_waits` not present on this MySQL build; locks verified via zero active transactions and zero lock waits reported by the engine path.
- No credentials/secrets exposed in this report.

---

```
PRODUCTION WRITE FREEZE:
ACTIVE

ACTIVE WRITE TRANSACTIONS:
0

CLEANUP EXECUTED:
NO

PRODUCTION DATA MODIFIED BY CLEANUP:
NO
```

Production is write-quiescent and frozen. **Do not start cleanup** — awaits your explicit separate go-ahead. Restoration can be performed per section 10.
## Appendix — FULL 330-TABLE FINGERPRINT (pre-cleanup, frozen state)

| TABLE | ROWS |
|---|---|
| academies | 0 |
| academy_attendance | 0 |
| academy_categories | 0 |
| academy_curriculums | 0 |
| academy_enrollment_payments | 0 |
| academy_enrollments | 0 |
| academy_evaluations | 0 |
| academy_group_sessions | 0 |
| academy_groups | 0 |
| academy_programs | 0 |
| academy_schedules | 0 |
| academy_session_attendance | 0 |
| academy_sessions | 0 |
| account_template_lines | 26 |
| account_templates | 3 |
| accounting_event_mapping_lines | 229 |
| accounting_periods | 2 |
| achievements | 0 |
| activity_logs | 0 |
| ad_campaigns | 0 |
| ad_clicks | 0 |
| ad_creatives | 0 |
| ad_impressions | 0 |
| ad_placements | 0 |
| amenities | 20 |
| announcements | 0 |
| api_keys | 0 |
| app_config | 0 |
| app_settings | 15 |
| app_versions | 0 |
| application_settings_history | 1 |
| audit_logs | 79 |
| bank_accounts | 0 |
| bank_branches | 2 |
| banks | 11 |
| booking_cancellations | 0 |
| booking_invitations | 0 |
| booking_matchmaking_requests | 1 |
| booking_participants | 0 |
| booking_players | 0 |
| booking_series | 0 |
| booking_settlements | 0 |
| booking_slots | 3 |
| bookings | 5 |
| branch_amenities | 0 |
| branch_amenity_assignments | 5 |
| branch_financial_details | 2 |
| branch_holidays | 0 |
| branch_player_access | 0 |
| branch_staff | 0 |
| branches | 14 |
| brands | 76 |
| cancellation_policies | 6 |
| cart_items | 1 |
| chart_of_accounts | 91 |
| cities | 333 |
| client_error_reports | 0 |
| cms_blogs | 3 |
| cms_contact_submission_attachments | 0 |
| cms_contact_submissions | 0 |
| cms_media | 0 |
| cms_pages | 10 |
| cms_section_blocks | 78 |
| cms_sections | 0 |
| coach_availability | 7 |
| coach_availability_blackouts | 0 |
| coach_org_agreements | 2 |
| coach_profiles | 3 |
| coach_reviews | 0 |
| coach_service_locations | 0 |
| coach_session_events | 0 |
| coach_sessions | 0 |
| coaches | 0 |
| communication_log | 0 |
| community_event_participants | 0 |
| community_events | 0 |
| configuration_profile_settings | 0 |
| configuration_profiles | 0 |
| conversation_participants | 2 |
| conversations | 1 |
| countries | 8 |
| coupon_assignments | 0 |
| coupon_usage | 0 |
| coupons | 0 |
| currencies | 7 |
| customer_segments | 0 |
| dead_letter_entries | 0 |
| departments | 0 |
| design_theme_reset_baseline | 1 |
| design_token_versions | 3 |
| design_tokens | 159 |
| elo_ratings | 0 |
| employees | 0 |
| employment_contracts | 0 |
| feature_flags | 21 |
| financial_entitlements | 0 |
| financial_journal_entries | 0 |
| gateway_settlement_transactions | 7 |
| gateway_settlements | 2 |
| general_ledger | 40 |
| group_invitations | 0 |
| holidays | 1 |
| inventory_logs | 0 |
| invitations | 22 |
| invoice_items | 0 |
| invoices | 0 |
| join_requests | 1 |
| kpi_snapshots | 0 |
| languages | 2 |
| leads | 0 |
| league_divisions | 0 |
| league_matches | 0 |
| league_results | 0 |
| league_standings | 0 |
| league_teams | 0 |
| leagues | 0 |
| leave_balances | 0 |
| leave_requests | 0 |
| leave_types | 0 |
| ledger_entries | 40 |
| login_attempts | 0 |
| loyalty_campaigns | 0 |
| loyalty_points | 0 |
| marketing_campaigns | 0 |
| marketplace_complaint_config | 1 |
| marketplace_complaints | 0 |
| marketplace_ledger_entries | 0 |
| match_participants | 8 |
| match_result_participants | 8 |
| match_result_records | 4 |
| match_sessions | 4 |
| matches | 4 |
| membership_benefits | 0 |
| membership_history | 0 |
| membership_installments | 0 |
| membership_plan_branches | 0 |
| membership_plan_components | 0 |
| membership_plan_installment_templates | 0 |
| membership_plan_versions | 0 |
| membership_plans | 0 |
| membership_subscription_components | 0 |
| membership_subscriptions | 0 |
| memberships | 0 |
| messages | 0 |
| migration_history | 201 |
| notification_ab_results | 0 |
| notification_ab_tests | 0 |
| notification_actions | 24 |
| notification_analytics | 66 |
| notification_audit_trail | 176 |
| notification_broadcasts | 0 |
| notification_categories | 18 |
| notification_cleanup_policies | 7 |
| notification_dead_letter_queue | 0 |
| notification_delivery | 60 |
| notification_digest_windows | 0 |
| notification_feature_flags | 7 |
| notification_global_settings | 15 |
| notification_providers | 6 |
| notification_queue | 0 |
| notification_rate_limits | 473 |
| notification_replay_log | 0 |
| notification_retry_policies | 7 |
| notification_rule_conditions | 5 |
| notification_rules | 5 |
| notification_template_versions | 0 |
| notification_templates | 337 |
| notification_types | 12 |
| notification_webhooks | 0 |
| notifications | 60 |
| order_items | 0 |
| order_status_history | 0 |
| orders | 0 |
| org_announcements | 0 |
| organisation_attribute_values | 0 |
| organisation_coa_customizations | 0 |
| organisation_membership_settings | 0 |
| organisation_reviews | 0 |
| organisation_subscriptions | 19 |
| organisation_type_attributes | 3 |
| organisation_types | 5 |
| organisation_upgrade_requests | 17 |
| organisation_verification_log | 0 |
| organisations | 17 |
| outbox_cursors | 14 |
| password_reset_tokens | 0 |
| payment_allocations | 0 |
| payment_gateway_config | 3 |
| payment_methods | 6 |
| payment_transactions | 10 |
| payroll_components | 0 |
| payroll_entries | 0 |
| payroll_runs | 0 |
| peak_hour_pricing | 0 |
| permission_modules | 50 |
| permissions | 971 |
| platform_accounts | 4 |
| player_emergency_contacts | 0 |
| player_levels | 5 |
| player_match_requests | 0 |
| player_profiles | 28 |
| player_rating_history | 3 |
| player_ratings | 2 |
| player_sport_interests | 28 |
| player_statistics | 0 |
| positions | 0 |
| pricing_rules | 0 |
| pricing_seasons | 0 |
| processed_commands | 190 |
| processed_events | 5 |
| product_categories | 118 |
| product_images | 0 |
| product_reviews | 0 |
| product_specifications | 59 |
| product_tags | 90 |
| product_variants | 40 |
| products | 93 |
| professional_profiles | 3 |
| professional_services | 2 |
| provinces | 120 |
| public_match_details | 4 |
| published_events | 726 |
| purchase_order_items | 0 |
| purchase_orders | 0 |
| push_log | 0 |
| push_tokens | 0 |
| rating_evidence | 4 |
| referee_availability | 0 |
| referee_availability_blackouts | 0 |
| referees | 0 |
| related_products | 0 |
| resource_attribute_values | 13 |
| resource_maintenance | 0 |
| resource_peak_hours | 35 |
| resource_time_slots | 0 |
| resource_type_attributes | 10 |
| resource_types | 10 |
| resources | 5 |
| reward_catalog | 0 |
| reward_claims | 0 |
| role_permissions | 6918 |
| role_theme_overrides | 0 |
| roles | 42 |
| seasons | 0 |
| segment_members | 0 |
| segments | 0 |
| seller_profiles | 0 |
| seller_shipping_rates | 5 |
| settlement_entitlements | 0 |
| settlement_orders | 0 |
| settlement_transfers | 0 |
| settlements | 0 |
| sidebar_layout | 11 |
| sport_formats | 3 |
| sport_positions | 0 |
| sport_rule_sets | 3 |
| sports | 16 |
| staff_attendance | 0 |
| stock_transfers | 0 |
| subscription_features | 9 |
| subscription_plan_features | 54 |
| subscription_plan_rates | 23 |
| subscription_plans | 7 |
| suppliers | 0 |
| support_ticket_messages | 0 |
| support_tickets | 0 |
| system_settings | 42 |
| tags | 25 |
| tax_rates | 0 |
| team_statistics | 0 |
| tournament_age_categories | 7 |
| tournament_bracket_types | 4 |
| tournament_competitions | 3 |
| tournament_draw_entries | 0 |
| tournament_draws | 0 |
| tournament_group_members | 0 |
| tournament_groups | 0 |
| tournament_match_results | 0 |
| tournament_match_scores | 0 |
| tournament_matches | 0 |
| tournament_participant_members | 0 |
| tournament_participants | 2 |
| tournament_placements | 0 |
| tournament_prize_awards | 0 |
| tournament_prizes | 1 |
| tournament_registration_refund_requests | 0 |
| tournament_registrations | 2 |
| tournament_replacement_requests | 0 |
| tournament_seeds | 0 |
| tournament_sponsors | 0 |
| tournament_stages | 0 |
| tournament_standings | 0 |
| tournament_team_invitations | 0 |
| tournaments | 3 |
| transaction_entries | 0 |
| transactions | 11 |
| translation_keys | 2363 |
| translations | 610 |
| uploads | 36 |
| user_addresses | 5 |
| user_branches | 1 |
| user_channel_preferences | 0 |
| user_devices | 0 |
| user_follows | 0 |
| user_friends | 0 |
| user_memberships | 0 |
| user_notification_preferences | 0 |
| user_organisations | 2 |
| user_quiet_hours | 0 |
| user_role_scopes | 21 |
| user_roles | 47 |
| user_sessions | 3606 |
| user_sports | 0 |
| user_targeted_achievements | 0 |
| user_wallets | 28 |
| users | 28 |
| waiting_list | 0 |
| wallet_transactions | 0 |
| warehouses | 0 |
| web_vitals_metrics | 0 |
| wishlist_items | 0 |
| withdrawal_requests | 0 |
| workflow_branch_instances | 0 |
| workflow_definitions | 3700 |
| workflow_event_subscriptions | 0 |
| workflow_events | 0 |
| workflow_instances | 0 |
| workflow_steps | 0 |
| year_close_cycles | 0 |
| year_closings | 0 |
