# Phase 3: Database Forensics

**Generated:** 2026-06-24
**Objective:** Identify active schemas, historical schemas, migration systems, and seed systems.

---

## 3.1 Database Overview

| Property | Value |
|----------|-------|
| Database Name | `courtzon_v2` |
| Engine | MySQL 8.0 |
| Charset | `utf8mb4` |
| Collation | `utf8mb4_unicode_ci` |
| Migration Method | Sequential SQL files via Node.js script |
| Seed Authority | Baseline snapshot (`003_baseline_snapshot.sql`) |

---

## 3.2 Migration History

### Migration System
- **Engine:** `backend/scripts/migrate.js` — custom Node.js script using `mysql2/promise`
- **Tracking Table:** `migration_history` (added in migration `128_add_migration_history.sql`)
- **Migration Directory:** `database/schema/`
- **Total Migrations:** 128 SQL files (numbered `000` to `128`)
- **Execution Model:** Sequential, file-by-file execution with `INSERT IGNORE` tracking

### Migration File Categories

| Category | Files | Description |
|----------|-------|-------------|
| Core Foundation | 000–010 (11) | Base tables: users, auth, RBAC, bookings, marketplace, payments, etc. |
| Iterative Changes | 011–030 (20) | Renames, currency, geo data, CMS, security |
| Feature Additions | 031–050 (20) | Amenities, banks, settlements, coaches, subscriptions |
| Theme Studio | 051–070 (20) | Appearance tokens, component styles, theme modes |
| Content Management | 071–090 (20) | App settings, favicon, translations, CMS pages |
| Cleanup/Tuning | 091–110 (20) | Blog, seller features, cleanup, role consolidation |
| Final Fixes | 111–128 (18) | Payment, shipping, accounting, booking intents |

### Migration Issues

1. **Extreme bloat** — 128 files to reach the current schema is excessive for a project of this size
2. **No rollback support** — no down-migration mechanism
3. **Lenient error handling** — many errors are silently skipped (`SKIP if table exists`, `SKIP if column exists`, etc.)
4. **Self-referential tracking** — migration_history table is created by the last migration (#128), meaning it cannot track the first 128 runs
5. **Inline seeds** — `migrate.js` contains hardcoded seed data (countries, languages, system_settings) separate from the seed system

---

## 3.3 Seed Systems

### Identified Seed Systems

| System | Trigger | Location | Purpose |
|--------|---------|----------|---------|
| **Baseline Snapshot** | `--seed` flag | `database/seed/003_baseline_snapshot.sql` | Primary data seed (1 MB, 86 tables) |
| Legacy SQL Seeds | `--seed-legacy` flag | `database/seed/001_seed_core.sql`, `002_seed_provinces_cities.sql` | Fallback when baseline missing |
| Inline Reference Data | Auto with `--fresh` | Inside `migrate.js` (lines 280-298) | countries, languages, system_settings |
| Demo JS Seeds | `--seed-demo` flag | `database/seed/run.mjs` + `modules/` (15 files) | Synthetic demo data |
| Role Permission Sync | Auto with `--seed` | `backend/scripts/sync-role-permissions.mjs` | Template-based role grants |
| Auto-Seed on Startup | Container start | `backend/docker-entrypoint.sh` | Checks `app_settings` emptiness |
| Individual Seed Scripts | Manual | Various `backend/scripts/seed-*.js` | Ad-hoc seeding |
| Baseline Export | Manual | `backend/scripts/export-baseline-seed.mjs` | Exports current DB to baseline |

### Seed Issues

1. **Too many seed paths** — at least 5 distinct seed mechanisms
2. **Auto-seed on docker startup** — violates separation of concerns
3. **Duplicate authority** — inline reference data in migrate.js duplicates what's already in baseline
4. **JS seed modules** — 15 modules for demo data add complexity
5. **Unused legacy seeds** — `001_seed_core.sql`, `002_seed_provinces_cities.sql` are rarely used

---

## 3.4 Current Active Tables

Based on the `baseline-manifest.json` (exported 2026-06-14), the current active database contains **86 data tables** tracked in the baseline, plus **~50 volatile/excluded tables** (sessions, bookings, orders, etc.).

### Configuration & Reference (30 tables)

| Table | Rows | Purpose |
|-------|------|---------|
| `system_settings` | 25 | App-wide configuration |
| `languages` | 2 | i18n languages |
| `translations` | 286 | Translation values |
| `translation_keys` | 581 | Translation key registry |
| `countries` | 8 | Country data |
| `currencies` | 7 | Currency definitions |
| `exchange_rates` | 6 | Currency exchange rates |
| `player_levels` | 5 | Skill levels |
| `sports` | 16 | Sport types |
| `organisation_types` | 5 | Org type taxonomy |
| `organisation_type_attributes` | 3 | Org type metadata |
| `resource_types` | 10 | Resource categories |
| `resource_type_attributes` | 10 | Resource metadata |
| `resource_attribute_values` | 13 | Resource attribute values |
| `amenities` | 20 | Amenity definitions |
| `court_amenities` | 120 | Court-amenity assignments |
| `banks` | 11 | Bank definitions |
| `bank_branches` | 1 | Bank branch data |
| `payment_gateway_config` | 3 | Payment gateway settings |
| `payment_methods` | 5 | Available payment methods |
| `cancellation_policies` | 6 | Booking cancellation rules |
| `commission_rules` | 5 | Commission rate rules |
| `subscription_plans` | 7 | Subscription plan definitions |
| `subscription_plan_rates` | 23 | Plan pricing tiers |
| `subscription_features` | 9 | Feature definitions |
| `subscription_plan_features` | 54 | Plan-feature assignments |
| `tournament_bracket_types` | 4 | Tournament bracket formats |
| `tags` | 25 | Marketplace product tags |
| `brands` | 74 | Product brands |
| `product_categories` | 118 | Product category tree |

### RBAC & Permissions (10 tables)

| Table | Rows | Purpose |
|-------|------|---------|
| `permission_modules` | 30 | Module definitions |
| `permissions` | 555 | Individual permissions |
| `roles` | 17 | Role definitions |
| `role_permissions` | 1144 | Role-permission assignments |
| `user_roles` | 5 | User-role assignments |
| `user_role_scopes` | 2 | Scope-limited role assignments |
| `feature_flags` | 18 | Feature toggle flags |
| `sidebar_layout` | 11 | Sidebar menu configuration |
| `cron_jobs` | 3 | Scheduled job definitions |
| `scheduled_jobs` | 10 | Job scheduling |

### Design Tokens & Appearance (10 tables)

| Table | Rows | Purpose |
|-------|------|---------|
| `design_tokens` | 159 | CSS variable tokens |
| `design_token_versions` | 2 | Token version history |
| `design_theme_reset_baseline` | 1 | Theme reset point |
| `app_settings` | 12 | Application settings |
| `cms_pages` | 10 | CMS page content |
| `cms_section_blocks` | 50 | CMS page sections |
| `cms_blogs` | 3 | Blog posts |
| `holidays` | 1 | Holiday definitions |

### Core Business (15 tables)

| Table | Rows | Purpose |
|-------|------|---------|
| `users` | 3 | User accounts |
| `player_profiles` | 2 | Player-specific data |
| `player_sport_interests` | 2 | Player sport preferences |
| `organisations` | 1 | Organization records |
| `organisation_subscriptions` | 1 | Org subscription assignments |
| `branches` | 2 | Organization branches |
| `branch_amenity_assignments` | 5 | Branch-amenity links |
| `branch_financial_details` | 1 | Branch financial config |
| `products` | 50 | Marketplace products |
| `product_images` | 98 | Product images |
| `product_variants` | 208 | Product variant options |
| `seller_shipping_rates` | 2 | Shipping rate config |
| `uploads` | 18 | File upload tracking |
| `user_wallets` | 2 | User wallet records |
| `platform_accounts` | 4 | Platform financial accounts |

### Excluded Volatile Tables (~50 tables)

These tables contain operational/transactional data and are NOT included in the baseline seed:

`bookings`, `booking_slots`, `booking_participants`, `booking_invitations`, `orders`, `order_items`, `payment_transactions`, `transactions`, `settlements`, `settlement_items`, `wallet_transactions`, `user_sessions`, `user_devices`, `audit_logs`, `activity_logs`, `notifications`, `notification_queue`, `cart_items`, `wishlist_items`, `messages`, `conversations`, `coach_sessions`, `coach_reviews`, `tournament_matches`, `tournament_registrations`, `ad_clicks`, `ad_impressions`, `brute_force_lockouts`, `contact_submissions`, `cron_job_runs`, `email_verification_tokens`, `financial_entries`, `login_attempts`, `media_uploads`, `friend_requests`, `withdrawal_requests`, `academy_enrollments`, `academy_sessions`, `academy_evaluations`, `organisation_upgrade_requests`, `transaction_entries`, `booking_invitation_applications`, `community_event_participants`, `conversation_participants`, `user_follows`, `tournament_match_scores`, `password_reset_tokens`, `member_attendance`

---

## 3.5 Historical Data

| Artifact | Size | Status | Notes |
|----------|------|--------|-------|
| `database/courtzon_v2_05062026.sql` | 1.0 MB | Historical dump | Full database dump from 2026-06-05 |
| `database/schema/*.sql` (128 files) | ~500 KB | Current/Historical | Active migrations (will be baselined) |
| `database/seed/001_seed_core.sql` | 43 KB | Legacy | Superseded by baseline |
| `database/seed/002_seed_provinces_cities.sql` | 32 KB | Legacy | Superseded by baseline |
| `database/seed/003_baseline_snapshot.sql` | 1.0 MB | **Active Authority** | Current data seed |
| `database/seed/modules/*.mjs` (15 files) | ~200 KB | Legacy | Demo data generators |
| `database/seed/*.mjs` (various) | ~150 KB | Historical | Ad-hoc scripts |

---

## 3.6 Key Findings

1. **Single active database: `courtzon_v2`** — no other databases exist
2. **Single migration system** — `migrate.js` is the only migration engine
3. **Seed systems are fragmented** — baseline snapshot is the authority, but inline + legacy + demo paths exist
4. **Migration history tracking is incomplete** — `migration_history` table was only added in migration #128
5. **~95+ active tables** — approximately 45 reference/config tables + 50 volatile/transactional tables
6. **The schema is stable** — migrations 115-128 are mostly accounting/financial refinements, indicating the schema has converged

---

## 3.7 Recommendations

| Issue | Recommendation |
|-------|---------------|
| 128 migrations | Create single `001_courtzon_v3.sql` baseline on next fresh deploy |
| Auto-seed on startup | Remove from docker-entrypoint.sh |
| Multiple seed paths | Keep only baseline snapshot + export script |
| Inline reference data | Remove from migrate.js (already in baseline) |
| Legacy seeds | Archive all `001_seed_core.sql`, `002_seed_provinces_cities.sql`, modules/ |
| migration_history gap | After baseline, tracking will start fresh |
