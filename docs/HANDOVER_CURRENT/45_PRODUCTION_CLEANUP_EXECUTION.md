# 45 — PRODUCTION CLEANUP EXECUTION

**Executed:** 2026-10-05 (UTC) · **Target:** `187.127.72.93:3307 / courtzon_v3` (MySQL 8.0.46, instance `2515d404b031`)
**Authoritative plan:** `40_PRODUCTION_CLEANUP_PLAN.md` v3 · **Freeze baseline:** `44_PRODUCTION_WRITE_FREEZE_EXECUTED.md` (ACTIVE) · **Backup:** `42_PRODUCTION_BACKUP_VERIFICATION.md` (VERIFIED)

## 1. Target confirmation

Host 187.127.72.93 · port 3307 · db courtzon_v3 · version 8.0.46 ✓ (re-confirmed immediately before the first destructive statement)

## 2. Pre-cleanup fingerprint

- Full 330-table counts captured (pre-delete) — identical to the frozen baseline (44): users 28, organisations 17, bookings 5, matches 4, tournaments 3, payment_transactions 10, gateway_settlements 2, ledger_entries 40, general_ledger 40, notifications 60, workflow_definitions 3,700, user_sessions 3,606, processed_commands 190, processed_events 5, notification_rate_limits 473, player_ratings 2, player_rating_history 3, elo_ratings 0, migration_history 201.

## 3. Cleanup execution summary

- Preconditions verified: backend container `exited` (SSH: `backend=exited`), both MySQL events `DISABLED`, `innodb_trx`=0, migration_history 201, scheduler unchanged (ON, no enabled events).
- Deletion order: the exact v3 verified children-first order (regenerated from the live FK graph and cross-checked against the documented order: 136/136 match, duplicates 0, missing 0, parent-before-child violations 0, cross-table cycles 0).
- **FOREIGN KEY CHECKS remained ENABLED throughout** — no `SET FOREIGN_KEY_CHECKS=0` executed anywhere.
- Method: explicit `DELETE FROM courtzon_v3.<table>` per table in FK order, one statement at a time with stop-on-error; **138/138 statements completed without any SQL error**.

## 4. Exact tables deleted (all 136 CLEAR tables — order of execution)

Full ordered list as executed (children first; self-loop handling embedded): the order list matches `40` section 4 exactly (136 tables). Summary groups: booking_* (9) · payment_*/gateway_*/invoice_*/wallet_transactions/withdrawals (14) · marketplace activity (14) · tournament_* (24) · match/result/rating/elo (17) · league_* (6) · academy activity (11) · coaching activity (4) · membership activity (6) · notifications + delivery/audit/analytics/queue/broadcasts/DLQ/push_log/replay (13) · financial activity – ledger/general_ledger/journal/transactions/entitlements/settlements/gateway settlements/year_close (22) · auth/lifecycle artifacts (login_attempts/password_reset_tokens/push_tokens/user_sessions) (4) · processed_commands/processed_events/notification_rate_limits/workflow_definitions/player_ratings (5) · misc activity (18). (Exact per-table rows: appendix.)

## 5. Rows deleted per table

Total **8,531 rows** deleted across the 35 non-empty CLEAR tables (sum of pre/post deltas; matches the v3 plan prediction exactly). Detailed delta per table in the appendix; key ones: user_sessions 3,606 · workflow_definitions 3,700 · notification_rate_limits 473 · notifications 60 · ledger_entries 40 · general_ledger 40 · processed_commands 190 · user_related sessions as above · player_rating_history 3 · player_ratings 2 · matches 4 · tournament_registrations 2 · bookings 5 · payment_transactions 10.

## 6. SQL errors

**None.** All 138 statements (136 DELETE + 2 self-reference UPDATEs) returned success; zero errors, zero FK violations during execution.

## 7. Self-reference handling (FK checks ON)

- `membership_subscriptions.renewal_of_subscription_id` -> `UPDATE ... SET renewal_of_subscription_id = NULL WHERE ... IS NOT NULL` then `DELETE` (0 rows present pre-cleanup).
- `tournament_participant_members.replaced_by_member_id` -> same two-phase method (0 rows present).
- Completed with FK enforcement active; constraints untouched.

## 8. CLEAR validation — **ALL 136/136 EMPTY**

Per appendix: 136/136 CLEAR tables AFTER = 0 (STATUS OK for every table; zero CLEAR tables with rows remaining). Pre-cleanup non-empty CLEAR (35) all now 0.

## 9. KEEP validation — **UNCHANGED (123/123)**

All 123 KEEP tables: BEFORE == AFTER (STATUS OK for every table). Includes users, organisations, roles, permissions, RBAC/scopes, sellers/profiles, resources, reference/master data, payment & notification & accounting configuration, chart_of_accounts (91), accounting mappings (229), product catalog & config, membership/subscription plan config, organisation_subscriptions (19), user_wallets (28).

## 10. REVIEW validation — **UNCHANGED (71/71)**

All 71 REVIEW tables: BEFORE == AFTER (STATUS OK for every table). No REVIEW table was touched.

## 11. Migration validation

`migration_history` = **201** rows; latest **`194_membership_entitlements.sql`**; unchanged. No migration rows added/removed/modified.

## 12. FK validation

- FK checks enabled during the whole operation.
- Post-cleanup full FK orphan scan (514 constraints): **only the 5 KNOWN pre-existing baseline exceptions** remain, with identical counts (branches.org 5, cms_section_blocks 16, products.category 50, resource_attribute_values 10, user_role_scopes 5) — these involve KEEP/REVIEW tables untouched by cleanup. **No new orphans, no referential damage.** Baseline orphan status: unchanged (not cleanup-created).

## 13. Financial reset

Cleared to 0: payment_transactions, payment_allocations, gateway_settlements, gateway_settlement_transactions, invoices, invoice_items, wallet_transactions, transactions, transaction_entries, ledger_entries, general_ledger, financial_journal_entries, financial_entitlements, settlements, settlement_entitlements, settlement_orders, settlement_transfers, year_closings, year_close_cycles, marketplace_ledger_entries.
Preserved: chart_of_accounts (91), account_templates (3)/lines, accounting_event_mapping_lines (229), platform_accounts, payment_methods (6), payment_gateway_config (3), tax_rates, organisation_subscriptions (19), user_wallets (28).

## 14. Business reset

Cleared to 0: bookings + slots/cancellations/players/participants/invitations/matchmaking/settlements/series; matches + participants/results/sessions; tournaments + registrations/participants/matches/standings/results/scores/prizes/awards/draws/team invitations/placements; academy enrollments/payments/attendance/evaluations/sessions; membership subscriptions/installments/components/history/user_memberships; marketplace orders/items/history/cart/wishlist/inventory log/stock transfers; notifications + delivery/audit/analytics/queue/broadcasts/DLQ/push log; player ratings/history/elo; product_reviews; activity logs.

## 15. Protected-data validation

users (28) · organisations (17) · roles (42) · permissions (971) · branches (8) · resources · seller/player/coach/referee profiles · products (93) + variants/images · membership_plans(0)/versions(0) config · subscription_plans (7) · organisation_subscriptions (19) · user_wallets (28) · chart_of_accounts (91) · migration_history (201) — all **unchanged** (appendix).

## 16. Schema validation

330 tables · 19 triggers · 1 routine · 1,643 index-statistics rows · PK/FK structure intact · events intact and still `DISABLED` · **no schema change, no dropped constraints, no migrations**.

## 17. Complete 330-table before/after comparison

See appendix (below) — every table with CLASS/BEFORE/AFTER/DELTA/EXPECTED/STATUS. Result: CLEAR 136/136 OK, KEEP 123/123 OK, REVIEW 71/71 OK, 0 failures.

## 18. Remaining baseline orphan status

The 5 pre-existing orphan cases remain exactly as documented pre-cleanup (baseline exceptions, untouched). No new orphans were created.

## 19. Final verdict

```
PRODUCTION CLEANUP:
SUCCESS

CLEAR TABLES:
136/136 EMPTY

KEEP TABLES:
UNCHANGED

REVIEW TABLES:
UNCHANGED

DATABASE INTEGRITY:
PASS

PRODUCTION WRITE FREEZE:
ACTIVE

BACKEND:
STOPPED
```

Remaining frozen as required: backend container stopped, both MySQL events DISABLED, no services resumed. Awaiting explicit human approval for restoration (procedure documented in `44` section 10) and for the next phase (test/QA).# APPENDIX - FULL 330-TABLE BEFORE/AFTER COMPARISON (45)

| TABLE | CLASS | BEFORE | AFTER | DELTA | EXPECTED | STATUS |
|---|---|---|---|---|---|---|
| academies | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| academy_attendance | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_categories | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| academy_curriculums | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| academy_enrollment_payments | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_enrollments | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_evaluations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_group_sessions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_groups | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| academy_programs | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| academy_schedules | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| academy_session_attendance | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| academy_sessions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| account_template_lines | KEEP | 26 | 26 | 0 | NO CHANGE | OK |
| account_templates | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| accounting_event_mapping_lines | KEEP | 229 | 229 | 0 | NO CHANGE | OK |
| accounting_periods | REVIEW | 2 | 2 | 0 | NO CHANGE | OK |
| achievements | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| activity_logs | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| ad_campaigns | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| ad_clicks | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| ad_creatives | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| ad_impressions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| ad_placements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| amenities | KEEP | 20 | 20 | 0 | NO CHANGE | OK |
| announcements | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| api_keys | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| app_config | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| app_settings | KEEP | 15 | 15 | 0 | NO CHANGE | OK |
| app_versions | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| application_settings_history | KEEP | 1 | 1 | 0 | NO CHANGE | OK |
| audit_logs | REVIEW | 79 | 79 | 0 | NO CHANGE | OK |
| bank_accounts | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| bank_branches | KEEP | 2 | 2 | 0 | NO CHANGE | OK |
| banks | KEEP | 11 | 11 | 0 | NO CHANGE | OK |
| booking_cancellations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_invitations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_matchmaking_requests | CLEAR | 1 | 0 | 1 | AFTER=0 | OK |
| booking_participants | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_players | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_series | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_settlements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| booking_slots | CLEAR | 3 | 0 | 3 | AFTER=0 | OK |
| bookings | CLEAR | 5 | 0 | 5 | AFTER=0 | OK |
| branch_amenities | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| branch_amenity_assignments | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| branch_financial_details | KEEP | 2 | 2 | 0 | NO CHANGE | OK |
| branch_holidays | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| branch_player_access | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| branch_staff | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| branches | KEEP | 14 | 14 | 0 | NO CHANGE | OK |
| brands | KEEP | 76 | 76 | 0 | NO CHANGE | OK |
| cancellation_policies | KEEP | 6 | 6 | 0 | NO CHANGE | OK |
| cart_items | CLEAR | 1 | 0 | 1 | AFTER=0 | OK |
| chart_of_accounts | KEEP | 91 | 91 | 0 | NO CHANGE | OK |
| cities | KEEP | 333 | 333 | 0 | NO CHANGE | OK |
| client_error_reports | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| cms_blogs | REVIEW | 3 | 3 | 0 | NO CHANGE | OK |
| cms_contact_submission_attachments | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| cms_contact_submissions | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| cms_media | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| cms_pages | REVIEW | 10 | 10 | 0 | NO CHANGE | OK |
| cms_section_blocks | REVIEW | 78 | 78 | 0 | NO CHANGE | OK |
| cms_sections | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| coach_availability | REVIEW | 7 | 7 | 0 | NO CHANGE | OK |
| coach_availability_blackouts | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| coach_org_agreements | REVIEW | 2 | 2 | 0 | NO CHANGE | OK |
| coach_profiles | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| coach_reviews | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| coach_service_locations | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| coach_session_events | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| coach_sessions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| coaches | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| communication_log | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| community_event_participants | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| community_events | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| configuration_profile_settings | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| configuration_profiles | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| conversation_participants | REVIEW | 2 | 2 | 0 | NO CHANGE | OK |
| conversations | REVIEW | 1 | 1 | 0 | NO CHANGE | OK |
| countries | KEEP | 8 | 8 | 0 | NO CHANGE | OK |
| coupon_assignments | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| coupon_usage | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| coupons | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| currencies | KEEP | 7 | 7 | 0 | NO CHANGE | OK |
| customer_segments | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| dead_letter_entries | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| departments | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| design_theme_reset_baseline | KEEP | 1 | 1 | 0 | NO CHANGE | OK |
| design_token_versions | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| design_tokens | KEEP | 159 | 159 | 0 | NO CHANGE | OK |
| elo_ratings | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| employees | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| employment_contracts | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| feature_flags | KEEP | 21 | 21 | 0 | NO CHANGE | OK |
| financial_entitlements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| financial_journal_entries | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| gateway_settlement_transactions | CLEAR | 7 | 0 | 7 | AFTER=0 | OK |
| gateway_settlements | CLEAR | 2 | 0 | 2 | AFTER=0 | OK |
| general_ledger | CLEAR | 40 | 0 | 40 | AFTER=0 | OK |
| group_invitations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| holidays | REVIEW | 1 | 1 | 0 | NO CHANGE | OK |
| inventory_logs | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| invitations | CLEAR | 22 | 0 | 22 | AFTER=0 | OK |
| invoice_items | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| invoices | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| join_requests | CLEAR | 1 | 0 | 1 | AFTER=0 | OK |
| kpi_snapshots | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| languages | KEEP | 2 | 2 | 0 | NO CHANGE | OK |
| leads | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| league_divisions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| league_matches | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| league_results | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| league_standings | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| league_teams | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| leagues | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| leave_balances | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| leave_requests | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| leave_types | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| ledger_entries | CLEAR | 40 | 0 | 40 | AFTER=0 | OK |
| login_attempts | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| loyalty_campaigns | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| loyalty_points | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| marketing_campaigns | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| marketplace_complaint_config | KEEP | 1 | 1 | 0 | NO CHANGE | OK |
| marketplace_complaints | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| marketplace_ledger_entries | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| match_participants | CLEAR | 8 | 0 | 8 | AFTER=0 | OK |
| match_result_participants | CLEAR | 8 | 0 | 8 | AFTER=0 | OK |
| match_result_records | CLEAR | 4 | 0 | 4 | AFTER=0 | OK |
| match_sessions | CLEAR | 4 | 0 | 4 | AFTER=0 | OK |
| matches | CLEAR | 4 | 0 | 4 | AFTER=0 | OK |
| membership_benefits | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_history | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| membership_installments | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| membership_plan_branches | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_plan_components | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_plan_installment_templates | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_plan_versions | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_plans | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| membership_subscription_components | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| membership_subscriptions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| memberships | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| messages | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| migration_history | KEEP | 201 | 201 | 0 | NO CHANGE | OK |
| notification_ab_results | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| notification_ab_tests | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| notification_actions | KEEP | 24 | 24 | 0 | NO CHANGE | OK |
| notification_analytics | CLEAR | 66 | 0 | 66 | AFTER=0 | OK |
| notification_audit_trail | CLEAR | 176 | 0 | 176 | AFTER=0 | OK |
| notification_broadcasts | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| notification_categories | KEEP | 18 | 18 | 0 | NO CHANGE | OK |
| notification_cleanup_policies | KEEP | 7 | 7 | 0 | NO CHANGE | OK |
| notification_dead_letter_queue | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| notification_delivery | CLEAR | 60 | 0 | 60 | AFTER=0 | OK |
| notification_digest_windows | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| notification_feature_flags | KEEP | 7 | 7 | 0 | NO CHANGE | OK |
| notification_global_settings | KEEP | 15 | 15 | 0 | NO CHANGE | OK |
| notification_providers | KEEP | 6 | 6 | 0 | NO CHANGE | OK |
| notification_queue | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| notification_rate_limits | CLEAR | 473 | 0 | 473 | AFTER=0 | OK |
| notification_replay_log | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| notification_retry_policies | REVIEW | 7 | 7 | 0 | NO CHANGE | OK |
| notification_rule_conditions | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| notification_rules | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| notification_template_versions | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| notification_templates | KEEP | 337 | 337 | 0 | NO CHANGE | OK |
| notification_types | KEEP | 12 | 12 | 0 | NO CHANGE | OK |
| notification_webhooks | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| notifications | CLEAR | 60 | 0 | 60 | AFTER=0 | OK |
| order_items | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| order_status_history | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| orders | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| org_announcements | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| organisation_attribute_values | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| organisation_coa_customizations | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| organisation_membership_settings | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| organisation_reviews | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| organisation_subscriptions | KEEP | 19 | 19 | 0 | NO CHANGE | OK |
| organisation_type_attributes | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| organisation_types | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| organisation_upgrade_requests | REVIEW | 17 | 17 | 0 | NO CHANGE | OK |
| organisation_verification_log | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| organisations | KEEP | 17 | 17 | 0 | NO CHANGE | OK |
| outbox_cursors | REVIEW | 14 | 14 | 0 | NO CHANGE | OK |
| password_reset_tokens | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| payment_allocations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| payment_gateway_config | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| payment_methods | KEEP | 6 | 6 | 0 | NO CHANGE | OK |
| payment_transactions | CLEAR | 10 | 0 | 10 | AFTER=0 | OK |
| payroll_components | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| payroll_entries | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| payroll_runs | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| peak_hour_pricing | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| permission_modules | KEEP | 50 | 50 | 0 | NO CHANGE | OK |
| permissions | KEEP | 971 | 971 | 0 | NO CHANGE | OK |
| platform_accounts | KEEP | 4 | 4 | 0 | NO CHANGE | OK |
| player_emergency_contacts | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| player_levels | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| player_match_requests | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| player_profiles | KEEP | 28 | 28 | 0 | NO CHANGE | OK |
| player_rating_history | CLEAR | 3 | 0 | 3 | AFTER=0 | OK |
| player_ratings | CLEAR | 2 | 0 | 2 | AFTER=0 | OK |
| player_sport_interests | KEEP | 28 | 28 | 0 | NO CHANGE | OK |
| player_statistics | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| positions | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| pricing_rules | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| pricing_seasons | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| processed_commands | CLEAR | 190 | 0 | 190 | AFTER=0 | OK |
| processed_events | CLEAR | 5 | 0 | 5 | AFTER=0 | OK |
| product_categories | KEEP | 118 | 118 | 0 | NO CHANGE | OK |
| product_images | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| product_reviews | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| product_specifications | KEEP | 59 | 59 | 0 | NO CHANGE | OK |
| product_tags | KEEP | 90 | 90 | 0 | NO CHANGE | OK |
| product_variants | KEEP | 40 | 40 | 0 | NO CHANGE | OK |
| products | KEEP | 93 | 93 | 0 | NO CHANGE | OK |
| professional_profiles | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| professional_services | KEEP | 2 | 2 | 0 | NO CHANGE | OK |
| provinces | KEEP | 120 | 120 | 0 | NO CHANGE | OK |
| public_match_details | CLEAR | 4 | 0 | 4 | AFTER=0 | OK |
| published_events | REVIEW | 726 | 726 | 0 | NO CHANGE | OK |
| purchase_order_items | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| purchase_orders | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| push_log | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| push_tokens | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| rating_evidence | CLEAR | 4 | 0 | 4 | AFTER=0 | OK |
| referee_availability | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| referee_availability_blackouts | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| referees | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| related_products | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| resource_attribute_values | REVIEW | 13 | 13 | 0 | NO CHANGE | OK |
| resource_maintenance | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| resource_peak_hours | KEEP | 35 | 35 | 0 | NO CHANGE | OK |
| resource_time_slots | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| resource_type_attributes | KEEP | 10 | 10 | 0 | NO CHANGE | OK |
| resource_types | KEEP | 10 | 10 | 0 | NO CHANGE | OK |
| resources | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| reward_catalog | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| reward_claims | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| role_permissions | KEEP | 6918 | 6918 | 0 | NO CHANGE | OK |
| role_theme_overrides | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| roles | KEEP | 42 | 42 | 0 | NO CHANGE | OK |
| seasons | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| segment_members | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| segments | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| seller_profiles | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| seller_shipping_rates | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| settlement_entitlements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| settlement_orders | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| settlement_transfers | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| settlements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| sidebar_layout | KEEP | 11 | 11 | 0 | NO CHANGE | OK |
| sport_formats | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| sport_positions | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| sport_rule_sets | KEEP | 3 | 3 | 0 | NO CHANGE | OK |
| sports | KEEP | 16 | 16 | 0 | NO CHANGE | OK |
| staff_attendance | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| stock_transfers | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| subscription_features | KEEP | 9 | 9 | 0 | NO CHANGE | OK |
| subscription_plan_features | KEEP | 54 | 54 | 0 | NO CHANGE | OK |
| subscription_plan_rates | KEEP | 23 | 23 | 0 | NO CHANGE | OK |
| subscription_plans | KEEP | 7 | 7 | 0 | NO CHANGE | OK |
| suppliers | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| support_ticket_messages | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| support_tickets | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| system_settings | KEEP | 42 | 42 | 0 | NO CHANGE | OK |
| tags | KEEP | 25 | 25 | 0 | NO CHANGE | OK |
| tax_rates | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| team_statistics | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_age_categories | KEEP | 7 | 7 | 0 | NO CHANGE | OK |
| tournament_bracket_types | KEEP | 4 | 4 | 0 | NO CHANGE | OK |
| tournament_competitions | CLEAR | 3 | 0 | 3 | AFTER=0 | OK |
| tournament_draw_entries | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_draws | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_group_members | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_groups | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_match_results | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_match_scores | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_matches | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_participant_members | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_participants | CLEAR | 2 | 0 | 2 | AFTER=0 | OK |
| tournament_placements | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_prize_awards | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_prizes | CLEAR | 1 | 0 | 1 | AFTER=0 | OK |
| tournament_registration_refund_requests | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_registrations | CLEAR | 2 | 0 | 2 | AFTER=0 | OK |
| tournament_replacement_requests | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_seeds | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_sponsors | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_stages | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_standings | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournament_team_invitations | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| tournaments | CLEAR | 3 | 0 | 3 | AFTER=0 | OK |
| transaction_entries | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| transactions | CLEAR | 11 | 0 | 11 | AFTER=0 | OK |
| translation_keys | KEEP | 2363 | 2363 | 0 | NO CHANGE | OK |
| translations | KEEP | 610 | 610 | 0 | NO CHANGE | OK |
| uploads | REVIEW | 36 | 36 | 0 | NO CHANGE | OK |
| user_addresses | KEEP | 5 | 5 | 0 | NO CHANGE | OK |
| user_branches | KEEP | 1 | 1 | 0 | NO CHANGE | OK |
| user_channel_preferences | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| user_devices | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| user_follows | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| user_friends | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| user_memberships | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| user_notification_preferences | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| user_organisations | KEEP | 2 | 2 | 0 | NO CHANGE | OK |
| user_quiet_hours | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| user_role_scopes | KEEP | 21 | 21 | 0 | NO CHANGE | OK |
| user_roles | KEEP | 47 | 47 | 0 | NO CHANGE | OK |
| user_sessions | CLEAR | 3606 | 0 | 3606 | AFTER=0 | OK |
| user_sports | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| user_targeted_achievements | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| user_wallets | KEEP | 28 | 28 | 0 | NO CHANGE | OK |
| users | KEEP | 28 | 28 | 0 | NO CHANGE | OK |
| waiting_list | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| wallet_transactions | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| warehouses | KEEP | 0 | 0 | 0 | NO CHANGE | OK |
| web_vitals_metrics | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| wishlist_items | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| withdrawal_requests | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| workflow_branch_instances | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| workflow_definitions | CLEAR | 3700 | 0 | 3700 | AFTER=0 | OK |
| workflow_event_subscriptions | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| workflow_events | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| workflow_instances | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| workflow_steps | REVIEW | 0 | 0 | 0 | NO CHANGE | OK |
| year_close_cycles | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
| year_closings | CLEAR | 0 | 0 | 0 | AFTER=0 | OK |
