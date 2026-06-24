# Phase 4: Database Authority

**Generated:** 2026-06-24
**Objective:** Determine the single authoritative schema and seed source for CourtZon V3.

---

## 4.1 Authority Determination

After forensic analysis of the database directory, the following is declared:

### Schema Authority: The SQL schema files in `database/schema/`

While currently fragmented across 128 incremental migration files, the **authoritative schema** is the cumulative result of executing all 128 files in sequence against a MySQL 8.0 database named `courtzon_v2`.

#### Schema Authority Chain
```
database/schema/000_core_foundation.sql  ← Foundation (17 tables)
database/schema/001_sports_organisation.sql  ← Sports + orgs
database/schema/002_rbac.sql  ← RBAC tables
... (124 more incremental files) ...
database/schema/128_add_migration_history.sql  ← Tracking table
```

The cumulative SQL can be reconstructed by concatenating all 128 files. However, for V3, this will be **consolidated into a single baseline file**.

### Seed Authority: `database/seed/003_baseline_snapshot.sql`

This file (1.0 MB, exported 2026-06-14) is the **single source of truth** for reference data. It contains `INSERT IGNORE` statements for all 86 non-volatile tables with 4,374 rows of configuration data.

#### Seed Authority Chain
```
003_baseline_snapshot.sql  ← Primary (86 tables, 4,374 rows)
baseline-manifest.json  ← Metadata (table list, row counts, excluded tables)
export-baseline-seed.mjs  ← Generator script for refreshing baseline
```

### Migration History Authority: `migration_history` table

New in migration #128, this table tracks which migration files have been applied. After V3 baseline, this table will contain only future migration tracking.

---

## 4.2 One Database Authority: `courtzon_v2`

| Property | Value |
|----------|-------|
| **Active Database** | `courtzon_v2` |
| **Schema Defined By** | `database/schema/*.sql` (128 files cumulative) |
| **Seed Defined By** | `database/seed/003_baseline_snapshot.sql` |
| **Future Schema** | `database/baseline/001_courtzon_v3.sql` (Phase 5) |
| **Future Seeds** | `database/seeds/` (Phase 6) |

---

## 4.3 Authority Decisions for V3

| Aspect | Current State | V3 Authority |
|--------|---------------|---------------|
| **Schema source** | 128 SQL files in `database/schema/` | Single `database/baseline/001_courtzon_v3.sql` |
| **Future migrations** | Append to `database/schema/` | Append to `database/migrations/` |
| **Seed data** | 3 SQL files + JS modules | `database/seeds/001_baseline.sql` |
| **Seed generator** | `export-baseline-seed.mjs` | Same (improved, in `scripts/`) |
| **Migration runner** | `backend/scripts/migrate.js` | `scripts/migrate.sh` |
| **Seed runner** | `migrate.js --seed` | `scripts/seed.sh` |
| **Seed on startup** | Auto in docker-entrypoint.sh | **REMOVED** — manual only |
| **Migration on startup** | Auto in docker-entrypoint.sh | **REMOVED** — manual only |
| **Inline reference seeds** | In migrate.js hardcoded | **REMOVED** — baseline only |

---

## 4.4 Excluded Tables (Volatile Data)

The following tables contain runtime/transactional data and are **excluded from seed authority**:

**Booking & Sessions:** bookings, booking_slots, booking_participants, booking_invitations, booking_invitation_applications, coach_sessions, academy_sessions, academy_enrollments, academy_evaluations, academy_session_attendance

**E-commerce:** orders, order_items, cart_items, wishlist_items

**User Activity:** user_sessions, user_devices, notifications, notification_queue, activity_logs, login_attempts, brute_force_lockouts

**Financial:** payment_transactions, transactions, financial_entries, transaction_entries, wallet_transactions, settlement_items, settlements, withdrawal_requests

**Social:** messages, conversations, conversation_participants, friend_requests, user_follows

**Tournaments:** tournament_matches, tournament_match_scores, tournament_registrations

**Audit:** audit_logs

**Other:** email_verification_tokens, password_reset_tokens, contact_submissions, cron_job_runs, media_uploads, ad_clicks, ad_impressions, member_attendance, organisation_upgrade_requests, coach_reviews

---

## 4.5 Total Active Table Count

| Category | Count | Examples |
|----------|-------|---------|
| Reference/Config tables (seeded) | ~45 | countries, currencies, sports, roles, permissions |
| Volatile tables (not seeded) | ~50 | bookings, orders, sessions, notifications |
| **Total** | **~95** | |

---

## 4.6 Authority Enforcement Rules

1. **No auto-migration on startup** — container starts must never modify the database
2. **No auto-seed on startup** — seed is an explicit manual operation
3. **No inline seeds in code** — all reference data must come from the seed authority file
4. **No legacy seed paths** — `--seed-legacy`, `--seed-demo`, `run.mjs` will be removed
5. **Single seed command** — `scripts/seed.sh` is the only seed entry point
6. **Single migrate command** — `scripts/migrate.sh` is the only migration entry point
