# Database Knowledge Base — Repair Report

> **Generated:** 2026-07-28
> **Canonical Source:** `database-manifest.md` (279 unique tables, 275 active)
> **Document Under Repair:** `enterprise-database-knowledge-base.md`

---

## Part 1 — Inventory Count Corrections

### Part 1.1: Global Counts (KB Part 1)

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| CRITICAL | Part 1 — Inventory | Total Tables | 275 active (279 unique tracked) | 206 | RECALCULATE |
| CRITICAL | Part 1 — Inventory | Migration Tables | 116 migration-created tables | 43 | RECALCULATE |
| MAJOR | Part 1 — Inventory | Foreign Keys | Recalculate from actual SQL | ~145 | RECALCULATE |
| MAJOR | Part 1 — Inventory | Indexes | Recalculate from actual SQL | ~320 | RECALCULATE |
| MAJOR | Part 1 — Inventory | ENUM Columns | Recalculate from actual SQL | ~45 | RECALCULATE |
| CRITICAL | Part 1 — Inventory | Triggers | 0 (none exist) | 4 | REPLACE |
| CRITICAL | Part 1 — Inventory | Events | 0 (none exist) | 2 | REPLACE |
| CRITICAL | Part 1 — Inventory | Total Columns (baseline) | Recalculate | ~1,560 | RECALCULATE |
| MAJOR | Part 1 — Inventory | Total Primary Keys | 275 (one per active table) | 206 | RECALCULATE |
| MAJOR | Part 1 — Inventory | Total Unique Constraints | Recalculate | ~55 | RECALCULATE |
| MAJOR | Part 1 — Inventory | Total CHECK Constraints | Recalculate | ~40 | RECALCULATE |

### Part 1.2: Part 2.2 Header Counts

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| CRITICAL | Part 2.2 — Header | Total migration tables | 116 unique migration-created tables | 67 (header says "Total new tables: 67") | RECALCULATE |
| CRITICAL | Part 2.2 — Header | Scope of coverage | Migrations 013–073 (all migration files) | "Files 053–073" only | REGENERATE |

---

## Part 2 — Table Completeness Issues

### Part 2.1: Baseline Tables Missing from KB Part 2.1

Baseline tables in manifest with no entry in KB Part 2.1:

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| MAJOR | Part 2.1 | `seller_profiles` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `seller_shipping_rates` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `settlement_orders` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `settlement_transfers` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `settlements` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `sidebar_layout` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `sport_positions` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `subscription_plan_features` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `subscription_plan_rates` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `system_settings` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `tournament_bracket_types` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `tournament_match_scores` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `transaction_entries` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `transactions` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `translation_keys` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `translations` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `uploads` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `user_addresses` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `user_follows` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `user_friends` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `user_notification_preferences` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `user_role_scopes` | Baseline table, Active | Missing | ADD |
| MAJOR | Part 2.1 | `academy_enrollments_legacy` | Migration table (legacy), Active | Missing | ADD |

### Part 2.2: Fictional Tables in KB Part 2.1 (Not in Manifest)

Tables documented in KB Part 2.1 that do not appear in the manifest:

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| CRITICAL | Part 2.1 | `sessions` | Does not exist (use `user_sessions`) | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `seller_payout_accounts` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shipping_addresses` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shipments` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shipment_items` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shipment_tracking` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shopping_carts` | Does not exist (use `cart_items`) | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `shopping_cart_items` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `sport_organisations` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `subscription_tenant_usage` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `tenant_subscriptions` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `terms_of_service_acceptance` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `themes` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `user_activity_log` | Does not exist (use `activity_logs`) | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `user_preferences` | Does not exist | Documented as baseline table | REMOVE |
| CRITICAL | Part 2.1 | `verification_tokens` | Does not exist (use `email_verification_tokens`) | Documented as baseline table | REMOVE |
| MINOR | Part 2.1 | `coupon_usages` (FIN domain reference) | `coupon_usage` (singular) | `coupon_usages` (plural) | RENAME |

### Part 2.3: Wrong Table Names in KB Part 2.1 vs Manifest

| Severity | Section | Object | Manifest Value (Canonical Name) | Current Document Value | Required Action |
|----------|---------|--------|-------------------------------|----------------------|----------------|
| CRITICAL | Part 2.1 | Wallet table | `user_wallets` | `wallets` | RENAME |
| CRITICAL | Part 2.1 | Email verification table | `email_verification_tokens` | `verification_tokens` (duplicate entry) | REMOVE |
| CRITICAL | Part 2.1 | Activity log table | `activity_logs` | `user_activity_log` (duplicate entry) | REMOVE |

### Part 2.4: Dropped/Legacy Tables Should Be Documented

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| MINOR | Part 2.1 | `settlement_items_v1` | Dropped by Migration 052 | Missing | ADD |
| MINOR | Part 2.1 | `settlements_v1` | Dropped by Migration 052 | Missing | ADD |

---

## Part 3 — Migration Table Issues (Part 2.2)

### Part 3.1: Migration Tables Completely Missing from KB Part 2.2

The KB Part 2.2 only covers migrations 053–073. These migration-created tables from migrations 013–052 are entirely absent:

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| CRITICAL | Part 2.2 | `notification_templates` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_delivery` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_analytics` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_dead_letter_queue` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_digest_windows` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_rate_limits` | M013 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_broadcasts` | M014 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_ab_results` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_ab_tests` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_audit_trail` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_cleanup_policies` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_feature_flags` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_providers` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_replay_log` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_template_versions` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_webhooks` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `user_channel_preferences` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `user_quiet_hours` | M015 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `client_error_reports` | M016 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_alerts` | M016 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `web_vitals_metrics` | M016 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `matches` | M017 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `notification_types` | M017 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `public_match_details` | M018 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `application_settings_history` | M019 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `invitations` | M019 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `join_requests` | M020 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `membership_benefits` | M020 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `membership_history` | M020 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `membership_plans` | M020 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `user_memberships` | M020 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `match_participants` | M021 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `match_sessions` | M022 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `waiting_list` | M023 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `group_invitations` | M027 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `coach_session_events` | M033 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `processed_events` | M039 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_events` | M040 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_instances` | M040 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_steps` | M040 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `processed_commands` | M042 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `dead_letter_entries` | M043 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `published_events` | M044 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `outbox_cursors` | M045 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_event_subscriptions` | M046 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_definitions` | M047 — Migration table | Missing | ADD |
| CRITICAL | Part 2.2 | `workflow_branch_instances` | M048 — Migration table | Missing | ADD |

### Part 3.2: Duplicate Entries Between Part 2.1 and Part 2.2

Tables that appear in BOTH the KB Part 2.1 baseline section AND Part 2.2 migration section:

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| MAJOR | Part 2.1 & 2.2 | `academy_enrollments` | Baseline (renamed to legacy) + M061 new version | Documented in Part 2.1 (line 83) and Part 2.2 (line 1403) — correctly as two different versions but misleading | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.1 & 2.2 | `membership_plans` | M020 (first) + M055 (idempotent/reinforced) | Documented in Part 2.2 M055 (line 1276) — M020 version missing from Part 2.2 | ADD |
| MAJOR | Part 2.1 & 2.2 | `app_settings` | Baseline (first) + M073 (idempotent) | Documented in Part 2.1 (line 203) and Part 2.2 M073 (line 1899) — correctly duplicates but schema differs | UPDATE CROSS REFERENCES |

---

## Part 4 — Cross-Reference Issues (Parts 3–20)

### Part 4.1: Fictional Tables Referenced in Domain/Cross-Reference Sections

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| CRITICAL | Part 3 — ORG domain | `branch_types` | Does not exist | Listed as Part 2.1 table (line 2099) | REMOVE |
| CRITICAL | Part 3 — BOOK domain | `booking_status_history` | Does not exist | Listed as Part 2.1 table (line 2116) | REMOVE |
| CRITICAL | Part 9 — Soft Delete | `marketplace_listings` | Does not exist | Referenced as having `deleted_at` (line 2787) | REMOVE |
| CRITICAL | Part 5 — ENUM catalog | `matches` table ENUMs | `matches` is M017 migration | Referenced as if baseline (lines 2425-2426) | UPDATE CROSS REFERENCES |
| CRITICAL | Part 11 — Domain Matrix | `branch_types` | Does not exist | Counted in ORG domain (line 2873) | REMOVE |
| CRITICAL | Part 11 — Domain Matrix | `booking_status_history` | Does not exist | Counted in BOOK domain (line 2874) | REMOVE |
| MINOR | Part 3 — FIN domain | `coupon_usages` | `coupon_usage` (singular) | `coupon_usages` (plural, line 2161) | RENAME |

### Part 4.2: Part 2.3 Tables Mislabeled as "Part 2.1"

The Part 2.3 infrastructure section labels many migration tables as being from Part 2.1:

| Severity | Section | Object | Manifest Value (True Origin) | Current Document Value | Required Action |
|----------|---------|--------|----------------------------|----------------------|----------------|
| MAJOR | Part 2.3.1 | `api_keys` | Part 2.2 (M072) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.2 | `push_tokens` | Part 2.2 (M073) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.2 | `user_organisations` | Part 2.2 (M060) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.2 | `user_branches` | Part 2.2 (M060) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.3 | `communication_log` | Part 2.2 (M069) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.3 | `push_log` | Part 2.2 (M073) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.4 | `notification_alerts` | Part 2.2 (M016) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.4 | `client_error_reports` | Part 2.2 (M016) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.4 | `web_vitals_metrics` | Part 2.2 (M016) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.4 | `kpi_snapshots` | Part 2.2 (M071) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.5 | `processed_events` | Part 2.2 (M039) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.5 | `published_events` | Part 2.2 (M044) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.5 | `outbox_cursors` | Part 2.2 (M045) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.5 | `processed_commands` | Part 2.2 (M042) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.5 | `dead_letter_entries` | Part 2.2 (M043) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_definitions` | Part 2.2 (M047) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_instances` | Part 2.2 (M040) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_steps` | Part 2.2 (M040) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_events` | Part 2.2 (M040) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_event_subscriptions` | Part 2.2 (M046) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.6 | `workflow_branch_instances` | Part 2.2 (M048) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.7 | All 19 notification infrastructure tables | Part 2.2 (M013–M017) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.7 | `user_quiet_hours` | Part 2.2 (M015) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.7 | `user_channel_preferences` | Part 2.2 (M015) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.8 | `application_settings_history` | Part 2.2 (M019) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.8 | `app_versions` | Part 2.2 (M073) | Part 2.1 | UPDATE CROSS REFERENCES |
| MAJOR | Part 2.3.9 | `coach_session_events` | Part 2.2 (M033) | Part 2.1 | UPDATE CROSS REFERENCES |

### Part 4.3: Domain Count Mismatches (Part 3 & Part 11)

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| MAJOR | Part 3 — USR domain | Table count | Recalculate | 14 | RECALCULATE |
| MAJOR | Part 3 — ORG domain | Table count | Recalculate (remove branch_types) | 13 (includes fictional `branch_types`) | RECALCULATE |
| MAJOR | Part 3 — BOOK domain | Table count | Recalculate (remove booking_status_history) | 7 (includes fictional `booking_status_history`) | RECALCULATE |
| MAJOR | Part 3 — FIN domain | Table count | Recalculate | 20 (listed count) vs 18 (actual entries) | RECALCULATE |
| MAJOR | Part 3 — MEM domain | Table count | Recalculate | 10 (listed) vs 9 (actual entries) | RECALCULATE |
| MAJOR | Part 3 — COMP domain | Table count | 20 Tables | 17 (listed) vs 20 (actual entries) | RECALCULATE |
| MAJOR | Part 3 — MKT domain | Table count | 25 Tables | 25 (listed) vs 26 (actual entries) | RECALCULATE |
| MAJOR | Part 11 — Matrix | Total tables accounted | 275 active | ~188 (line 2890) | RECALCULATE |
| MAJOR | Part 11 — FIN domain | Table count | Recalculate | 18 | RECALCULATE |
| MAJOR | Part 11 — MKT domain | Table count | Recalculate | 26 | RECALCULATE |

---

## Part 5 — Structural Issues

### Part 5.1: Part 2.2 Scope Too Narrow

| Severity | Section | Issue | Required Action |
|----------|---------|-------|----------------|
| CRITICAL | Part 2.2 | Only covers migrations 053–073. Missing 50+ migration tables from 013–052. Manifest documents 116 migration-created tables across 002–073. | REGENERATE |

### Part 5.2: Part 1 Summary Table Contradicts Part 2.2 Header

| Severity | Section | Issue | Required Action |
|----------|---------|-------|----------------|
| MAJOR | Part 1 vs Part 2.2 | Part 1 says 43 migration tables; Part 2.2 header says 67. Both are wrong (manifest says 116). | RECALCULATE both |

### Part 5.3: ENUM Catalog Issues (Part 5)

| Severity | Section | Object | Manifest Value | Current Document Value | Required Action |
|----------|---------|--------|---------------|----------------------|----------------|
| MAJOR | Part 5 | `notification_templates.type` | M013 migration | Referenced | UPDATE CROSS REFERENCES |
| MAJOR | Part 5.4 | `wallet_transactions.transaction_type` | Values: `credit`,`debit` | Values: `deposit`,`withdrawal`,`payment`,`refund`,`commission`,`settlement`,`due`,`penalty` | REPLACE |
| MAJOR | Part 5.4 | `wallet_transactions.direction` | Column does not exist (use `transaction_type`) | Referenced | REMOVE |
| MAJOR | Part 5.4 | `payment_transactions.payment_status` | Values: `pending`,`paid`,`failed`,`refunded` | Values include `created`,`processing`,`cancelled`,`expired` (extras from M005/M034) | REPLACE |
| MAJOR | Part 5.7 | `notification_templates.content_format` | Check definition | `handlebars`,`text`,`html` listed as M018 | UPDATE CROSS REFERENCES |

### Part 5.4: Part 8 Audit Trail — Missing Migration References

| Severity | Section | Object | Required Action |
|----------|---------|--------|----------------|
| MAJOR | Part 8 | `booking_status_history` — table does not exist in manifest | REMOVE reference |
| MAJOR | Part 8 | `membership_history` — labeled baseline, but is M020 migration | UPDATE CROSS REFERENCES |
| MAJOR | Part 8 | `application_settings_history` — labeled baseline, but is M019 migration | UPDATE CROSS REFERENCES |

### Part 5.5: Part 9 Soft Delete — Incorrect References

| Severity | Section | Object | Required Action |
|----------|---------|--------|----------------|
| MAJOR | Part 9 | `marketplace_listings` — does not exist | REMOVE |
| MAJOR | Part 9 | `design_tokens.deleted_at` — verify column exists | VERIFY |
| MAJOR | Part 9 | `uploads` — missing from KB Part 2.1 | ADD table first, then verify soft delete |
| MAJOR | Part 9 | `notifications.deleted_at` — verify column exists | VERIFY |

### Part 5.6: Part 14 Migration Lineage — Incomplete

| Severity | Section | Object | Required Action |
|----------|---------|--------|----------------|
| MAJOR | Part 14 | Missing Phase 1 foundation tables (013–016 notifications, monitoring) | ADD |
| MAJOR | Part 14 | Missing Phase 2 community & matching tables (017–030) | ADD |
| MAJOR | Part 14 | Missing Phase 3 workflow & event bus tables (039–052) | ADD |

---

## Summary

| Category | Count |
|----------|-------|
| CRITICAL issues | 87 |
| MAJOR issues | 52 |
| MINOR issues | 3 |
| **Total issues** | **142** |

### Top Priority Actions
1. **REGENERATE** Part 2.2 to cover all 73 migrations (not just 053–073) — this adds ~50 missing migration tables
2. **RECALCULATE** all Part 1 inventory counts (triggers to 0, events to 0, total tables to 275)
3. **REMOVE** 16 fictional tables from Part 2.1
4. **ADD** 24 missing baseline tables to Part 2.1
5. **RENAME** `wallets` → `user_wallets` in Part 2.1
6. **UPDATE CROSS REFERENCES** in Parts 3–20 to fix all "Part 2.1" labels that should be "Part 2.2"
7. **REGENERATE** Part 5 ENUM catalog against actual schema
