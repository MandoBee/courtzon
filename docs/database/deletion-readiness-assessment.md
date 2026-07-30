# CourtZon Enterprise Database Deletion Readiness Assessment

**Date:** 2026-07-28
**Assessment of:** 10 Delete Candidate tables (from Dormant Table Investigation)
**Method:** 28-criterion verification per table across entire codebase
**Ground truth sources:** `database/baseline/001_courtzon_v3.sql`, all `database/migrations/*.sql`, all `backend/src/`, `frontend/src/`, `docs/`, `database/seeds/`, `database/scripts/`

---

## Assessment Summary

| Table | Passing | Failing | Critical Blockers | Result |
|-------|---------|---------|-------------------|--------|
| `announcement_comments` | 26/28 | C20, C22 | Outgoing FK to `announcements`, `users` | **ARCHIVE** |
| `announcement_likes` | 26/28 | C20, C22 | Outgoing FK to `announcements`, `users` | **ARCHIVE** |
| `community_tournaments` | 26/28 | C20, C22 | Outgoing FK to 5 tables | **ARCHIVE** |
| `cron_jobs` | 27/28 | C14 | Seed data (3 rows) | **ARCHIVE** |
| `email_verification_tokens` | 26/28 | C14, C20 | FK to `users`, seed data | **ARCHIVE** |
| `exchange_rates` | 25/28 | C14, C23, C28 | Seed data (6 rows), reference data for financial system | **ARCHIVE** |
| `player_ratings` | 25/28 | C6, C20, C23, C28 | Cleanup script, FK to `bookings`/`users`, historical data | **ARCHIVE** |
| `resource_unavailability` | 26/28 | C20, C22 | Outgoing FK to `resources` | **ARCHIVE** |
| `revert_logs` | 25/28 | C20, C22, C27 | FK to `users`/`audit_logs`, audit trail concern | **ARCHIVE** |
| `scheduled_jobs` | 27/28 | C14 | Seed data (10 rows) | **ARCHIVE** |

**Safe To Delete:** 0 tables
**Archive:** 10 tables
**Keep:** 0 tables

---

## Detailed 28-Criterion Results

### 1. `announcement_comments`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | No backend repository refs | **PASS** | Zero references in any `.repository.ts` file |
| 2 | No service refs | **PASS** | Zero references in any `.service.ts` file |
| 3 | No controller refs | **PASS** | Zero references in any `.controller.ts` file |
| 4 | No API routes | **PASS** | Zero references in any `.routes.ts` file |
| 5 | No frontend refs | **PASS** | Zero references in `frontend/src/` |
| 6 | No dynamic SQL | **PASS** | Not referenced in cleanup scripts or backend code |
| 7 | No EventBus refs | **PASS** | Not in any event handler or event bus code |
| 8 | No BullMQ refs | **PASS** | Not in any queue/worker code |
| 9 | No scheduled jobs | **PASS** | Not in any scheduling code |
| 10 | No cron jobs | **PASS** | Not in any cron code |
| 11 | No Socket.IO refs | **PASS** | Not in any socket/realtime code |
| 12 | No migration dependency | **PASS** | Baseline table; no migration creates/drops/alters it |
| 13 | No future migration dependency | **INFO** | Cannot predict future migrations |
| 14 | No seed dependency | **PASS** | Not referenced in seed files |
| 15 | No test dependency | **PASS** | Not referenced in any test file |
| 16 | No feature roadmap dependency | **INFO** | No active feature roadmap references |
| 17 | No configuration dependency | **PASS** | Not in any config/.env file |
| 18 | No environment dependency | **PASS** | Not in any environment config |
| 19 | No documentation dependency | **PASS** | Only referenced in audit/KB docs (update expected) |
| 20 | No foreign key dependency | **FAIL** | Outgoing FK `fk_comment_parent` (self), `fk_comment_announce` → `announcements(id)`, `fk_comment_user` → `users(id)` |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 3 FKs: to self, `announcements`, `users` |
| 23 | No production data requiring migration | **PASS** | No data migration concern (no production refs) |
| 24 | No startup impact | **PASS** | No code references it on startup |
| 25 | No reporting impact | **PASS** | No reporting queries reference it |
| 26 | No analytics impact | **PASS** | No analytics code references it |
| 27 | No audit impact | **PASS** | Not an audit-related table |
| 28 | No historical records impact | **PASS** | Announcements feature was never implemented |

**Classification:** ARCHIVE
**Rationale:** Outgoing FKs to `announcements` and `users` are trivially resolved (DROP TABLE auto-drops FKs). Zero incoming FKs. Zero code references. The table is structurally dead but FKs prevent a clean "Safe to Delete" label per strict criteria.

---

### 2. `announcement_likes`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–19 | Same pattern as `announcement_comments` | ALL **PASS** | Zero code/config/seed/test/doc refs |
| 20 | No foreign key dependency | **FAIL** | Outgoing FK `fk_like_announce` → `announcements(id)`, `fk_like_user` → `users(id)`, both CASCADE |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 2 FKs to `announcements`, `users` |
| 23–28 | No other impacts | ALL **PASS** | Same as `announcement_comments` |

**Classification:** ARCHIVE
**Rationale:** Same pattern as `announcement_comments`. Dead feature, only FKs block strict clearance.

---

### 3. `community_tournaments`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–19 | ALL **PASS** | Zero code/config/seed/test refs |
| 20 | No foreign key dependency | **FAIL** | 5 outgoing FKs: `fk_ct_bracket` → `tournament_bracket_types`, `fk_ct_branch` → `branches`, `fk_ct_creator` → `users`, `fk_ct_org` → `organisations`, `fk_ct_sport` → `sports` |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 5 FKs to bracket types, branches, users, orgs, sports |
| 23–28 | ALL **PASS** | | |

**Classification:** ARCHIVE
**Rationale:** Never-implemented community feature. Higher FK count (5) but all outgoing, all trivially resolved.

---

### 4. `cron_jobs`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–13 | ALL **PASS** | Zero code/config/route/event refs |
| 14 | No seed dependency | **FAIL** | `database/seeds/001_baseline.sql` INSERTs 3 rows |
| 15–28 | ALL **PASS** | No test/FK/data/audit concerns |

**Classification:** ARCHIVE
**Rationale:** Only failure is seed data — 3 rows of legacy cron definitions. Superseded by BullMQ. Seed entries would need removal before table can be dropped.

---

### 5. `email_verification_tokens`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–13 | ALL **PASS** | Zero code/config/route/event refs |
| 14 | No seed dependency | **FAIL** | `database/seeds/001_baseline.sql` INSERTs seed data |
| 15–19 | ALL **PASS** | | |
| 20 | No foreign key dependency | **FAIL** | Outgoing FK `fk_email_ver_user` → `users(id)` ON DELETE CASCADE |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 1 FK to `users` |
| 23–28 | ALL **PASS** | | |

**Classification:** ARCHIVE
**Rationale:** FK to `users` and seed data. The `backend/scripts/export-baseline-seed.mjs` explicitly excludes this table, confirming awareness of its unused status. However, strict criteria require resolving seed and FK first.

---

### 6. `exchange_rates`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–13 | ALL **PASS** | Zero code/config/route/event refs |
| 14 | No seed dependency | **FAIL** | `database/seeds/001_baseline.sql` INSERTs 6 currency rate rows |
| 15–19 | ALL **PASS** | | |
| 20 | No foreign key dependency | **PASS** | No outgoing FKs |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **PASS** | No outgoing FKs |
| 23 | No production data migration | **FAIL** | Contains reference rate data (EGP/USD/EUR) that any financial code could depend on |
| 24–26 | ALL **PASS** | | |
| 27 | No audit impact | **PASS** | Not audit-related |
| 28 | No historical records impact | **FAIL** | Exchange rates are historical reference data |

**Classification:** ARCHIVE
**Rationale:** No FKs, no code refs — closest to Safe To Delete. However, seed data and the nature of exchange rates as reference data (other systems may depend on them being present even without active code) prevent a clean clearance.

---

### 7. `player_ratings`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–5 | ALL **PASS** | Zero backend/frontend code refs |
| 6 | No dynamic SQL | **FAIL** | `database/clean-booking-order-data.sql:17` — `UPDATE player_ratings SET booking_id = NULL WHERE booking_id IS NOT NULL` |
| 7–13 | ALL **PASS** | | |
| 14–19 | ALL **PASS** | | |
| 20 | No foreign key dependency | **FAIL** | 3 outgoing FKs: `fk_pr_booking` → `bookings(id)` ON DELETE SET NULL, `fk_pr_rated` → `users(id)` ON DELETE CASCADE, `fk_pr_rater` → `users(id)` ON DELETE CASCADE |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 3 FKs to `bookings`, `users` |
| 23 | No production data migration | **FAIL** | May contain historical player rating data |
| 24–26 | ALL **PASS** | | |
| 27 | No audit impact | **PASS** | Not audit-related |
| 28 | No historical records impact | **FAIL** | Player ratings are historical performance data |

**Classification:** ARCHIVE
**Rationale:** Cleanup script references it, outgoing FKs exist, historical data concern. The `ON DELETE SET NULL` FK to `bookings` means existing bookings aren't affected by the FK.

---

### 8. `resource_unavailability`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–19 | ALL **PASS** | Zero refs anywhere |
| 20 | No foreign key dependency | **FAIL** | Outgoing FK `fk_unavail_resource` → `resources(id)` ON DELETE CASCADE |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 1 FK to `resources` |
| 23–28 | ALL **PASS** | | |

**Classification:** ARCHIVE
**Rationale:** Single FK to `resources`. No code references. Cleanest delete candidate — only the FK prevents Safe status.

---

### 9. `revert_logs`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–19 | ALL **PASS** | Zero code/config/seed/test refs |
| 20 | No foreign key dependency | **FAIL** | 2 outgoing FKs: `fk_revert_admin` → `users(id)` ON DELETE CASCADE, `fk_revert_audit` → `audit_logs(id)` ON DELETE CASCADE |
| 21 | No incoming foreign keys | **PASS** | Zero tables reference this table |
| 22 | No outgoing foreign keys | **FAIL** | 2 FKs to `users`, `audit_logs` |
| 23–26 | ALL **PASS** | | |
| 27 | No audit impact | **FAIL** | Table stores revert operation logs — directly related to audit trail |
| 28 | No historical records impact | **PASS** | | |

**Classification:** ARCHIVE
**Rationale:** Audit-related table storing revert logs. Even though no code reads it, the audit concern is legitimate — audit compliance may require retaining this data even without active code.

---

### 10. `scheduled_jobs`

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1–13 | ALL **PASS** | Zero code/config/route/event refs |
| 14 | No seed dependency | **FAIL** | `database/seeds/001_baseline.sql` INSERTs 10 rows (SendBookingReminder, ProcessSettlements, GenerateReports, etc.) |
| 15–28 | ALL **PASS** | No test/FK/data/audit concerns |

**Classification:** ARCHIVE
**Rationale:** Only failure is seed data — 10 rows of legacy job definitions. Superseded by BullMQ. Seed entries would need removal before table can be dropped.

---

## 1. Safe To Delete List

**NONE.** Zero tables pass all 28 criteria.

---

## 2. Archive List

All 10 tables — preserved in schema, no runtime code path, but with minor cleanup requirements before any potential deletion.

| Table | Blockers to resolve for future deletion |
|-------|----------------------------------------|
| `announcement_comments` | No code changes needed; FK auto-dropped on DROP TABLE |
| `announcement_likes` | No code changes needed; FK auto-dropped on DROP TABLE |
| `community_tournaments` | No code changes needed; FK auto-dropped on DROP TABLE |
| `cron_jobs` | Remove 3 seed rows from `001_baseline.sql` and `003_baseline_snapshot.sql` |
| `email_verification_tokens` | Remove seed rows; FK auto-drops |
| `exchange_rates` | Remove 6 seed rows; confirm no downstream system expects rate data |
| `player_ratings` | Update `clean-booking-order-data.sql` to remove reference; FK auto-drops |
| `resource_unavailability` | No code changes needed; FK auto-dropped on DROP TABLE |
| `revert_logs` | Confirm audit retention policy allows removal; FK auto-drops |
| `scheduled_jobs` | Remove 10 seed rows from `001_baseline.sql` and `003_baseline_snapshot.sql` |

---

## 3. Keep List

**NONE.** No tables require active retention for application functionality.

---

## 4. Risk Assessment

| Risk | Assessment |
|------|-----------|
| **Runtime impact** | **NONE** — zero tables have active code paths in backend or frontend |
| **Startup impact** | **NONE** — no tables are referenced during application bootstrap |
| **Data loss** | **LOW** — 6 tables have seed data; `player_ratings`, `exchange_rates`, `revert_logs` may contain historical production data depending on deployment history |
| **FK chain reaction** | **NONE** — zero incoming FKs to any of the 10 tables |
| **Reporting/analytics** | **NONE** — no reports or analytics queries reference these tables |
| **Audit compliance** | **LOW** — `revert_logs` stores revert audit records; verify retention requirements |
| **Migration chain** | **NONE** — no migration creates or depends on these tables post-baseline |

---

## 5. Deletion Readiness Certification

| Table | C1–28 Pass Rate | Safe To Delete? | Certification |
|-------|----------------|-----------------|---------------|
| `announcement_comments` | 26/28 (93%) | **NO** | NOT READY |
| `announcement_likes` | 26/28 (93%) | **NO** | NOT READY |
| `community_tournaments` | 26/28 (93%) | **NO** | NOT READY |
| `cron_jobs` | 27/28 (96%) | **NO** | NOT READY |
| `email_verification_tokens` | 26/28 (93%) | **NO** | NOT READY |
| `exchange_rates` | 25/28 (89%) | **NO** | NOT READY |
| `player_ratings` | 24/28 (86%) | **NO** | NOT READY |
| `resource_unavailability` | 26/28 (93%) | **NO** | NOT READY |
| `revert_logs` | 25/28 (89%) | **NO** | NOT READY |
| `scheduled_jobs` | 27/28 (96%) | **NO** | NOT READY |

### Certification: NONE READY FOR DELETION

**Reason:** Every table fails at least one of the 28 criteria:
- **8 tables** fail C20/C22 (outgoing foreign keys) — structural but resolvable
- **4 tables** fail C14 (seed data dependency)
- **2 tables** fail C23/C28 (reference/historical data concern)
- **1 table** fails C6 (cleanup script reference)
- **1 table** fails C27 (audit concern)

**Path to certification:** The nearest candidates are `cron_jobs` and `scheduled_jobs` (96% pass rate) — only seed data blocks them. `resource_unavailability` and `announcement_*` tables (93%) would become ready if outgoing FKs are accepted as non-blocking.

---

*End of Deletion Readiness Assessment*
