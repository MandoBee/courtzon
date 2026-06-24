# UTF-8 Encoding Validation — Arabic Text

**Date:** 2026-06-25
**Status:** ✅ FIXED
**Root Cause:** Type A — Source files corrupted (seed file exported from V2 with wrong encoding)

---

## Root Cause Investigation

### Classification: **A — Source files corrupted**

The corruption occurred when the V2 database was exported to the V3 seed file (`database/seeds/001_baseline.sql`). The export script connected to the V2 database but the resulting SQL file contained double-encoded UTF-8 (Latin-1 mojibake).

The V2 database on XAMPP (MariaDB 10.4) had **proper Arabic** — verified by querying directly with `--default-character-set=utf8mb4`:

| Table | Column | Value |
|-------|--------|-------|
| languages | native_name | `العربية` |
| countries | native_name | `مصر` |
| translations | value | `كورت زون` |

But the seed file generated during the V2→V3 migration contained mojibake like `Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©` instead of `العربية`. This is classic double UTF-8 encoding: original Arabic bytes (e.g. `D8 B9` for ع) were interpreted as Latin-1 characters (`Ø` and `¹`) and then re-encoded to UTF-8 (`C3 98` and `C2 B9`).

The corruption was NOT in:
- Database charset settings (utf8mb4/utf8mb4_unicode_ci verified at all levels)
- Table charset definitions (all textual columns use utf8mb4_unicode_ci)
- Backend MySQL connection pool (`charset: 'utf8mb4'` in mysql.ts)
- Runtime API responses (Content-Type: application/json; charset=utf-8)

### Files Inspected

| File | Finding |
|------|---------|
| `database/seeds/001_baseline.sql` (old) | **Corrupted** — 0 proper Arabic chars, mojibake throughout |
| `database/seeds/001_baseline.sql` (new) | **Clean** — 4,032 proper Arabic chars |
| `database/baseline/001_courtzon_v3.sql` | Not affected (schema-only, no data) |
| `courtron_v2` (XAMPP MariaDB) | **Clean** — source of truth |
| `courtron_v3` (Docker MySQL 8.0) | **Now clean** — reimported from clean source |
| `backend/src/database/mysql.ts` | Correct — `charset: 'utf8mb4'` |
| `backend/src/app.ts` | Correct — no encoding-affecting middleware |

### Database Verification

```
Database:       utf8mb4 / utf8mb4_unicode_ci
Server:         utf8mb4 / utf8mb4_unicode_ci
Translations:   utf8mb4_unicode_ci (all text columns)
Countries:      utf8mb4_unicode_ci (all text columns)
Languages:      utf8mb4_unicode_ci (all text columns)
CMS pages:      utf8mb4_unicode_ci (all text columns)
```

## Fix Applied

### 1. Re-exported clean seed from V2 source

```bash
mysqldump --default-character-set=utf8mb4 --no-create-info --complete-insert \
  courtron_v2 [all seed tables] > v2_full_seed.sql
```

Invoked via `cmd.exe` (not PowerShell) to avoid console encoding corruption.

### 2. Post-processed for V3 compatibility

- Removed `org_id_normalized` from roles column list (VIRTUAL generated column in V3)
- Replaced explicit values with `DEFAULT`
- Updated header references (`courtzon_v2` → `courtzon_v3`)

### 3. Recreated V3 database

```
DROP DATABASE courtzon_v3
CREATE DATABASE courtzon_v3 DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci
Import baseline schema (001_courtzon_v3.sql)
Import clean seed data
```

### 4. Replaced corrupted seed file

New `database/seeds/001_baseline.sql`: 945 KB, 4,032 Arabic characters, zero mojibake.

## Before / After

| Metric | Before | After |
|--------|--------|-------|
| Arabic in seed file | 0 (mojibake) | 4,032 |
| Arabic in API response | 0 | 2,580 |
| languages.native_name | `Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©` | `العربية` |
| countries.native_name (Egypt) | `U.O�O�` | `مصر` |
| translations (ar locale) | All mojibake | All correct |

### Sample Verification Queries

```sql
SELECT native_name FROM languages WHERE id = 2;
-- Result: العربية

SELECT native_name FROM countries WHERE id = 1;
-- Result: مصر

SELECT value FROM translations WHERE locale = 'ar' AND `key` = 'site.title';
-- Result: كورت زون
```

### API Verification

```
GET /public/translations/ar
Content-Type: application/json; charset=utf-8
Arabic translations: 284 keys
Sample: "site.title": "كورت زون"
```

## Impact

- All 4,032 Arabic characters in translations, countries, and languages are now valid UTF-8
- Seed file is the single source of truth — every future deployment imports clean Arabic
- No manual row patches were applied; the fix is at the source level
- The V2 database (XAMPP) was never modified; it served as the clean reference

## Prevention

To prevent recurrence when regenerating the seed:

1. Always run `mysqldump` with `--default-character-set=utf8mb4`
2. Use `cmd.exe` pipe (not PowerShell) when redirecting to file on Windows
3. Verify seed file Arabic character count after export:
   ```bash
   grep -c '[\u0600-\u06FF]' database/seeds/001_baseline.sql
   ```
4. Add UTF-8 validation to the export script (`export-baseline-seed.mjs`)
