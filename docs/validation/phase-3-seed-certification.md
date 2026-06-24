# Phase 3: Seed Certification

**Date:** 2026-06-24
**Status:** PASSED (1 minor comment issue)
**Target:** MySQL 8.0.46 (Docker, port 3307) — baseline pre-imported

## Summary

Seed file `database/seeds/001_baseline.sql` imports successfully on MySQL 8.0 after baseline. All reference data loads cleanly with zero errors. Data is internally consistent — all FK references resolve.

## Import Results

Seed imported with `SET FOREIGN_KEY_CHECKS=0` (standard practice for circular dependencies in seed data).

| Table                  | Expected | Imported | Status |
|------------------------|----------|----------|--------|
| users                  | 3        | 3        | PASS   |
| roles                  | 9        | 9        | PASS   |
| user_roles             | 5        | 5        | PASS   |
| role_permissions       | 1144     | 1144     | PASS   |
| permissions            | 555      | 555      | PASS   |
| permission_modules     | 30       | 30       | PASS   |
| organisations          | 1        | 1        | PASS   |
| branches               | 2        | 2        | PASS   |
| countries              | 8        | 8        | PASS   |
| cities                 | 333      | 333      | PASS   |
| sports                 | 16       | 16       | PASS   |
| translations           | 286      | 286      | PASS   |
| design_tokens          | 159      | 159      | PASS   |
| subscription_plans     | 7        | 7        | PASS   |
| system_settings        | 25       | 25       | PASS   |
| All other tables       | —        | —        | PASS   |

## Internal Consistency Verified

**User-Role-Org chain:**
- User 1 (Mohamed Niazy) → role 1 (Super Admin) ✓
- User 51 (Mohamed Niazy) → role 2 (Player) + role 6 (Shop Admin) ✓
- User 68 (Hicham Gamal) → role 2 (Player) + role 1052 (Org Admin for org 6) ✓
- Organisation 6 (Padel Edge) → owner_id=68 → user 68 exists ✓
- Role 1052 → organisation_id=6 → org 6 exists ✓
- Role 1052 `org_id_normalized` = 6 (VIRTUAL column works correctly) ✓

**Super admin login:** User 1 has pbkdf2-sha512 password hash, email `mniazyy@gmail.com` ✓

## Issues Found

### I1: Stale row count comment (COSMETIC)
The seed file header comment says `-- Table: roles (17 rows)` but only 9 rows are actually inserted. The comment was not updated when roles were pruned during seed export.

**Severity:** Cosmetic. Does not affect import or data integrity.
**Fix:** Update comment to `(9 rows)` at line 2446.

## Edge Cases Checked

- `INSERT IGNORE` correctly handles idempotent re-runs (no duplicate key errors)
- `SET FOREIGN_KEY_CHECKS = 0` allows circular FK references (role_permissions → roles before roles are seeded)
- AUTO_INCREMENT values are correctly reset after each table (ALTER TABLE ... AUTO_INCREMENT = X)
- VIRTUAL generated column `org_id_normalized` on roles table works correctly during INSERT (computed from NULL → 0)
- Arabic text in translations/amenities names preserved correctly
- JSON values in app_settings import without corruption
- Timestamp values preserved correctly across timezone handling

## Conclusion

Seed data imports cleanly and is internally consistent. All reference data (permissions, roles, users, organizations, translations, system settings) loads correctly. One stale comment identified (non-blocking). Seed data certified for deployment.
