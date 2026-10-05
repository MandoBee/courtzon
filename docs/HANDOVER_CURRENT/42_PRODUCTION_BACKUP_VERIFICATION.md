# 42 — PRODUCTION BACKUP & RESTORE VERIFICATION

**Audit/back-up date:** 2026-10-04 · **Mode:** backup + read-only verification ONLY (no cleanup, no production writes, no deletes, no migrations, no app/Docker/Git/config changes).
**Backup target confirmed:** `187.127.72.93:3307 / courtzon_v3` (MySQL 8.0.46, instance `2515d404b031`).

---

## A. Production fingerprint (recorded BEFORE backup, read-only)

| Item | Value |
|---|---|
| Server / host | 187.127.72.93 (Hostinger origin), port 3307 (public) -> 3306 (in-container) |
| Database | courtzon_v3 |
| MySQL version | 8.0.46 |
| Schema instance | container hostname `2515d404b031` |
| Database tables | **330** |
| Triggers | **19** |
| Routines (stored program) | **1** |
| Index rows (information_schema.statistics) | **1,643** |
| migration_history | **201** rows; latest `194_membership_entitlements.sql` |
| Timestamp captured | 2026-10-04 20:39:33 (UTC+0 wall; NOW() == UTC_TIMESTAMP()) |

### Critical table row counts (same snapshot)

users 28 · organisations 17 · organisation_subscriptions 19 · user_wallets 28 · bookings 5 · matches 4 · tournaments 3 · payment_transactions 10 · gateway_settlements 2 · ledger_entries 40 · general_ledger 40 · transactions 11 · notifications 60 · workflow_definitions 3,700 · user_sessions 3,606 · processed_commands 190 · processed_events 5 · notification_rate_limits 473 · player_ratings 2 · player_rating_history 3 · elo_ratings 0 · migration_history 201.

All 330 per-table counts were collected into a fingerprint file (`prodcounts`) for byte-exact comparison.

## B. Backup method

```
mysqldump --single-transaction --routines --triggers --events --hex-blob --opt --skip-lock-tables courtzon_v3
```

- Executed from the local MySQL client container (`courtzon-mysql`) against the production host `187.127.72.93:3307`, credentials via env (not exposed).
- `--single-transaction` = InnoDB consistent snapshot; read-only on production; no application write impact.
- `--routines --triggers --events` = full logical backup (schema + data + triggers + routines/events).
- `--skip-lock-tables` avoids global read lock.
- Complete database (all 330 tables), one database, no `--databases` (restore can target an isolated db name).
- Exit code: 0 · stderr: empty.

## C. Backup filename

`courtzon_v3_production_20261004_2039.sql`

## D. Backup size

**4,911,730 bytes (~4.69 MB)**

## E. SHA-256

`00B7D21DFE0964CBCA60F5A482594B9E50B8DE44749122EB8B98B768F6D2923E`

## F. Backup timestamp

Created 2026-10-04 23:45 local (dump content consistent with the 20:39:33 UTC fingerprint snapshot). Stored in `C:\Users\mniaz\AppData\Local\Temp\opencode\court_backup\` (outside the Production MySQL data directory and outside the Production host).

## G. Restore environment (completely separate)

Temporary/isolated target: **local Docker MySQL** container `courtzon-mysql` (instance `6622d8c632c9`, MySQL 8.0.46) — a different physical/networked environment from Production (`2515d404b031`). Nothing on Production was written.

## H. Restore database name

`courtzon_v3_restore_verify` (created fresh in the isolated local instance; `utf8mb4/utf8mb4_unicode_ci`).

## I. Production vs Restore table counts

| Check | Production | Restore | Match |
|---|---|---|---|
| Table count | 330 | 330 | ✅ |
| Unexpected missing tables | — | 0 | ✅ |
| Unexpected extra tables | — | 0 | ✅ |
| Triggers | 19 | 19 | ✅ |
| Routines | 1 | 1 | ✅ |
| Index rows | 1,643 | 1,643 | ✅ |
| migration_history rows | 201 | 201 | ✅ |
| Latest migration | 194_membership_entitlements.sql | 194_membership_entitlements.sql | ✅ |

## J. Production vs Restore row counts (ALL 330 tables)

**ALL 330 table row counts match exactly** (automated diff of the full per-table fingerprint: `prodcounts` vs `restcounts` → 0 mismatches; 330 matched / 0 missing / 0 extra).

## K. FK / integrity validation (restored database, read-only)

- 514 FK constraints present in restore (same constraint set as production schema).
- Automated FK orphan scan over all 514 FKs found **5 non-zero orphan rows**:
  `branches.organisation_id -> organisations` (5) · `cms_section_blocks.page_id -> cms_pages` (16) · `products.category_id -> product_categories` (50) · `resource_attribute_values.resource_id -> resources` (10) · `user_role_scopes.user_role_id -> user_roles` (5).
- **Same 5 FKs were re-run directly against PRODUCTION (read-only): identical orphan counts (5/16/50/10/5).** Conclusion: these orphans are **pre-existing production data characteristics**, faithfully reproduced by the restore — they are NOT restore damage. (Flagged as a production data-hygiene REVIEW item for the cleanup phase; they touch KEEP-categorized tables and must be reviewed, not blindly deleted.)
- `SET FOREIGN_KEY_CHECKS` was never disabled during restore-verify; all analysis is read-only.
- Dump integrity: 330 `CREATE TABLE` statements, critical tables present (`users`, `organisations`, `migration_history`, `payment_transactions`, `ledger_entries`, `workflow_definitions`, `user_sessions`, `notifications`, `chart_of_accounts`, `user_wallets`), `Dump completed` trailer present, 135 INSERT groups.

## L. Warnings / errors

- Restore: exit 0, no stderr.
- Backup: exit 0, no stderr.
- The 5 orphan FK findings above = pre-existing production data characteristic (warning for cleanup planning, not a backup defect).
- No credentials or secrets appear in this report.

## M. Final verdict

```
BACKUP VERIFIED — RESTORE VERIFIED
```

---

### Completion notes
- No production deletion/truncation/update/insert/alter/drop/migration occurred.
- No local `courtzon_v3`, `courtzon_v2`, XAMPP/3306, application code, Docker application containers, Git, or configuration were touched.
- The restore target is an isolated database in a separate environment; it remains available for further verification and can be dropped later by an operator decision (not performed here).
- Cleanup is NOT executed and remains `AWAITING FINAL HUMAN APPROVAL` per `40_PRODUCTION_CLEANUP_PLAN.md`.