# Phase 2: Baseline Certification

**Date:** 2026-06-24
**Status:** PASSED
**Target:** MySQL 8.0.46 (Docker, port 3307)

## Summary

The baseline schema `database/baseline/001_courtzon_v3.sql` imports successfully on MySQL 8.0 after one fix. All schema objects verified.

## Import Results

| Object Type | Expected | Actual | Status |
|------------|----------|--------|--------|
| Tables     | 163      | 163    | PASS   |
| Foreign Keys | 211   | 211    | PASS   |
| Triggers   | 4        | 4      | PASS   |
| Events     | 2        | 2      | PASS   |
| Views      | 0        | 0      | PASS   |
| Procedures | 0        | 0      | PASS   |
| Functions  | 0        | 0      | PASS   |

## Defect Found & Fixed

### D1: STORED generated column blocks FK on MySQL 8.0 (FIXED)

**Root Cause:** MySQL 8.0 refuses to create a foreign key on a column that serves as the base for a STORED generated column (error 3192: "Cannot add foreign key on the base column of stored column").

The `roles` table had:
```sql
`org_id_normalized` int unsigned GENERATED ALWAYS AS (ifnull(`organisation_id`,0)) STORED,
...
CONSTRAINT `fk_role_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
```

MySQL 8.0 considers `organisation_id` the "base column" of the STORED column `org_id_normalized`, and rejects the FK.

**Fix:** Changed `STORED` to `VIRTUAL` on `org_id_normalized`. The UNIQUE KEY `uk_role_org_slug (org_id_normalized, slug)` continues to work correctly with VIRTUAL — MySQL 8.0 allows UNIQUE keys on VIRTUAL generated columns. The FK `fk_role_org` now creates successfully.

**Impact:** None. The column is used only for the UNIQUE constraint (ensuring slug uniqueness per organization), which works identically with VIRTUAL.

**Line:** `database/baseline/001_courtzon_v3.sql:2622`

## Triggers Verified

| Trigger                     | Table           | Event | Timing | Purpose                       |
|-----------------------------|-----------------|-------|--------|-------------------------------|
| `trg_order_after_insert`    | orders          | INSERT| AFTER  | Post-order processing         |
| `trg_order_status_change`   | orders          | UPDATE | AFTER | Status change audit           |
| `trg_audit_org_update`      | organisations   | UPDATE | AFTER | Org change audit log          |
| `trg_audit_user_update`     | users           | UPDATE | AFTER | User change audit log         |

## Events Verified

| Event                          | Type     | Status  | Purpose                    |
|--------------------------------|----------|---------|----------------------------|
| `ev_cleanup_expired_sessions`  | RECURRING| ENABLED| Cleanup expired sessions   |
| `ev_process_notification_queue`| RECURRING| ENABLED| Process notification queue |

## Edge Cases Checked

- Foreign keys with ON DELETE CASCADE propagate correctly
- CHAR(36) UUID columns (public_id) work across MariaDB→MySQL 8.0
- JSON CHECK constraints (`json_valid()`) validated
- ENUM columns imported without truncation
- Timestamp defaults (`current_timestamp()`, `ON UPDATE`) preserved
- `utf8mb4` character set and `utf8mb4_unicode_ci` collation consistent across all tables
- DROP TABLE IF EXISTS guards before each CREATE TABLE (idempotent import)

## Remediation Applied

1. **Changed `org_id_normalized` from STORED to VIRTUAL** in `database/baseline/001_courtzon_v3.sql:2622`
   - Fixes MySQL 8.0 error 3192 (base column of stored column cannot have FK)
   - No functional impact — column used only in UNIQUE constraint which works with VIRTUAL
   - No other STORED generated columns found in the entire baseline

## Conclusion

Baseline schema imports cleanly on MySQL 8.0 with all 163 tables, 211 foreign keys, 4 triggers, and 2 events. One MariaDB-to-MySQL-8.0 incompatibility (STORED generated column + FK) identified and resolved. Baseline is certified for MySQL 8.0 deployment.
