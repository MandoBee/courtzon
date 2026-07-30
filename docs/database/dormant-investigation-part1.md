# Dormant Database Tables Investigation — Part 1

**Date:** 2026-07-28
**Scope:** 14 tables suspected dormant
**Method:** Full codebase grep (backend/src, frontend/src, database/, docs/, scripts/, configs)
**Excluded:** `node_modules/`, `.git/` — archives/backups/release noted separately

---

### `ad_pricing`
- **Snake case refs:** 14 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO — not in `database/seeds/001_baseline.sql` or `database/seed/003_baseline_snapshot.sql`
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Created in `archive/database/schema/006_community_ads_cms.sql` (legacy ads module). Exists in V3 baseline but has zero application code references, no seeds, no FKs, no routes, no controllers, no services. Listed as "Safe to archive — Part of ads module (foundation only, no active consumers)" in the Phase 1 unused-tables audit.
- **Confidence:** 100%
- **Classification:** Archive Candidate

---

### `ad_targeting_rules`
- **Snake case refs:** 13 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Same archive schema file as `ad_pricing` (`006_community_ads_cms.sql`). No code references anywhere in backend/src or frontend/src. No FK relationships. Listed as "Part of ads module" in Phase 1 audit.
- **Confidence:** 100%
- **Classification:** Archive Candidate

---

### `announcement_comments`
- **Snake case refs:** 13 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** YES — SELF-REFERENCING FK only (`fk_comment_parent` on `parent_id` references itself). No other table references it.
- **Dynamic SQL:** NO
- **Evidence:** Self-referencing FK only. No application code references. No announcement feature exists in frontend or backend. Phase 1 audit marked it "Dead feature — no frontend or backend references" and "Safe to delete."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `announcement_likes`
- **Snake case refs:** 13 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** No FK references. No application code. No announcement feature exists. Phase 1 audit: "Dead feature" and "Safe to delete."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `booking_intents`
- **Snake case refs:** 28 files found
- **Camel case refs:** 1 file found (archive only, `archive/docs/01-domain-map.md`)
- **Pascal case refs:** 1 file found (archive only, `archive/docs/01-domain-map.md`)
- **Repository refs:** NO — no dedicated repository file in backend/src
- **Service refs:** NO — no service class references this table
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO — no BullMQ worker
- **Event refs:** NO
- **Frontend refs:** NO — zero references in frontend/src (checked all camelCase and PascalCase variants)
- **Seed refs:** NO — not seeded in `database/seeds/001_baseline.sql`
- **Test refs:** NO — no test files reference this table
- **Doc refs:** YES — `ADR-004-universal-scheduling-architecture.md`, `payment-runbook.md`, `time-architecture.md`, `enterprise-library/QUAL-TEST-03_Integration_Test_Reference.md`, `enterprise-library/exports/ai/embeddings_ready.json`, `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`
- **FK refs (from other tables):** NONE — table has `user_id`, `branch_id`, `organisation_id`, `resource_id` columns but **NO explicit FK constraints** defined in baseline
- **Dynamic SQL:** YES — `backend/scripts/backfill-time-columns.mjs` runs `UPDATE booking_intents SET start_at_utc = ?, end_at_utc = ?, business_date = ? WHERE id = ?`
- **Evidence:** This table is **active** with significant infrastructure:
  - 7 dedicated migrations: 006-009 (lifecycle), 024-025 (time engine columns), 034 (payment_status alignment)
  - `backend/scripts/backfill-time-columns.mjs` — populates time-engine columns
  - `database/clean-booking-order-data.sql` — includes `DELETE FROM booking_intents`
  - `backend/.env.example` — has `INTENT_RETENTION_FULFILLED_DAYS` / `INTENT_RETENTION_TERMINAL_DAYS` config vars
  - `database/scripts/clean-bookings-marketplace.sql` — referenced
  - However: **no backend service/controller/route code** reads or writes this table at runtime. The `payment_transactions` table (which logically links to intents) has NO FK to booking_intents. The table exists but appears to be used only via scheduled cleanup / backfill scripts, not by active request handlers.
- **Confidence:** 85% (actively maintained via migrations but no runtime code path in Node.js layer)
- **Classification:** Keep (but needs investigation for missing service layer)

---

### `branch_unavailability`
- **Snake case refs:** 14 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Created in `archive/database/schema/001_sports_organisation.sql`. Exists in V3 baseline but has zero application code references. Phase 1 audit listed as redundant structure. The resource/branch unavailability concept may be handled differently now.
- **Confidence:** 100%
- **Classification:** Archive Candidate

---

### `commission_rules`
- **Snake case refs:** 25 files found (archives/backups/docs/schema/baseline/seeds)
- **Camel case refs:** 6 files found (seed snapshots only: `database/seed/003_baseline_snapshot.sql`, `database/seeds/001_baseline.sql`, `backups/*`, `docs/validation/backups/*`)
- **Pascal case refs:** 6 files found (same seed files)
- **Repository refs:** NO — `commission-mappers.ts` and `commission.service.ts` in backend/src do NOT reference `commission_rules`
- **Service refs:** NO — same as above
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `database/seeds/001_baseline.sql` and `database/seed/003_baseline_snapshot.sql` contain INSERT statements populating commission rules
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `01_database_forensics.md`, `database_guide.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Has seed data but no code reads it. The backend `commission.service.ts` and `commission-mappers.ts` don't reference `commission_rules`. Phase 1 audit said "Referenced only in commission-entities.ts helper" (archive, not production). Contains commission rate definitions that may be needed for financial calculations but no active consumers.
- **Confidence:** 95%
- **Classification:** Keep (has seed data, may be needed for commission calculations even without direct code refs)

---

### `community_tournaments`
- **Snake case refs:** 15 files found (all archives/backups/docs/schema/baseline)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Created in `archive/database/schema/006_community_ads_cms.sql`. No code references. Tables `announcements`, `community_tournaments` were part of a never-implemented community features. Phase 1 audit: "Dead — never migrated to tournaments module."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `cron_jobs`
- **Snake case refs:** 21 files found (archives/backups/docs/schema/baseline/seeds)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `database/seeds/001_baseline.sql` and `database/seed/003_baseline_snapshot.sql` contain INSERT statements
- **Test refs:** NO
- **Doc refs:** YES — `01_database_forensics.md`, `database_guide.md`, `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Legacy cron job scheduling table. Replaced by BullMQ workers. Has seed data. Phase 1 audit: "Dead — replaced by BullMQ workers."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `email_verification_tokens`
- **Snake case refs:** 21 files found (archives/backups/docs/schema/baseline/seeds)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `database/seeds/001_baseline.sql` and `database/seed/003_baseline_snapshot.sql` contain INSERT statements
- **Test refs:** NO
- **Doc refs:** YES — `01_database_forensics.md`, `02_database_authority.md`, `database_guide.md`, `database-manifest.md`, `database-kb-repair-report.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** `backend/scripts/export-baseline-seed.mjs` uses this table in export context (to exclude from seed export). No active code references for email verification flow. Phase 1 audit: "Legacy — unused in auth flow."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `exchange_rates`
- **Snake case refs:** 20 files found (archives/backups/docs/schema/baseline/seeds)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `database/seeds/001_baseline.sql` and `database/seed/003_baseline_snapshot.sql` contain INSERT statements
- **Test refs:** NO
- **Doc refs:** YES — `01_database_forensics.md`, `database_guide.md`, `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Multi-currency exchange rate table. Seeded with EGP/USD/EUR rates. But no application code reads or writes to it. Phase 1 audit: "No consumer in code" and "Safe to delete."
- **Confidence:** 100%
- **Classification:** Delete Candidate

---

### `media_uploads`
- **Snake case refs:** 22 files found (archives/backups/docs/schema/baseline/seeds)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `database/seeds/001_baseline.sql` and `database/seed/003_baseline_snapshot.sql` contain INSERT statements
- **Test refs:** NO
- **Doc refs:** YES — `01_database_forensics.md`, `02_database_authority.md`, `database_guide.md`, `database-manifest.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** `backend/scripts/export-baseline-seed.mjs` uses this table (excluded from seed export). No active code references. CMS media module was never wired. Phase 1 audit: "CMS media module needs wiring."
- **Confidence:** 100%
- **Classification:** Archive Candidate

---

### `notification_alerts`
- **Snake case refs:** 6 files found (migration 016 + docs)
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — `database-manifest.md`, `database-kb-repair-report.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** NO
- **Evidence:** Created solely by `database/migrations/016_monitoring_alerts.sql`. Not in V3 baseline (migration-only table). NOT referenced by any backend or frontend application code. The migration creates it alongside `client_error_reports` and `web_vitals_metrics` tables, which ARE referenced by backend code (`POST /client/errors`, `POST /client/web-vitals` routes), but `notification_alerts` has no route handler, no service, no repository.
- **Confidence:** 100%
- **Classification:** Archive Candidate (migration 016 should be reviewed — may be dead code within migration)

---

### `notification_providers`
- **Snake case refs:** 8 files found
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO — no dedicated repository file
- **Service refs:** INDIRECT — referenced via raw SQL queries in test/e2e files
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO — seeded inline in migration 015 via INSERT IGNORE
- **Test refs:** YES — `backend/src/modules/notifications/__tests__/notification-templates.integration.spec.ts` queries `SELECT slug FROM notification_providers WHERE is_enabled = TRUE`
- **Doc refs:** YES — `database-manifest.md`, `database-kb-repair-report.md`, `enterprise-database-knowledge-base.md`, `DB-03_Entity_Reference.md`, `database-cleanup-audit.md`
- **FK refs (from other tables):** NONE
- **Dynamic SQL:** YES — `backend/scripts/e2e-validation.mjs` has raw SQL `SELECT slug FROM notification_providers WHERE is_enabled = TRUE`
- **Evidence:** Created by `database/migrations/015_notification_enterprise_platform.sql` which is an IF NOT EXISTS migration. Seeded with 6 providers (in_app, push, email, sms, whatsapp, webhook). The integration test and e2e validation script both query this table. However, no runtime application service (notification service, delivery service) actually references this table for provider routing. The table is a registry that exists but is not consulted during notification delivery.
- **Confidence:** 90% (has active test coverage but no production runtime code dependency)
- **Classification:** Keep (needs wiring to notification delivery service)

---

## Summary Table

| # | Table | Classification | Confidence | Key Evidence |
|---|-------|---------------|------------|--------------|
| 1 | `ad_pricing` | Archive Candidate | 100% | No code/FK/seeds |
| 2 | `ad_targeting_rules` | Archive Candidate | 100% | No code/FK/seeds |
| 3 | `announcement_comments` | **Delete Candidate** | 100% | Dead feature, self-FK only |
| 4 | `announcement_likes` | **Delete Candidate** | 100% | Dead feature |
| 5 | `booking_intents` | **Keep** | 85% | 7 migrations, backfill, env config, clean script — but no runtime code |
| 6 | `branch_unavailability` | Archive Candidate | 100% | No code/FK/seeds |
| 7 | `commission_rules` | **Keep** | 95% | Seeded data, may be needed for finance |
| 8 | `community_tournaments` | **Delete Candidate** | 100% | Dead feature |
| 9 | `cron_jobs` | **Delete Candidate** | 100% | Replaced by BullMQ |
| 10 | `email_verification_tokens` | **Delete Candidate** | 100% | Legacy, unused in auth |
| 11 | `exchange_rates` | **Delete Candidate** | 100% | No consumer |
| 12 | `media_uploads` | Archive Candidate | 100% | CMS not wired |
| 13 | `notification_alerts` | Archive Candidate | 100% | Migration-only, no runtime code |
| 14 | `notification_providers` | **Keep** | 90% | Active tests/e2e but needs wiring |

**Active (Keep):** `booking_intents` (85%), `commission_rules` (95%), `notification_providers` (90%)
**Delete Candidates:** `announcement_comments`, `announcement_likes`, `community_tournaments`, `cron_jobs`, `email_verification_tokens`, `exchange_rates`
**Archive Candidates:** `ad_pricing`, `ad_targeting_rules`, `branch_unavailability`, `media_uploads`, `notification_alerts`
